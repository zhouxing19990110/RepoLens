from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_built_frontend_and_api_coexist_under_proxy_prefix(tmp_path):
    (tmp_path / "index.html").write_text('<script src="/repolens/assets/app.js"></script>')
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app.js").write_text("console.log('RepoLens')")
    (tmp_path / ".env").write_text("private-value")
    settings = Settings(_env_file=None, root_path="/repolens", static_dir=tmp_path)
    with TestClient(create_app(settings)) as client:
        assert client.get("/repolens/").status_code == 200
        assert client.get("/repolens/assets/app.js").status_code == 200
        assert client.get("/api/health").json() == {"status": "ok"}
        assert client.get("/repolens/api/health").json() == {"status": "ok"}
        for path in (".env", "Dockerfile", "backend/app/config.py", "api/unknown", "assets/missing.js"):
            response = client.get(f"/repolens/{path}")
            assert response.status_code == 404
            assert "private-value" not in response.text
