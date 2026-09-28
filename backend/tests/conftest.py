import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.repositories import Snapshot
from app.schemas import Analysis, Assessment, Dimension
from app.routes import get_assessment_service, get_repository_service


@pytest.hookimpl(tryfirst=True)
def pytest_configure(config):
    # Keep async fixtures on function-scoped event loops across pytest-asyncio upgrades.
    config.inicfg.setdefault("asyncio_default_fixture_loop_scope", "function")


@pytest.fixture
def route_snapshot():
    now = datetime(2026, 9, 28, tzinfo=timezone.utc)
    return Snapshot(
        analysis=Analysis(
            full_name="a/b", url="https://github.com/a/b", description="Sample",
            license=None, pushed_at=None, stars=2, forks=1,
            open_issues=None, open_pull_requests=3, languages=[], activity=[],
            availability={"issues": "unavailable", "pull_requests": "available",
                          "languages": "empty", "activity": "pending", "readme": "available"},
            warnings=["Issues data is unavailable from GitHub."],
            retrieved_at=now, ai_available=True,
        ),
        evidence={"readme": "README secret body", "metadata": "metadata"},
    )


@pytest.fixture
def route_clients(route_snapshot):
    class RepositoryStub:
        calls = []
        error = None

        async def analyze(self, url):
            self.calls.append(url)
            if self.error:
                raise self.error
            return route_snapshot

    class AssessmentStub:
        calls = []

        async def assess(self, snapshot):
            self.calls.append(snapshot)
            return Assessment(
                full_name="a/b", status="assessed", overall_score=70,
                dimensions={name: Dimension(score=70, explanation="Evidence", evidence=["metadata"])
                            for name in ("maintenance", "documentation", "community")},
                evidence={"metadata": "metadata"}, limitations=[], provider="ai.example",
                model="test-model", assessed_at=datetime(2026, 9, 28, tzinfo=timezone.utc),
            )

    repository = RepositoryStub()
    assessment = AssessmentStub()
    settings = Settings(ai_api_key="private-ai-key", ai_base_url="https://ai.example/v1",
                        ai_model="test-model", github_token="private-github-token", _env_file=None)
    app = create_app(settings)
    app.dependency_overrides[get_repository_service] = lambda: repository
    app.dependency_overrides[get_assessment_service] = lambda: assessment
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client, repository, assessment


@pytest.fixture
def client_with_ai_disabled(route_clients):
    client, repository, assessment = route_clients
    client.app.state.settings = Settings(ai_api_key="", ai_base_url="", ai_model="", _env_file=None)
    return client, repository, assessment
