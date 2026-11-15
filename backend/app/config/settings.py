"""Environment-based configuration. Every knob the deployment needs is here;
nothing else reads os.environ directly."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(REPO_DIR / ".env", BACKEND_DIR / ".env"), extra="ignore")

    app_version: str = "0.1.0"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    data_dir: Path = BACKEND_DIR / "data"
    profile_version: str = "v1"
    # The dropped-pin probe scores from terrain tiles already in the verified cache. Set
    # DISCOVERY_PROBE_FETCH=true on a local API to let it fetch missing Copernicus tiles on
    # demand; the default keeps the contract's rule that request handlers never acquire data.
    discovery_probe_fetch: bool = False
    # "anthropic" (Claude API, needs a key) or "ollama" (a local model, free)
    llm_provider: str = "anthropic"
    llm_model: str = "claude-opus-5-5"
    anthropic_api_key: str = ""
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "gemma4:26b-a4b-it-qat"
    ollama_think: bool = False
    # Seconds before a local answer is abandoned for the keyword reading.
    ollama_timeout_s: float = 30.0
    # How long Ollama keeps the model in memory after a request ("-1" = until
    # Ollama stops). Unloading frees ~15 GB but makes the next request slow.
    ollama_keep_alive: str = "-1"
    # Load the model and cache the prompt when the server starts.
    ollama_warmup: bool = True
    # A local model on CPU is slow, so by default it only reads the mission
    # objective (comma-separated: interpret, guidance, astro).
    ollama_features: str = "interpret"
    groq_api_key: str = ""
    embedding_backend: str = "local"
    vector_index_dir: Path = BACKEND_DIR / "data" / "index"

    @field_validator("data_dir", "vector_index_dir")
    @classmethod
    def _repo_relative(cls, v: Path) -> Path:
        """Relative paths in .env are relative to the repo root (as .env.example
        says), not to whichever directory the server was started from."""
        return v if v.is_absolute() else REPO_DIR / v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def config_dir(self) -> Path:
        return Path(__file__).resolve().parent


@lru_cache
def get_settings() -> Settings:
    return Settings()
