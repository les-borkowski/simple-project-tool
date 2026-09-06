import hashlib
import json
from unittest.mock import MagicMock, patch

import httpx
import pytest
from pydantic import BaseModel, ConfigDict, Field


def _settings(**overrides):
    base = dict(
        LLM_MODEL="gemini-2.5-flash",
        GOOGLE_API_KEY="test-key",
        LLM_TIMEOUT_SECONDS=30,
        LLM_PROVIDER="google",
        LLM_ALLOW_SERVER_KEY_FALLBACK=True,
    )
    base.update(overrides)
    return MagicMock(**base)


def _patch_gemini_settings(**overrides):
    import app.core.llm.gemini_client as mod

    return patch.object(mod, "settings", _settings(**overrides))


def _patch_replay_settings(**overrides):
    import app.core.llm.replay as mod

    return patch.object(mod, "settings", _settings(**overrides))


def test_llm_response_fields():
    from app.core.llm.base import LLMResponse

    resp = LLMResponse(text="x", model="m", prompt_tokens=1, completion_tokens=2, latency_ms=3)
    assert resp.text == "x"
    assert resp.model == "m"
    assert resp.prompt_tokens == 1
    assert resp.completion_tokens == 2
    assert resp.latency_ms == 3


async def test_gemini_happy_path():
    from app.core.llm.gemini_client import GeminiClient

    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            "gemini-2.5-flash:generateContent"
        )
        assert request.headers["x-goog-api-key"] == "test-key"
        body = json.loads(request.content)
        assert body["systemInstruction"]["parts"][0]["text"] == "SYS"
        assert body["contents"][0]["role"] == "user"
        assert body["contents"][0]["parts"][0]["text"] == "USR"
        assert body["generationConfig"]["temperature"] == 0
        assert body["generationConfig"]["maxOutputTokens"] == 256
        return httpx.Response(
            200,
            json={
                "candidates": [{"content": {"parts": [{"text": '{"ok":true}'}]}}],
                "usageMetadata": {"promptTokenCount": 11, "candidatesTokenCount": 7},
            },
        )

    with _patch_gemini_settings():
        client = GeminiClient(transport=httpx.MockTransport(handler))
        resp = await client.complete("SYS", "USR", max_tokens=256, temperature=0)

    assert resp.text == '{"ok":true}'
    assert resp.prompt_tokens == 11
    assert resp.completion_tokens == 7
    assert resp.model == "gemini-2.5-flash"
    assert resp.latency_ms >= 0


async def test_gemini_response_schema_only_when_given():
    from app.core.llm.gemini_client import GeminiClient

    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "candidates": [{"content": {"parts": [{"text": "{}"}]}}],
                "usageMetadata": {"promptTokenCount": 1, "candidatesTokenCount": 1},
            },
        )

    schema = {"type": "object", "properties": {"a": {"type": "string"}}}
    with _patch_gemini_settings():
        client = GeminiClient(transport=httpx.MockTransport(handler))
        await client.complete("SYS", "USR", json_schema=schema, max_tokens=64, temperature=0)
        gen = captured["body"]["generationConfig"]
        assert gen["responseMimeType"] == "application/json"
        assert "responseSchema" in gen

        await client.complete("SYS", "USR", max_tokens=64, temperature=0)
        assert "responseSchema" not in captured["body"]["generationConfig"]


async def test_gemini_retries_on_429_then_succeeds(monkeypatch):
    import app.core.llm.gemini_client as mod
    from app.core.llm.gemini_client import GeminiClient

    async def _no_sleep(*args, **kwargs):
        return None

    monkeypatch.setattr(mod.asyncio, "sleep", _no_sleep)

    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429, headers={"Retry-After": "0"}, json={})
        return httpx.Response(
            200,
            json={
                "candidates": [{"content": {"parts": [{"text": "ok"}]}}],
                "usageMetadata": {"promptTokenCount": 1, "candidatesTokenCount": 1},
            },
        )

    with _patch_gemini_settings():
        client = GeminiClient(transport=httpx.MockTransport(handler))
        resp = await client.complete("SYS", "USR", max_tokens=32, temperature=0)

    assert resp.text == "ok"
    assert calls["n"] == 2


