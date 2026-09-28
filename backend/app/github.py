"""Small, bounded client for the public GitHub REST API."""

from __future__ import annotations

import asyncio
import json
import re
from typing import Literal

import httpx

from .errors import RepoLensError
from .schemas import Availability


_BASE_URL = "https://api.github.com"
_NAME = re.compile(r"[A-Za-z0-9_.-]+\Z")
_README_BYTES = 64 * 1024
_README_CHARS = 12_000
_TRUNCATED = "\n[README truncated at the GitHub evidence limit]"


class GitHubClient:
    def __init__(self, client: httpx.AsyncClient, token: str | None):
        self.client = client
        self.token = token
        self._semaphore = asyncio.Semaphore(4)

    @property
    def headers(self) -> dict[str, str]:
        headers = {"Accept": "application/vnd.github+json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    @staticmethod
    def _repo_path(owner: str, repo: str) -> str:
        if not _NAME.fullmatch(owner) or not _NAME.fullmatch(repo) or owner in (".", "..") or repo in (".", ".."):
            raise RepoLensError("invalid_repository", "Invalid repository identifier.", 422)
        return f"/repos/{owner}/{repo}"

    @staticmethod
    async def _secondary_rate_limited(response: httpx.Response) -> bool:
        limit = 4096
        try:
            body = response.content
        except httpx.ResponseNotRead:
            bounded = bytearray()
            async for chunk in response.aiter_bytes():
                bounded.extend(chunk[:limit + 1 - len(bounded)])
                if len(bounded) > limit:
                    break
            body = bytes(bounded)
        if len(body) > limit:
            return False
        try:
            payload = json.loads(body)
        except (ValueError, UnicodeDecodeError):
            return False
        message = payload.get("message") if isinstance(payload, dict) else None
        return isinstance(message, str) and (
            "secondary rate limit" in message.lower()
            or "abuse detection mechanism" in message.lower()
        )

    @classmethod
    async def _raise_for_status(cls, response: httpx.Response) -> None:
        status = response.status_code
        if 200 <= status < 300:
            return
        if status == 404:
            raise RepoLensError("repository_not_found", "GitHub resource was not found.", 404)
        if status == 429 or (status == 403 and (
            response.headers.get("x-ratelimit-remaining") == "0"
            or "retry-after" in response.headers
            or await cls._secondary_rate_limited(response)
        )):
            retry_header = response.headers.get("retry-after", "")
            retry = int(retry_header) if retry_header.isdecimal() else None
            raise RepoLensError("upstream_rate_limited", "GitHub rate limit reached. Try again later.", 429, retry)
        raise RepoLensError("upstream_error", "GitHub could not provide this data.", 502)

    async def _get(self, path: str, *, params: dict[str, str] | None = None) -> httpx.Response:
        try:
            async with self._semaphore:
                response = await self.client.get(
                    _BASE_URL + path, params=params, headers=self.headers,
                    timeout=10.0, follow_redirects=False,
                )
        except httpx.TimeoutException as exc:
            raise RepoLensError("upstream_timeout", "GitHub request timed out.", 504) from exc
        except httpx.RequestError as exc:
            raise RepoLensError("upstream_error", "GitHub could not provide this data.", 502) from exc
        await self._raise_for_status(response)
        return response

    @staticmethod
    def _json(response: httpx.Response, expected: type) -> dict | list:
        try:
            data = response.json()
        except (ValueError, UnicodeDecodeError) as exc:
            raise RepoLensError("upstream_invalid", "GitHub returned invalid data.", 502) from exc
        if not isinstance(data, expected):
            raise RepoLensError("upstream_invalid", "GitHub returned invalid data.", 502)
        return data

    async def repository(self, owner: str, repo: str) -> dict:
        response = await self._get(self._repo_path(owner, repo))
        return self._json(response, dict)

    async def languages(self, owner: str, repo: str) -> dict[str, int]:
        response = await self._get(self._repo_path(owner, repo) + "/languages")
        data = self._json(response, dict)
        if any(not isinstance(k, str) or type(v) is not int or v < 0 for k, v in data.items()):
            raise RepoLensError("upstream_invalid", "GitHub returned invalid data.", 502)
        return data

    async def count_open(self, owner: str, repo: str, kind: Literal["issue", "pr"]) -> int:
        base = self._repo_path(owner, repo)
        if kind not in ("issue", "pr"):
            raise RepoLensError("invalid_repository", "Invalid search type.", 422)
        response = await self._get("/search/issues", params={
            "q": f"repo:{base.removeprefix('/repos/')} is:open is:{kind}",
            "per_page": "1",
        })
        data = self._json(response, dict)
        count = data.get("total_count")
        if data.get("incomplete_results") is not False or type(count) is not int or count < 0:
            raise RepoLensError("upstream_incomplete", "GitHub search results are incomplete.", 502)
        return count

    async def activity(self, owner: str, repo: str) -> tuple[Availability, list[dict]]:
        response = await self._get(self._repo_path(owner, repo) + "/stats/commit_activity")
        if response.status_code == 202:
            return "pending", []
        if response.status_code == 204:
            return "empty", []
        data = self._json(response, list)
        if any(not isinstance(item, dict) for item in data):
            raise RepoLensError("upstream_invalid", "GitHub returned invalid data.", 502)
        return ("available" if data else "empty"), data

    async def readme(self, owner: str, repo: str) -> tuple[Availability, str]:
        path = self._repo_path(owner, repo) + "/readme"
        headers = {**self.headers, "Accept": "application/vnd.github.raw+json"}
        content = bytearray()
        truncated = False
        try:
            async with self._semaphore:
                async with self.client.stream(
                    "GET", _BASE_URL + path, headers=headers,
                    timeout=10.0, follow_redirects=False,
                ) as response:
                    if response.status_code == 404:
                        return "empty", ""
                    await self._raise_for_status(response)
                    async for chunk in response.aiter_bytes():
                        remaining = _README_BYTES - len(content)
                        if len(chunk) > remaining:
                            content.extend(chunk[:remaining])
                            truncated = True
                            break
                        content.extend(chunk)
        except httpx.TimeoutException as exc:
            raise RepoLensError("upstream_timeout", "GitHub request timed out.", 504) from exc
        except httpx.RequestError as exc:
            raise RepoLensError("upstream_error", "GitHub could not provide this data.", 502) from exc

        decoded = bytes(content).decode("utf-8", errors="replace")
        if len(decoded) > _README_CHARS:
            decoded = decoded[:_README_CHARS]
            truncated = True
        if truncated:
            decoded = decoded[:_README_CHARS - len(_TRUNCATED)] + _TRUNCATED
        return ("available" if decoded else "empty"), decoded
