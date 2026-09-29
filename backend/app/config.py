from __future__ import annotations

from pathlib import Path
from urllib.parse import urlsplit

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore")

    github_token: str = Field(default="", repr=False)
    ai_api_key: str = Field(default="", repr=False)
    ai_base_url: str = ""
    ai_model: str = ""
    root_path: str = ""
    static_dir: Path = Path(__file__).resolve().parents[2] / "frontend" / "dist"

    @property
    def ai_available(self) -> bool:
        if not (self.ai_api_key and self.ai_base_url and self.ai_model):
            return False
        if "?" in self.ai_base_url or "#" in self.ai_base_url:
            return False
        try:
            url = urlsplit(self.ai_base_url.rstrip("/"))
            url.port
        except ValueError:
            return False
        return bool(url.scheme == "https" and url.hostname and not (
            url.username or url.password or url.query or url.fragment
        ))