async def test_gemini_429_exhausted_raises_unavailable(monkeypatch):
    import app.core.llm.gemini_client as mod
    from app.core.llm.base import LLMUnavailable
    from app.core.llm.gemini_client import GeminiClient

    async def _no_sleep(*args, **kwargs):
        return None

    monkeypatch.setattr(mod.asyncio, "sleep", _no_sleep)

    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(429, headers={"Retry-After": "0"}, json={})

    with _patch_gemini_settings():
        client = GeminiClient(transport=httpx.MockTransport(handler))
        with pytest.raises(LLMUnavailable):
            await client.complete("SYS", "USR", max_tokens=32, temperature=0)

    assert calls["n"] >= 3


async def test_gemini_500_raises_unavailable():
    from app.core.llm.base import LLMUnavailable
    from app.core.llm.gemini_client import GeminiClient

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "boom"})

    with _patch_gemini_settings():
        client = GeminiClient(transport=httpx.MockTransport(handler))
        with pytest.raises(LLMUnavailable):
            await client.complete("SYS", "USR", max_tokens=32, temperature=0)


async def test_gemini_timeout_raises_unavailable():
    from app.core.llm.base import LLMUnavailable
    from app.core.llm.gemini_client import GeminiClient

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("slow")

    with _patch_gemini_settings():
        client = GeminiClient(transport=httpx.MockTransport(handler))
        with pytest.raises(LLMUnavailable):
            await client.complete("SYS", "USR", max_tokens=32, temperature=0)


async def test_gemini_connect_error_raises_unavailable():
    from app.core.llm.base import LLMUnavailable
    from app.core.llm.gemini_client import GeminiClient

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    with _patch_gemini_settings():
        client = GeminiClient(transport=httpx.MockTransport(handler))
        with pytest.raises(LLMUnavailable):
            await client.complete("SYS", "USR", max_tokens=32, temperature=0)


async def test_gemini_no_key_raises_not_configured():
    from app.core.llm.base import LLMNotConfigured
    from app.core.llm.gemini_client import GeminiClient

    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(200, json={})

    with _patch_gemini_settings(GOOGLE_API_KEY=""):
        client = GeminiClient(transport=httpx.MockTransport(handler))
        with pytest.raises(LLMNotConfigured):
            await client.complete("SYS", "USR", max_tokens=32, temperature=0)

    assert calls["n"] == 0


async def test_gemini_user_key_overrides_server_key():
    from app.core.llm.gemini_client import GeminiClient

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["x-goog-api-key"] == "user-key"
        return httpx.Response(
            200,
            json={
                "candidates": [{"content": {"parts": [{"text": "ok"}]}}],
                "usageMetadata": {"promptTokenCount": 1, "candidatesTokenCount": 1},
            },
        )

    with _patch_gemini_settings(GOOGLE_API_KEY="server-key"):
        client = GeminiClient(transport=httpx.MockTransport(handler))
        resp = await client.complete("SYS", "USR", max_tokens=32, temperature=0, api_key="user-key")

    assert resp.text == "ok"


async def test_gemini_falls_back_to_server_key_when_allowed():
    from app.core.llm.gemini_client import GeminiClient

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["x-goog-api-key"] == "server-key"
        return httpx.Response(
            200,
            json={
                "candidates": [{"content": {"parts": [{"text": "ok"}]}}],
                "usageMetadata": {"promptTokenCount": 1, "candidatesTokenCount": 1},
            },
        )

    with _patch_gemini_settings(GOOGLE_API_KEY="server-key", LLM_ALLOW_SERVER_KEY_FALLBACK=True):
        client = GeminiClient(transport=httpx.MockTransport(handler))
        resp = await client.complete("SYS", "USR", max_tokens=32, temperature=0)

    assert resp.text == "ok"


async def test_gemini_no_fallback_raises_not_configured_without_user_key():
    from app.core.llm.base import LLMNotConfigured
    from app.core.llm.gemini_client import GeminiClient

    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(200, json={})

    with _patch_gemini_settings(GOOGLE_API_KEY="server-key", LLM_ALLOW_SERVER_KEY_FALLBACK=False):
        client = GeminiClient(transport=httpx.MockTransport(handler))
        with pytest.raises(LLMNotConfigured):
            await client.complete("SYS", "USR", max_tokens=32, temperature=0)

    assert calls["n"] == 0


