"""Environment-based configuration. Every knob the deployment needs is here;
nothing else reads os.environ directly."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(REPO_DIR / ".env", BACKEND_DIR / ".env"), extra="ignore")

    app_version: str = "0.1.0"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    data_dir: Path = BACKEND_DIR / "data"
    profile_version: str = "v1"
    llm_provider: str = "anthropic"
    llm_model: str = "claude-sonnet-5"
    anthropic_api_key: str = ""
    embedding_backend: str = "local"
    vector_index_dir: Path = BACKEND_DIR / "data" / "index"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def config_dir(self) -> Path:
        return Path(__file__).resolve().parent


@lru_cache
def get_settings() -> Settings:
    return Settings()
