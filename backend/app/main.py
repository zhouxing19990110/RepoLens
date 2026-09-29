from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .assessment import AssessmentService
from .cache import TTLCache
from .config import Settings
from .errors import RepoLensError
from .github import GitHubClient
from .repositories import RepositoryService
from .routes import router


def _error_response(code: str, message: str, status_code: int, retry_after_seconds: int | None = None) -> JSONResponse:
    headers = {"Retry-After": str(retry_after_seconds)} if retry_after_seconds is not None else None
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "retry_after_seconds": retry_after_seconds}},
        headers=headers,
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings if settings is not None else Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        async with httpx.AsyncClient(trust_env=False) as github_http, httpx.AsyncClient(trust_env=False) as ai_http:
            cache = TTLCache()
            app.state.github_client = github_http
            app.state.ai_client = ai_http
            app.state.cache = cache
            app.state.repository_service = RepositoryService(
                GitHubClient(github_http, resolved_settings.github_token),
                cache, resolved_settings.ai_available, lambda: datetime.now(timezone.utc),
            )
            app.state.assessment_service = AssessmentService(ai_http, resolved_settings)
            yield

    app = FastAPI(title="RepoLens", lifespan=lifespan, root_path=resolved_settings.root_path)
    app.state.settings = resolved_settings
    app.include_router(router)

    @app.exception_handler(RepoLensError)
    async def domain_error(_request: Request, error: RepoLensError) -> JSONResponse:
        return _error_response(error.code, error.message, error.status_code, error.retry_after_seconds)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, _error: RequestValidationError) -> JSONResponse:
        return _error_response("invalid_request", "Check the request fields and try again.", 422)

    @app.exception_handler(HTTPException)
    async def http_error(_request: Request, error: HTTPException) -> JSONResponse:
        if error.status_code == 404:
            return _error_response("not_found", "The requested endpoint was not found.", 404)
        return _error_response("http_error", "The request could not be completed.", error.status_code)

    @app.exception_handler(Exception)
    async def unexpected_error(_request: Request, _error: Exception) -> JSONResponse:
        return _error_response("internal_error", "An unexpected error occurred.", 500)

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    if (resolved_settings.static_dir / "index.html").is_file():
        @app.get("/", include_in_schema=False)
        async def frontend() -> FileResponse:
            return FileResponse(resolved_settings.static_dir / "index.html", headers={"Cache-Control": "no-cache"})

        assets = resolved_settings.static_dir / "assets"
        if assets.is_dir():
            app.mount("/assets", StaticFiles(directory=assets), name="assets")

    return app


app = create_app()
