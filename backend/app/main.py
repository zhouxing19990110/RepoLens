from __future__ import annotations

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .config import Settings
from .errors import RepoLensError


def _error_response(code: str, message: str, status_code: int, retry_after_seconds: int | None = None) -> JSONResponse:
    headers = {"Retry-After": str(retry_after_seconds)} if retry_after_seconds is not None else None
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "retry_after_seconds": retry_after_seconds}},
        headers=headers,
    )


def create_app() -> FastAPI:
    app = FastAPI(title="RepoLens")
    app.state.settings = Settings()

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

    return app


app = create_app()
