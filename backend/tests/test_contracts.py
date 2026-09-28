from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings
from app.errors import RepoLensError
from app.main import create_app
from app.repository_url import parse_repository_url
from app.schemas import Analysis, Assessment, Dimension, RepositoryRequest


def test_normalizes_repository_url():
    assert parse_repository_url("https://github.com/OpenAI/example.git/") == ("openai", "example")
    assert parse_repository_url("  https://github.com/Owner/Repo  ") == ("owner", "repo")
    assert parse_repository_url("https://github.com:443/A/B") == ("a", "b")


@pytest.mark.parametrize("url", [
    "http://github.com/a/b", "https://example.com/a/b",
    "https://user@github.com/a/b", "https://user:pass@github.com/a/b",
    "https://github.com:8443/a/b", "https://github.com:/a/b", "https://github.com/a/b/tree/main",
    "https://github.com/a/b?x=1", "https://github.com/a/b#readme",
    "https://github.com/a%2Fb/c", "https://github.com/a/b%2Fc",
    "https://github.com/a\\b/c", "https://github.com/a/\tb", "https://github.com/a/\nb", "https://github.com//b",
    "https://github.com/a/", "https://github.com/a/b/extra",
    "https://github.com/a/.git", "https://github.com/a/b.git.git",
])
def test_rejects_unsupported_urls(url):
    with pytest.raises(RepoLensError) as error:
        parse_repository_url(url)
    assert error.value.code == "invalid_url"
    assert error.value.status_code == 422


def test_settings_are_optional_and_ai_requires_all_fields(monkeypatch):
    for name in ("GITHUB_TOKEN", "AI_API_KEY", "AI_BASE_URL", "AI_MODEL"):
        monkeypatch.delenv(name, raising=False)
    settings = Settings(_env_file=None)
    assert settings.github_token == ""
    assert not settings.ai_available
    assert Settings(ai_api_key="secret", ai_base_url="https://ai.example/v1", ai_model="model", _env_file=None).ai_available
    assert not Settings(ai_api_key="secret", ai_base_url="", ai_model="model", _env_file=None).ai_available
    for url in ("http://ai.example/v1", "https://user:password@ai.example/v1", "https://ai.example:broken/v1", "https://ai.example/v1?key=x"):
        assert not Settings(ai_api_key="secret", ai_base_url=url, ai_model="model", _env_file=None).ai_available


def test_request_forbids_provider_configuration():
    with pytest.raises(ValidationError):
        RepositoryRequest(url="https://github.com/a/b", ai_base_url="https://attacker.example")


def test_health_and_sanitized_errors(monkeypatch):
    monkeypatch.setenv("GITHUB_TOKEN", "private-github-token")
    monkeypatch.setenv("AI_API_KEY", "private-ai-key")
    app = create_app()

    @app.post("/test-validation")
    def test_validation(payload: RepositoryRequest):
        return payload

    @app.get("/test-internal-error")
    def test_internal_error():
        raise RuntimeError("private-github-token private-ai-key")

    client = TestClient(app)
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    for response in (client.post("/test-validation", json={}), client.get("/unknown")):
        assert "private-github-token" not in response.text
        assert "private-ai-key" not in response.text
    internal = TestClient(app, raise_server_exceptions=False).get("/test-internal-error")
    assert internal.status_code == 500
    assert internal.json() == {"error": {"code": "internal_error", "message": "An unexpected error occurred.", "retry_after_seconds": None}}
    assert "private-github-token" not in internal.text
    assert "private-ai-key" not in internal.text
    invalid = client.post("/test-validation", json={})
    assert invalid.status_code == 422
    assert invalid.json() == {"error": {"code": "invalid_request", "message": "Check the request fields and try again.", "retry_after_seconds": None}}


def test_domain_error_envelope_has_retry_guidance():
    app = create_app()

    @app.get("/test-domain-error")
    def test_route():
        raise RepoLensError("upstream_rate_limited", "Try again later.", 429, 60)

    response = TestClient(app).get("/test-domain-error")
    assert response.status_code == 429
    assert response.json() == {"error": {"code": "upstream_rate_limited", "message": "Try again later.", "retry_after_seconds": 60}}


def test_schema_bounds_and_utc_datetimes():
    with pytest.raises(ValidationError):
        Dimension(score=101, explanation="ok", evidence=[])
    with pytest.raises(ValidationError):
        Dimension(score=55.5, explanation="ok", evidence=[])
    with pytest.raises(ValidationError):
        Analysis(
            full_name="a/b", url="https://github.com/a/b", description=None,
            license=None, pushed_at=None, stars=0, forks=0, open_issues=None,
            open_pull_requests=None, languages=[], activity=[],
            availability={"issues": "wrong"}, warnings=[],
            retrieved_at=datetime.now(timezone.utc), ai_available=False,
        )
    with pytest.raises(ValidationError):
        Analysis(
            full_name="a/b", url="https://github.com/a/b", description=None,
            license=None, pushed_at=None, stars=0, forks=0, open_issues=None,
            open_pull_requests=None, languages=[], activity=[],
            availability={"issues": "available"}, warnings=[],
            retrieved_at=datetime.now(timezone.utc), ai_available=False,
        )
    with pytest.raises(ValidationError):
        Assessment(
            full_name="a/b", status="insufficient_evidence", overall_score=None,
            dimensions={}, evidence={}, limitations=[], provider="configured",
            model="example", assessed_at=datetime.now(timezone.utc),
        )
    assessment = Assessment(
        full_name="a/b", status="insufficient_evidence", overall_score=None,
        dimensions={name: Dimension(score=None, explanation="No evidence", evidence=[]) for name in ("maintenance", "documentation", "community")}, evidence={}, limitations=["No activity"],
        provider="configured", model="example", assessed_at=datetime.now(timezone.utc),
    )
    assert assessment.model_dump(mode="json")["assessed_at"].endswith("Z")
