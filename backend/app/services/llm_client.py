"""One place that talks to the language model, so every narrative service
shares the same enablement check, error memory and lazy import.

The model is used ONLY to phrase or propose; every number, score, rank, weight
bound and citation is produced or validated by deterministic code around it.
Tests replace `call_json` (or the per-service `_call_llm`) with mocks; CI
never calls the network.
"""
from __future__ import annotations

import logging
import time

from app.config.settings import get_settings

log = logging.getLogger(__name__)

LLM_ERROR_TTL_S = 600
_last_error: tuple[float, str] | None = None


def enabled() -> bool:
    s = get_settings()
    return bool(s.anthropic_api_key) and s.llm_provider.lower() == "anthropic"


def model_name() -> str:
    return get_settings().llm_model


def record_error(exc: BaseException) -> None:
    global _last_error
    _last_error = (time.time(), f"{type(exc).__name__}: {exc}")
    log.warning("llm: call failed (%s)", _last_error[1][:200])


def status() -> str:
    """configured | unconfigured | error (a call failed within LLM_ERROR_TTL_S)."""
    if not enabled():
        return "unconfigured"
    if _last_error and time.time() - _last_error[0] < LLM_ERROR_TTL_S:
        return "error"
    return "configured"


def last_error() -> str | None:
    return _last_error[1] if _last_error else None


def call_json(system: str, user: str, schema: dict, max_tokens: int = 2048) -> str:
    """Returns the model's text for a JSON-schema constrained request. Raises on
    any failure (import, auth, network, refusal, empty)."""
    import anthropic  # lazy: optional dependency from requirements-ai.txt

    s = get_settings()
    client = anthropic.Anthropic(api_key=s.anthropic_api_key, timeout=30.0, max_retries=1)
    resp = client.messages.create(
        model=s.llm_model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
        output_config={"format": {"type": "json_schema", "schema": schema}},
    )
    if getattr(resp, "stop_reason", None) == "refusal":
        raise RuntimeError("model refused the request")
    text = "".join(getattr(b, "text", "") for b in resp.content if getattr(b, "type", "") == "text")
    if not text.strip():
        raise RuntimeError("model returned no text")
    return text
