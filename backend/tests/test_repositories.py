from datetime import datetime, timezone
import json

import httpx
import pytest

from app.assessment import AssessmentService
from app.cache import TTLCache
from app.config import Settings
from app.errors import RepoLensError
from app.repositories import RepositoryService, Snapshot


NOW = datetime(2026, 9, 28, 12, tzinfo=timezone.utc)


class StubGitHub:
    def __init__(self, metadata=None):
        self.metadata = metadata or {
            "full_name": "Owner/Repo", "private": False, "description": "A tool",
            "license": None, "pushed_at": "2026-09-20T10:00:00Z",
            "stargazers_count": 12, "forks_count": 3,
        }
        self.calls = []
        self.fail = set()
        self.activity_result = ("empty", [])
        self.readme_result = ("available", "Usage and setup")

    async def repository(self, owner, repo):
        self.calls.append(("repository", owner, repo))
        return {**self.metadata, "full_name": f"{owner}/{repo}"} if owner == "elsewhere" else self.metadata

    async def languages(self, owner, repo):
        self.calls.append(("languages", owner, repo))
        if "languages" in self.fail:
            raise RepoLensError("upstream_error", "Unavailable", 502)
        return {"Python": 75, "Shell": 25}

    async def count_open(self, owner, repo, kind):
        self.calls.append((kind, owner, repo))
        if kind in self.fail:
            raise RepoLensError("upstream_error", "Unavailable", 502)
        return 7 if kind == "issue" else 2

    async def activity(self, owner, repo):
        self.calls.append(("activity", owner, repo))
        if "activity" in self.fail:
            raise RepoLensError("upstream_error", "Unavailable", 502)
        return self.activity_result

    async def readme(self, owner, repo):
        self.calls.append(("readme", owner, repo))
        if "readme" in self.fail:
            raise RepoLensError("upstream_error", "Unavailable", 502)
        return self.readme_result


def service(github, cache=None, now=lambda: NOW):
    return RepositoryService(github, cache or TTLCache(), ai_available=True, now=now)


@pytest.mark.asyncio
async def test_aggregation_counts_percentages_and_evidence():
    github = StubGitHub()
    snapshot = await service(github).analyze("https://github.com/Owner/Repo")
    a = snapshot.analysis
    assert isinstance(snapshot, Snapshot)
    assert (a.full_name, a.url, a.description, a.license) == (
        "Owner/Repo", "https://github.com/Owner/Repo", "A tool", None)
    assert (a.open_issues, a.open_pull_requests, a.stars, a.forks) == (7, 2, 12, 3)
    assert [(x.name, x.bytes, x.percentage) for x in a.languages] == [
        ("Python", 75, 75), ("Shell", 25, 25)]
    assert a.availability == {"issues": "available", "pull_requests": "available", "languages": "available", "activity": "empty", "readme": "available"}
    assert a.ai_available is True and a.retrieved_at == NOW
    assert set(snapshot.evidence) == {"metadata", "activity", "readme", "community"}
    assert "Usage and setup" in snapshot.evidence["readme"]
    assert "license" in snapshot.evidence["metadata"].lower()
    assert "Usage and setup" not in str(a.model_dump())
    assert [c[0] for c in github.calls][0] == "repository"


@pytest.mark.asyncio
async def test_private_metadata_stops_before_optional_requests():
    github = StubGitHub({"full_name": "Owner/Repo", "private": True})
    with pytest.raises(RepoLensError) as caught:
        await service(github).analyze("https://github.com/Owner/Repo")
    assert caught.value.code == "repository_unavailable"
    assert github.calls == [("repository", "owner", "repo")]
    assert "private" not in caught.value.message.lower()


@pytest.mark.asyncio
async def test_optional_failures_are_partial_and_not_cached():
    github = StubGitHub()
    github.fail = {"issue", "activity", "readme"}
    cache = TTLCache()
    s = service(github, cache)
    first = await s.analyze("https://github.com/owner/repo")
    assert first.analysis.open_issues is None
    assert first.analysis.open_pull_requests == 2
    assert first.analysis.activity == []
    assert first.analysis.availability["issues"] == "unavailable"
    assert first.analysis.availability["activity"] == "unavailable"
    assert first.analysis.availability["readme"] == "unavailable"
    assert first.analysis.warnings
    assert "community" in first.evidence and "readme" not in first.evidence
    assert cache.get("owner/repo") is None
    github.fail.clear()
    await s.analyze("https://github.com/owner/repo")
    assert len([c for c in github.calls if c[0] == "repository"]) == 2


