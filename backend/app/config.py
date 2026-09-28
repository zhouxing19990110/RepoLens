from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore")

    github_token: str = Field(default="", repr=False)
    ai_api_key: str = Field(default="", repr=False)
    ai_base_url: str = ""
    ai_model: str = ""

    @property
    def ai_available(self) -> bool:
        return bool(self.ai_api_key and self.ai_base_url and self.ai_model)
