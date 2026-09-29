from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


Availability = Literal["available", "empty", "pending", "unavailable"]
_AVAILABILITY_KEYS = frozenset(("issues", "pull_requests", "languages", "activity", "readme"))


class RepositoryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    url: str = Field(min_length=1, max_length=2048)


class AssessmentRequest(RepositoryRequest):
    language: Literal["zh", "en"] = "zh"


class Language(BaseModel):
    name: str
    bytes: int = Field(ge=0)
    percentage: float = Field(ge=0, le=100)


class CommitWeek(BaseModel):
    week_start: int
    commits: int = Field(ge=0)


class Analysis(BaseModel):
    full_name: str
    url: str
    description: str | None
    license: str | None
    pushed_at: datetime | None
    stars: int
    forks: int
    open_issues: int | None
    open_pull_requests: int | None
    languages: list[Language]
    activity: list[CommitWeek]
    availability: dict[str, Availability]
    warnings: list[str]
    retrieved_at: datetime
    ai_available: bool

    @model_validator(mode="after")
    def require_availability_keys(self) -> "Analysis":
        if frozenset(self.availability) != _AVAILABILITY_KEYS:
            raise ValueError("Availability must include the five public evidence fields.")
        return self

    @field_validator("pushed_at", "retrieved_at")
    @classmethod
    def normalize_datetime(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Datetime must include a timezone.")
        return value.astimezone(timezone.utc)


class Dimension(BaseModel):
    score: int | None = Field(default=None, ge=0, le=100, strict=True)
    explanation: str = Field(min_length=1, max_length=2000)
    evidence: list[str]


class Assessment(BaseModel):
    language: Literal["zh", "en"] = "zh"
    full_name: str
    status: Literal["assessed", "insufficient_evidence"]
    overall_score: int | None
    dimensions: dict[str, Dimension]
    evidence: dict[str, str]
    limitations: list[str]
    provider: str
    model: str
    assessed_at: datetime

    @model_validator(mode="after")
    def require_dimensions(self) -> "Assessment":
        if frozenset(self.dimensions) != frozenset(("maintenance", "documentation", "community")):
            raise ValueError("Assessment must include the three rubric dimensions.")
        return self

    @field_validator("assessed_at")
    @classmethod
    def normalize_datetime(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Datetime must include a timezone.")
        return value.astimezone(timezone.utc)
