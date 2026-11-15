from types import SimpleNamespace

import httpx
import pytest

from app.services import llm_client


def test_groq_uses_structured_output_without_anthropic(monkeypatch):
    monkeypatch.setattr(llm_client, "get_settings", lambda: SimpleNamespace(llm_provider="groq", groq_api_key="test-only", anthropic_api_key="", llm_model="openai/gpt-oss-120b"))
    assert llm_client.enabled()
    def post(url, **kwargs):
        assert url == "https://api.groq.com/openai/v1/chat/completions"
        assert kwargs["headers"]["Authorization"] == "Bearer test-only"
        body = kwargs["json"]
        assert body["model"] == "openai/gpt-oss-120b"
        assert body["response_format"]["json_schema"]["strict"] is True
        assert body["messages"][0]["content"] == "system"
        return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {"content": '{"ok":true}'}}]}, request=httpx.Request("POST", url))
    monkeypatch.setattr(httpx, "post", post)
    llm_client.record_error(RuntimeError("previous failure"))
    assert llm_client.call_json("system", "question", {"type": "object", "properties": {}}) == '{"ok":true}'
    assert llm_client.status() == "configured"


def test_groq_quota_failure_is_sanitized_and_never_calls_paid_provider(monkeypatch):
    monkeypatch.setattr(llm_client, "get_settings", lambda: SimpleNamespace(llm_provider="groq", groq_api_key="test-only", anthropic_api_key="unused", llm_model="openai/gpt-oss-120b"))
    monkeypatch.setattr(httpx, "post", lambda url, **kw: httpx.Response(429, request=httpx.Request("POST", url)))
    with pytest.raises(RuntimeError, match="Groq request failed.*429"):
        llm_client.call_json("system", "question", {})


def test_groq_requires_its_own_key(monkeypatch):
    monkeypatch.setattr(llm_client, "get_settings", lambda: SimpleNamespace(llm_provider="groq", groq_api_key="", anthropic_api_key="unused"))
    assert not llm_client.enabled()
