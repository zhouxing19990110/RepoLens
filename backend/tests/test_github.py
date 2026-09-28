import asyncio

import httpx
import pytest

from app.errors import RepoLensError
from app.github import GitHubClient


@pytest.mark.asyncio
async def test_repository_uses_fixed_host_headers_and_no_redirects():
    def handler(request):
        assert request.url.host == "api.github.com"
        assert request.url.path == "/repos/a/b"
        assert request.headers["accept"] == "application/vnd.github+json"
        assert request.headers["authorization"] == "Bearer secret"
        return httpx.Response(200, json={"full_name": "a/b"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        assert await GitHubClient(http, "secret").repository("a", "b") == {"full_name": "a/b"}


@pytest.mark.asyncio
@pytest.mark.parametrize("status,headers,expected,retry", [
    (404, {}, 404, None),
    (429, {"retry-after": "30"}, 429, 30),
    (403, {"x-ratelimit-remaining": "0", "retry-after": "12"}, 429, 12),
    (403, {}, 502, None),
    (401, {}, 502, None),
    (500, {}, 502, None),
    (302, {"location": "https://evil.example/"}, 502, None),
])
async def test_status_mapping(status, headers, expected, retry):
    requests = []

    def handler(request):
        requests.append(request)
        assert request.url.host == "api.github.com"
        return httpx.Response(status, headers=headers, json={"message": "secret upstream detail"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        with pytest.raises(RepoLensError) as caught:
            await GitHubClient(http, None).repository("a", "b")
    assert caught.value.status_code == expected
    assert caught.value.retry_after_seconds == retry
    assert "secret" not in caught.value.message
    assert len(requests) == 1


@pytest.mark.asyncio
async def test_timeout_and_malformed_json():
    def timeout(request):
        raise httpx.ReadTimeout("secret", request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(timeout)) as http:
        with pytest.raises(RepoLensError) as caught:
            await GitHubClient(http, None).repository("a", "b")
        assert caught.value.status_code == 504

    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, text="not json"))) as http:
        with pytest.raises(RepoLensError) as caught:
            await GitHubClient(http, None).repository("a", "b")
        assert caught.value.status_code == 502


@pytest.mark.asyncio
async def test_languages_and_search_issue_pr_counts():
    def handler(request):
        if request.url.path.endswith("/languages"):
            return httpx.Response(200, json={"Python": 10})
        assert request.url.path == "/search/issues"
        assert request.url.params["per_page"] == "1"
        assert request.url.params["q"] in {"repo:a/b is:open is:issue", "repo:a/b is:open is:pr"}
        return httpx.Response(200, json={"total_count": 3, "incomplete_results": False})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        github = GitHubClient(http, None)
        assert await github.languages("a", "b") == {"Python": 10}
        assert await github.count_open("a", "b", "issue") == 3
        assert await github.count_open("a", "b", "pr") == 3


@pytest.mark.asyncio
@pytest.mark.parametrize("payload", [
    {"total_count": 8, "incomplete_results": True},
    {"total_count": "8", "incomplete_results": False},
    {"total_count": 8},
])
async def test_incomplete_or_malformed_counts_are_unavailable(payload):
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, json=payload))) as http:
        with pytest.raises(RepoLensError) as caught:
            await GitHubClient(http, None).count_open("a", "b", "issue")
    assert caught.value.status_code == 502


@pytest.mark.asyncio
@pytest.mark.parametrize("status,payload,expected", [
    (202, None, ("pending", [])),
    (204, None, ("empty", [])),
    (200, [], ("empty", [])),
    (200, [{"week": 123, "total": 4}], ("available", [{"week": 123, "total": 4}])),
])
async def test_activity_status(status, payload, expected):
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(status, json=payload) if payload is not None else httpx.Response(status))) as http:
        assert await GitHubClient(http, None).activity("a", "b") == expected


@pytest.mark.asyncio
async def test_readme_missing_and_bounded_raw_content():
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(404))) as http:
        assert await GitHubClient(http, None).readme("a", "b") == ("empty", "")

    def handler(request):
        assert request.url.path == "/repos/a/b/readme"
        assert request.headers["accept"] == "application/vnd.github.raw+json"
        return httpx.Response(200, content=b"x" * (65536 + 100))

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        state, content = await GitHubClient(http, None).readme("a", "b")
    assert state == "available"
    assert len(content) <= 12000
    assert "truncat" in content.lower()


@pytest.mark.asyncio
async def test_readme_redirect_and_invalid_identifier_never_leave_fixed_host():
    requests = []

    def handler(request):
        requests.append(request)
        assert request.url.host == "api.github.com"
        return httpx.Response(302, headers={"location": "https://evil.example/"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler), follow_redirects=True) as http:
        github = GitHubClient(http, None)
        with pytest.raises(RepoLensError) as caught:
            await github.readme("a", "b")
        assert caught.value.status_code == 502
        with pytest.raises(RepoLensError) as caught:
            await github.repository("a/b", "c")
        assert caught.value.status_code == 422
    assert len(requests) == 1


@pytest.mark.asyncio
async def test_malformed_activity_is_unavailable():
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, json={"week": 123}))) as http:
        with pytest.raises(RepoLensError) as caught:
            await GitHubClient(http, None).activity("a", "b")
    assert caught.value.status_code == 502


@pytest.mark.asyncio
async def test_concurrent_calls_are_limited_to_four():
    active = 0
    peak = 0

    async def handler(request):
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0.01)
        active -= 1
        return httpx.Response(200, json={})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        github = GitHubClient(http, None)
        await asyncio.gather(*(github.repository("a", "b") for _ in range(12)))
    assert peak == 4
