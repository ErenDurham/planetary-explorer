import pytest
from fastapi.testclient import TestClient

from app.config.settings import get_settings
from app.main import app


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def _no_llm_from_local_env(monkeypatch):
    """Tests never depend on a developer's .env: no language model is
    configured unless a test sets one up itself (the CI baseline)."""
    s = get_settings()
    monkeypatch.setattr(s, "llm_provider", "anthropic")
    monkeypatch.setattr(s, "anthropic_api_key", "")
