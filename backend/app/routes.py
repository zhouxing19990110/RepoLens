"""Public API routes and replaceable service dependencies."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from .assessment import AssessmentService
from .config import Settings
from .errors import RepoLensError
from .repositories import RepositoryService
from .schemas import Analysis, Assessment, AssessmentRequest, RepositoryRequest


router = APIRouter(prefix="/api/repositories")


def get_repository_service(request: Request) -> RepositoryService:
    return request.app.state.repository_service


def get_assessment_service(request: Request) -> AssessmentService:
    return request.app.state.assessment_service


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


@router.post("/analyze", response_model=Analysis)
async def analyze_repository(
    request: RepositoryRequest,
    repository_service: RepositoryService = Depends(get_repository_service),
) -> Analysis:
    snapshot = await repository_service.analyze(request.url)
    return snapshot.analysis


@router.post("/assess", response_model=Assessment)
async def assess_repository(
    request: AssessmentRequest,
    settings: Settings = Depends(get_settings),
    repository_service: RepositoryService = Depends(get_repository_service),
    assessment_service: AssessmentService = Depends(get_assessment_service),
) -> Assessment:
    if not settings.ai_available:
        raise RepoLensError("ai_unavailable", "AI assessment is not configured.", 503)
    snapshot = await repository_service.analyze(request.url)
    return await assessment_service.assess(snapshot, language=request.language)
