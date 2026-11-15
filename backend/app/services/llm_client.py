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

# Thinking is always on for the current models and its tokens count against
# max_tokens, so a small cap truncates the JSON. Never go below this.
MIN_MAX_TOKENS = 16000
REQUEST_TIMEOUT_S = 120.0
EFFORT = "medium"
# Models that take `output_config.effort` and the server-side refusal fallback.
_EFFORT_PREFIXES = ("claude-fable-5", "claude-mythos-5", "claude-opus-5", "claude-sonnet-5", "claude-haiku-5", "claude-opus-4-6", "claude-opus-4-7",
                    "claude-opus-4-8", "claude-sonnet-4-6")
_FALLBACK_MODELS = {"claude-fable-5-2", "claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"}
_FALLBACK_BETA = "server-side-fallback-2026-07-01"
# JSON-schema keywords structured outputs does not accept; the callers
# validate these bounds in code instead.
_UNSUPPORTED_KEYWORDS = {"minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "maxItems", "pattern"}


# Local model (Ollama). The answer is capped at OLLAMA_TIMEOUT_S (settings,
# default 30 s); the server warms the model and the cached prompt at start
# (warm_ollama), and OLLAMA_KEEP_ALIVE keeps it loaded between requests.
OLLAMA_NUM_CTX = 8192
OLLAMA_WARMUP_TIMEOUT_S = 600.0


def provider() -> str:
    return get_settings().llm_provider.strip().lower()


def enabled(feature: str | None = None) -> bool:
    """Whether a language model may be called, optionally for one feature
    ("interpret", "guidance"). Anthropic needs a key; Ollama needs nothing but
    is limited to the features listed in OLLAMA_FEATURES."""
    s = get_settings()
    if provider() == "anthropic":
        return bool(s.anthropic_api_key)
    if provider() == "ollama":
        return feature is None or feature in {f.strip() for f in s.ollama_features.split(",") if f.strip()}
    return False


def model_name() -> str:
    s = get_settings()
    return s.ollama_model if provider() == "ollama" else s.llm_model


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


def api_schema(schema):
    """Copy of `schema` without the keywords structured outputs rejects
    (minItems above 1 included)."""
    if isinstance(schema, dict):
        out = {}
        for k, v in schema.items():
            if k in _UNSUPPORTED_KEYWORDS or (k == "minItems" and isinstance(v, int) and v > 1):
                continue
            out[k] = {pk: api_schema(pv) for pk, pv in v.items()} if k in ("properties", "$defs") and isinstance(v, dict) else api_schema(v)
        return out
    if isinstance(schema, list):
        return [api_schema(x) for x in schema]
    return schema


def _call_ollama(system: str, user: str, schema: dict, max_tokens: int) -> str:
    """Local model through Ollama's chat API. `format` holds the JSON schema, so
    decoding is grammar-constrained: enums (e.g. evidence ids) cannot be
    invented. Temperature 0 keeps answers repeatable. The answer is streamed
    so OLLAMA_TIMEOUT_S is a hard total limit: past it the connection is
    closed, which also stops Ollama generating (the next request isn't held up)."""
    import json
    import time

    import httpx

    s = get_settings()
    body = {
        "model": s.ollama_model,
        "stream": True,
        "think": s.ollama_think,
        "keep_alive": _keep_alive(s.ollama_keep_alive),
        "format": api_schema(schema),
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "options": {"temperature": 0, "num_ctx": OLLAMA_NUM_CTX, "num_predict": max_tokens},
    }
    deadline = time.monotonic() + s.ollama_timeout_s
    too_slow = RuntimeError(f"local model took longer than {s.ollama_timeout_s:g} s (OLLAMA_TIMEOUT_S)")
    parts: list[str] = []
    done_reason = None
    try:
        with httpx.stream("POST", f"{s.ollama_url.rstrip('/')}/api/chat", json=body, timeout=httpx.Timeout(s.ollama_timeout_s, connect=5.0)) as r:
            if r.status_code == 404:
                raise RuntimeError(f"Ollama has no model '{s.ollama_model}'; run `ollama pull {s.ollama_model}`")
            r.raise_for_status()
            for line in r.iter_lines():
                if time.monotonic() > deadline:
                    raise too_slow
                if not line.strip():
                    continue
                chunk = json.loads(line)
                if chunk.get("error"):
                    raise RuntimeError(f"Ollama error: {chunk['error']}")
                parts.append((chunk.get("message") or {}).get("content") or "")
                if chunk.get("done"):
                    done_reason = chunk.get("done_reason")
                    break
    except httpx.ConnectError as e:
        raise RuntimeError(f"Ollama is not running at {s.ollama_url} (start it with `ollama serve` or `systemctl start ollama`)") from e
    except httpx.TimeoutException as e:
        raise too_slow from e
    if done_reason == "length":
        raise RuntimeError("model output was truncated (num_predict / num_ctx)")
    text = "".join(parts)
    if not text.strip():
        raise RuntimeError("model returned no text")
    return text


def _keep_alive(value: str) -> int | str:
    """Ollama takes a bare number as seconds (-1 = forever) and a string only
    with a unit ("30m")."""
    try:
        return int(value)
    except ValueError:
        return value


def warm_ollama(system: str, user: str) -> None:
    """Load the local model and fill its prompt cache with `system`: one token
    is generated, with the same context size as real requests (a different
    size would reload the model and drop the cache)."""
    import httpx

    s = get_settings()
    body = {"model": s.ollama_model, "stream": False, "think": s.ollama_think, "keep_alive": _keep_alive(s.ollama_keep_alive),
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "options": {"temperature": 0, "num_ctx": OLLAMA_NUM_CTX, "num_predict": 1}}
    r = httpx.post(f"{s.ollama_url.rstrip('/')}/api/chat", json=body, timeout=httpx.Timeout(OLLAMA_WARMUP_TIMEOUT_S, connect=5.0))
    r.raise_for_status()


def call_json(system: str, user: str, schema: dict, max_tokens: int = MIN_MAX_TOKENS) -> str:
    """Returns the model's text for a JSON-schema constrained request. Raises on
    any failure (import, auth, network, refusal, truncation, empty)."""
    if provider() == "ollama":
        return _call_ollama(system, user, schema, max_tokens)
    import anthropic  # lazy: optional dependency from requirements-ai.txt

    s = get_settings()
    client = anthropic.Anthropic(api_key=s.anthropic_api_key, timeout=REQUEST_TIMEOUT_S)
    output_config: dict = {"format": {"type": "json_schema", "schema": api_schema(schema)}}
    if s.llm_model.startswith(_EFFORT_PREFIXES):
        output_config["effort"] = EFFORT
    params = dict(
        model=s.llm_model,
        max_tokens=max(max_tokens, MIN_MAX_TOKENS),
        # the system prompt is static per service: cache it
        system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user}],
        output_config=output_config,
    )
    if s.llm_model in _FALLBACK_MODELS:
        # on a policy decline the API re-runs the request on a fallback model
        resp = client.beta.messages.create(**params, betas=[_FALLBACK_BETA], fallbacks="default")
    else:
        resp = client.messages.create(**params)
    stop = getattr(resp, "stop_reason", None)
    if stop == "refusal":
        raise RuntimeError("model refused the request")
    if stop == "max_tokens":
        raise RuntimeError("model output was truncated at max_tokens")
    text = "".join(getattr(b, "text", "") for b in resp.content if getattr(b, "type", "") == "text")
    if not text.strip():
        raise RuntimeError("model returned no text")
    return text
