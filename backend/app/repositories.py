"""Aggregate public GitHub metrics into normalized, evidence-backed snapshots."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Callable

from .cache import TTLCache
from .errors import RepoLensError
from .github import GitHubClient
from .repository_url import parse_repository_url
from .schemas import Analysis, CommitWeek, Language

_WEEK_SECONDS = 7 * 24 * 60 * 60


@dataclass(frozen=True)
class Snapshot:
    analysis: Analysis
    evidence: dict[str, str]


def _invalid_metadata() -> RepoLensError:
    return RepoLensError("upstream_invalid", "GitHub returned invalid repository data.", 502)


def _nonnegative_int(value: object) -> int:
    if type(value) is not int or value < 0:
        raise _invalid_metadata()
    return value


def _timestamp(value: object) -> datetime | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise _invalid_metadata()
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise _invalid_metadata() from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise _invalid_metadata()
    return parsed.astimezone(timezone.utc)


def _completed_weeks(rows: list[dict], now: datetime) -> tuple[list[CommitWeek], bool]:
    current = now.astimezone(timezone.utc)
    sunday = (current - timedelta(days=(current.weekday() + 1) % 7)).replace(
        hour=0, minute=0, second=0, microsecond=0)
    end = int(sunday.timestamp())
    start = end - 12 * _WEEK_SECONDS
    weeks: dict[int, int] = {}
    malformed = False
    for row in rows:
        if not isinstance(row, dict):
            malformed = True
            continue
        week, total = row.get("week"), row.get("total")
        if type(week) is not int or type(total) is not int or total < 0 or (week - 259_200) % _WEEK_SECONDS != 0:
            malformed = True
            continue
        if start <= week < end:
            if week in weeks:
                malformed = True
            else:
                weeks[week] = total
    selected = [CommitWeek(week_start=week, commits=weeks[week]) for week in sorted(weeks)]
    return selected, malformed or len(selected) != 12


class RepositoryService:
    def __init__(self, github: GitHubClient, cache: TTLCache, ai_available: bool, now: Callable[[], datetime]):
        self.github = github
        self.cache = cache
        self.ai_available = ai_available
        self.now = now

    async def analyze(self, url: str) -> Snapshot:
        owner, repo = parse_repository_url(url)
        key = f"{owner}/{repo}"
        cached = self.cache.get(key)
        if cached is not None:
            return cached

        metadata = await self.github.repository(owner, repo)
        if metadata.get("private") is True:
            raise RepoLensError("repository_unavailable", "Repository is unavailable.", 404)
        if metadata.get("private") is not False:
            raise _invalid_metadata()
        full_name = metadata.get("full_name")
        if not isinstance(full_name, str) or full_name.lower() != key:
            raise _invalid_metadata()
        description = metadata.get("description")
        if description is not None and not isinstance(description, str):
            raise _invalid_metadata()
        license_data = metadata.get("license")
        if license_data is None:
            license_name = None
        elif isinstance(license_data, dict):
            license_name = license_data.get("spdx_id") or license_data.get("name")
            if not isinstance(license_name, str):
                raise _invalid_metadata()
        else:
            raise _invalid_metadata()
        stars = _nonnegative_int(metadata.get("stargazers_count"))
        forks = _nonnegative_int(metadata.get("forks_count"))
        pushed_at = _timestamp(metadata.get("pushed_at"))
        retrieved_at = self.now()
        if retrieved_at.tzinfo is None or retrieved_at.utcoffset() is None:
            raise ValueError("now must return an aware datetime")
        retrieved_at = retrieved_at.astimezone(timezone.utc)

        results = await asyncio.gather(
            self.github.count_open(owner, repo, "issue"),
            self.github.count_open(owner, repo, "pr"),
            self.github.languages(owner, repo),
            self.github.activity(owner, repo),
            self.github.readme(owner, repo),
            return_exceptions=True,
        )
        labels = ("issues", "pull_requests", "languages", "activity", "readme")
        availability = {label: "unavailable" for label in labels}
        warnings: list[str] = []
        complete = True
        for label, result in zip(labels, results):
            if isinstance(result, BaseException):
                warnings.append(f"{label.replace('_', ' ').capitalize()} data is unavailable from GitHub.")
                complete = False

        issues = results[0] if not isinstance(results[0], BaseException) else None
        pulls = results[1] if not isinstance(results[1], BaseException) else None
        if issues is not None:
            availability["issues"] = "available"
        if pulls is not None:
            availability["pull_requests"] = "available"

        languages: list[Language] = []
        language_bytes = results[2]
        if not isinstance(language_bytes, BaseException):
            total = sum(language_bytes.values())
            languages = [Language(name=name, bytes=size, percentage=100 * size / total)
                         for name, size in sorted(language_bytes.items(), key=lambda item: -item[1]) if total]
            availability["languages"] = "available" if total else "empty"

        activity: list[CommitWeek] = []
        activity_result = results[3]
        if not isinstance(activity_result, BaseException):
            state, rows = activity_result
            availability["activity"] = state
            if state == "available":
                activity, incomplete = _completed_weeks(rows, retrieved_at)
                if incomplete:
                    warnings.append("Commit activity has missing or invalid completed weeks; the series is incomplete.")
                    complete = False
            elif state == "pending":
                warnings.append("GitHub is preparing commit activity; refresh to retry.")
                complete = False

        readme = ""
        readme_result = results[4]
        if not isinstance(readme_result, BaseException):
            state, content = readme_result
            availability["readme"] = state
            readme = content[:12_000]

        metadata_evidence = [
            f"Repository: {full_name}.",
            f"Snapshot retrieved at: {retrieved_at.isoformat()} (UTC).",
            f"Description: {description}." if description else "Description is missing.",
            f"Stars: {stars}; forks: {forks}.",
            f"Last push: {pushed_at.isoformat()}." if pushed_at else "Last push time is unavailable.",
            f"License: {license_name}." if license_name else "License metadata is missing.",
        ]
        if availability["readme"] == "empty":
            metadata_evidence.append("README is missing or empty.")
        elif availability["readme"] == "unavailable":
            metadata_evidence.append("README availability could not be determined.")
        evidence = {"metadata": " ".join(metadata_evidence)}
        if availability["activity"] == "available":
            evidence["activity"] = "Completed UTC weeks (Unix start, commits): " + ", ".join(
                f"{item.week_start}: {item.commits}" for item in activity)
        elif availability["activity"] == "empty":
            evidence["activity"] = "GitHub confirmed no commit activity statistics."
        if availability["readme"] == "available" and readme:
            evidence["readme"] = readme
        if license_name:
            evidence["license"] = f"GitHub license metadata: {license_name}."
        community = []
        if issues is not None:
            community.append(f"Open issues: {issues}")
        if pulls is not None:
            community.append(f"Open pull requests: {pulls}")
        if community:
            evidence["community"] = "; ".join(community) + "."

        analysis = Analysis(
            full_name=full_name, url=f"https://github.com/{full_name}",
            description=description, license=license_name, pushed_at=pushed_at,
            stars=stars, forks=forks, open_issues=issues, open_pull_requests=pulls,
            languages=languages, activity=activity, availability=availability,
            warnings=warnings, retrieved_at=retrieved_at, ai_available=self.ai_available,
        )
        snapshot = Snapshot(analysis=analysis, evidence=evidence)
        if complete:
            self.cache.put(key, snapshot)
        return snapshot