@pytest.mark.asyncio
async def test_pending_activity_retries_and_empty_readme_is_disclosed():
    github = StubGitHub()
    github.activity_result = ("pending", [])
    github.readme_result = ("empty", "")
    cache = TTLCache()
    s = service(github, cache)
    result = await s.analyze("https://github.com/owner/repo")
    assert result.analysis.availability["activity"] == "pending"
    assert result.analysis.availability["readme"] == "empty"
    assert "README" in result.evidence["metadata"]
    assert "readme" not in result.evidence
    assert cache.get("owner/repo") is None
    github.activity_result = ("empty", [])
    await s.analyze("https://github.com/owner/repo")
    assert len([c for c in github.calls if c[0] == "repository"]) == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("activity_state", ["pending", "unavailable"])
async def test_assessment_prompt_dates_metadata_without_activity(activity_state):
    github = StubGitHub()
    if activity_state == "pending":
        github.activity_result = ("pending", [])
    else:
        github.fail.add("activity")
    snapshot = await service(github).analyze("https://github.com/owner/repo")
    sent = []

    def handler(request):
        sent.append(json.loads(request.content))
        content = {"dimensions": {
            name: {"score": 50, "explanation": "Public evidence", "evidence": ["metadata"]}
            for name in ("maintenance", "documentation", "community")}, "limitations": []}
        return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(content)}}]})

    settings = Settings(_env_file=None, ai_api_key="test-key", ai_base_url="https://provider.example/v1", ai_model="test-model")
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        await AssessmentService(client, settings).assess(snapshot)

    prompt = json.loads(sent[0]["messages"][1]["content"])
    assert prompt == snapshot.evidence
    assert "2026-09-28T12:00:00+00:00" in prompt["metadata"]
    assert "activity" not in prompt


@pytest.mark.asyncio
async def test_complete_snapshot_cached_by_canonical_repository():
    github = StubGitHub()
    cache = TTLCache()
    s = service(github, cache)
    first = await s.analyze("https://github.com/Owner/Repo")
    assert await s.analyze("https://github.com/owner/repo.git") is first
    await s.analyze("https://github.com/elsewhere/repo")
    assert len([c for c in github.calls if c[0] == "repository"]) == 2
    assert cache.get("owner/repo") is first


def test_cache_expires_and_evicts_oldest():
    ticks = [0.0]
    cache = TTLCache(max_entries=2, clock=lambda: ticks[0])
    marker = object()
    cache.put("a", marker)
    ticks[0] = 1
    cache.put("b", marker)
    cache.put("c", marker)
    assert cache.get("a") is None
    assert cache.get("b") is marker
    ticks[0] = 302
    assert cache.get("b") is None
    assert cache.get("c") is None


@pytest.mark.asyncio
async def test_activity_uses_previous_twelve_completed_sunday_weeks():
    github = StubGitHub()
    current_sunday = datetime(2026, 9, 27, tzinfo=timezone.utc)
    end = int(current_sunday.timestamp())
    week = 7 * 24 * 60 * 60
    github.activity_result = ("available", [
        {"week": end - i * week, "total": i} for i in range(13)
    ])
    snapshot = await service(github).analyze("https://github.com/owner/repo")
    assert len(snapshot.analysis.activity) == 12
    assert snapshot.analysis.activity[0].week_start == end - 12 * week
    assert snapshot.analysis.activity[-1].week_start == end - week
    assert all(item.week_start != end for item in snapshot.analysis.activity)
    assert snapshot.analysis.warnings == []


@pytest.mark.asyncio
async def test_sunday_boundary_and_missing_bucket_keep_sparse_series_uncached():
    github = StubGitHub()
    sunday = datetime(2026, 9, 27, tzinfo=timezone.utc)
    end = int(sunday.timestamp())
    week = 7 * 24 * 60 * 60
    github.activity_result = ("available", [
        {"week": end - i * week, "total": i} for i in range(1, 13) if i != 4
    ])
    cache = TTLCache()
    snapshot = await service(github, cache, now=lambda: sunday).analyze("https://github.com/owner/repo")
    assert len(snapshot.analysis.activity) == 11
    assert end - 4 * week not in [item.week_start for item in snapshot.analysis.activity]
    assert any("incomplete" in warning for warning in snapshot.analysis.warnings)
    assert cache.get("owner/repo") is None


@pytest.mark.asyncio
async def test_readme_truncation_marker_preserved_in_internal_evidence():
    github = StubGitHub()
    marker = "\n[README truncated at the GitHub evidence limit]"
    github.readme_result = ("available", "x" * (12_000 - len(marker)) + marker)
    snapshot = await service(github).analyze("https://github.com/owner/repo")
    assert len(snapshot.evidence["readme"]) == 12_000
    assert snapshot.evidence["readme"].endswith(marker)
    assert marker not in snapshot.analysis.model_dump_json()
