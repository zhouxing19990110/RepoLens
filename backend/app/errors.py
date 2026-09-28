from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RepoLensError(Exception):
    code: str
    message: str
    status_code: int
    retry_after_seconds: int | None = None

    def __str__(self) -> str:
        return self.message