async def test_gemini_user_key_works_when_server_key_empty():
    from app.core.llm.gemini_client import GeminiClient

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["x-goog-api-key"] == "user-key"
        return httpx.Response(
            200,
            json={
                "candidates": [{"content": {"parts": [{"text": "ok"}]}}],
                "usageMetadata": {"promptTokenCount": 1, "candidatesTokenCount": 1},
            },
        )

    with _patch_gemini_settings(GOOGLE_API_KEY=""):
        client = GeminiClient(transport=httpx.MockTransport(handler))
        resp = await client.complete("SYS", "USR", max_tokens=32, temperature=0, api_key="user-key")

    assert resp.text == "ok"


async def test_gemini_model_override_reaches_request_url():
    from app.core.llm.gemini_client import GeminiClient

    def handler(request: httpx.Request) -> httpx.Response:
        assert "gemini-override:generateContent" in str(request.url)
        return httpx.Response(
            200,
            json={
                "candidates": [{"content": {"parts": [{"text": "ok"}]}}],
                "usageMetadata": {"promptTokenCount": 1, "candidatesTokenCount": 1},
            },
        )

    with _patch_gemini_settings():
        client = GeminiClient(transport=httpx.MockTransport(handler))
        resp = await client.complete(
            "SYS", "USR", max_tokens=32, temperature=0, model="gemini-override"
        )

    assert resp.model == "gemini-override"


def test_to_gemini_schema_flattens_refs_and_nullable():
    from app.core.llm.schema_adapter import to_gemini_schema

    class Inner(BaseModel):
        model_config = ConfigDict(extra="forbid")
        name: str

    class Outer(BaseModel):
        model_config = ConfigDict(extra="forbid")
        inner: Inner
        note: str | None = None
        hint: str | None = Field(default=None, description="steer extraction")

    out = to_gemini_schema(Outer.model_json_schema())

    assert "$defs" not in out

    def walk(node):
        if isinstance(node, dict):
            assert "$ref" not in node
            assert "additionalProperties" not in node
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(out)

    assert out["properties"]["note"] == {"type": "string", "nullable": True}
    assert out["properties"]["hint"]["description"] == "steer extraction"
    assert out["properties"]["hint"]["nullable"] is True


def test_to_gemini_schema_flattens_allof():
    from app.core.llm.schema_adapter import to_gemini_schema

    out = to_gemini_schema({"allOf": [{"type": "string"}, {"maxLength": 5}]})

    assert out == {"type": "string", "maxLength": 5}
    assert "allOf" not in out


async def test_replay_client_hit(tmp_path):
    from app.core.llm.replay import ReplayClient

    key = hashlib.sha256(b"google|gemini-2.5-flash|capture/v1|SYS|USR").hexdigest()
    (tmp_path / f"{key}.json").write_text(
        json.dumps(
            {
                "text": '{"x":1}',
                "model": "gemini-2.5-flash",
                "prompt_tokens": 5,
                "completion_tokens": 2,
            }
        )
    )

    with _patch_replay_settings():
        rc = ReplayClient(tmp_path)
        resp = await rc.complete("SYS", "USR", max_tokens=100, temperature=0)

    assert resp.text == '{"x":1}'
    assert resp.prompt_tokens == 5


async def test_replay_client_miss_raises_named(tmp_path):
    from app.core.llm.replay import FixtureMissError, ReplayClient

    key = hashlib.sha256(b"google|gemini-2.5-flash|capture/v1|SYS|USR").hexdigest()

    with _patch_replay_settings():
        rc = ReplayClient(tmp_path)
        with pytest.raises(FixtureMissError) as excinfo:
            await rc.complete("SYS", "USR", max_tokens=100, temperature=0)

    assert key in str(excinfo.value)


def test_replay_client_never_uses_httpx():
    import app.core.llm.replay as r

    assert getattr(r, "httpx", None) is None


def test_prompt_version_constant():
    from app.core.llm.prompts import PROMPT_VERSION

    assert PROMPT_VERSION == "capture/v1"


def test_get_llm_client_selects():
    import app.core.llm as llm_pkg
    from app.core.llm import get_llm_client
    from app.core.llm.gemini_client import GeminiClient
    from app.core.llm.replay import ReplayClient

    with patch.object(llm_pkg, "settings", _settings(LLM_PROVIDER="replay")):
        assert isinstance(get_llm_client(), ReplayClient)

    with patch.object(llm_pkg, "settings", _settings(LLM_PROVIDER="google")):
        assert isinstance(get_llm_client(), GeminiClient)

    with patch.object(llm_pkg, "settings", _settings(LLM_PROVIDER="bogus")):
        with pytest.raises(ValueError):
            get_llm_client()
