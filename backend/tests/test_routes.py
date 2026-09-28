from fastapi.testclient import TestClient

from app.config import Settings
from app.errors import RepoLensError
from app.main import create_app


def test_analysis_success_and_partial_data_hides_readme_and_secrets(route_clients):
    client, repository, _ = route_clients
    response = client.post("/api/repositories/analyze", json={"url": "https://github.com/a/b"})
    assert response.status_code == 200
    body = response.json()
    assert body["full_name"] == "a/b"
    assert body["open_issues"] is None
    assert body["availability"]["activity"] == "pending"
    assert body["warnings"]
    assert body["retrieved_at"].endswith("Z")
    assert "README secret body" not in response.text
    assert "private-github-token" not in response.text
    assert "private-ai-key" not in response.text
    assert repository.calls == ["https://github.com/a/b"]


def test_assessment_success_uses_server_snapshot(route_clients):
    client, repository, assessment = route_clients
    response = client.post("/api/repositories/assess", json={"url": "https://github.com/a/b"})
    assert response.status_code == 200
    assert response.json()["overall_score"] == 70
    assert repository.calls == ["https://github.com/a/b"]
    assert assessment.calls[0].analysis.full_name == "a/b"


def test_request_validation_and_no_client_metrics(route_clients):
    client, repository, _ = route_clients
    for payload in ({}, {"url": "https://github.com/a/b", "stars": 1000000}):
        response = client.post("/api/repositories/assess", json=payload)
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "invalid_request"
    assert repository.calls == []


def test_missing_repository_and_rate_limit(route_clients):
    client, repository, _ = route_clients
    for error, status, code in (
        (RepoLensError("repository_not_found", "GitHub resource was not found.", 404), 404, "repository_not_found"),
        (RepoLensError("upstream_rate_limited", "GitHub rate limit reached. Try again later.", 429, 30), 429, "upstream_rate_limited"),
    ):
        repository.error = error
        response = client.post("/api/repositories/analyze", json={"url": "https://github.com/a/b"})
        assert response.status_code == status
        assert response.json()["error"]["code"] == code
        if status == 429:
            assert response.headers["retry-after"] == "30"


def test_ai_disabled_returns_safe_error_before_upstream(client_with_ai_disabled):
    client, repository, assessment = client_with_ai_disabled
    response = client.post("/api/repositories/assess", json={"url": "https://github.com/a/b"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "ai_unavailable"
    assert repository.calls == assessment.calls == []


def test_malformed_configured_ai_url_is_rejected_before_github_fetch(route_clients):
    client, repository, assessment = route_clients
    client.app.state.settings = Settings(
        ai_api_key="private-ai-key", ai_base_url="http://provider.example/v1",
        ai_model="model", _env_file=None,
    )
    response = client.post("/api/repositories/assess", json={"url": "https://github.com/a/b"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "ai_unavailable"
    assert repository.calls == assessment.calls == []


def test_lifespan_shares_services_and_closes_http_clients():
    app = create_app(Settings(_env_file=None))
    with TestClient(app) as client:
        assert client.get("/api/health").json() == {"status": "ok"}
        github_http = app.state.github_client
        ai_http = app.state.ai_client
        assert app.state.repository_service.github.client is github_http
        assert app.state.repository_service.cache is app.state.cache
        assert app.state.assessment_service.client is ai_http
        assert github_http._trust_env is False
        assert ai_http._trust_env is False
        assert not github_http.is_closed
        assert not ai_http.is_closed
    assert github_http.is_closed
    assert ai_http.is_closed
