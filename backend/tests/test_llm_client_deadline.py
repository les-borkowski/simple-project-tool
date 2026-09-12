"""LLM_TIMEOUT_SECONDS must bound the whole call, not just one attempt.

httpx's timeout applies per request. With MAX_RETRIES=3 and backoff capped at
MAX_BACKOFF_SECONDS=30, one complete() could run 4 attempts plus 3 sleeps — and
capture_service calls complete() twice on the retry path. A single capture request
could hold a worker and a pooled connection for minutes before returning 503.
"""

import asyncio
import time

import httpx
import pytest

from app.core.llm.base import LLMUnavailable
from app.core.llm.gemini_client import GeminiClient


def _handler(status: int, headers: dict | None = None, body: dict | None = None):
    def handle(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json=body or {}, headers=headers or {})

    return handle


async def _complete(client: GeminiClient):
    return await client.complete("sys", "user", max_tokens=100, temperature=0.0, api_key="test-key")


async def test_a_persistently_throttling_provider_cannot_hold_the_request_open(monkeypatch):
    """429 with a long Retry-After, forever. The call must give up on the overall
    deadline rather than serving out every retry and its backoff."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "LLM_TIMEOUT_SECONDS", 1)

    transport = httpx.MockTransport(_handler(429, {"Retry-After": "30"}))
    client = GeminiClient(transport=transport)

    started = time.monotonic()
    with pytest.raises(LLMUnavailable):
        await _complete(client)
    elapsed = time.monotonic() - started

    # Generous ceiling: the point is that it is bounded by the deadline rather than by
    # 4 attempts x 30s of backoff.
    assert elapsed < 10, (
        f"call ran {elapsed:.1f}s against a 1s deadline — retries and backoff are "
        "unbounded by LLM_TIMEOUT_SECONDS"
    )


async def test_the_deadline_error_is_reported_as_unavailable(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "LLM_TIMEOUT_SECONDS", 1)

    transport = httpx.MockTransport(_handler(429, {"Retry-After": "30"}))

    with pytest.raises(LLMUnavailable) as exc_info:
        await _complete(GeminiClient(transport=transport))

    assert "timed out" in str(exc_info.value).lower() or "deadline" in str(exc_info.value).lower()


async def test_a_normal_call_is_unaffected_by_the_deadline(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "LLM_TIMEOUT_SECONDS", 30)

    ok_body = {
        "candidates": [{"content": {"parts": [{"text": "hello"}]}}],
        "usageMetadata": {"promptTokenCount": 5, "candidatesTokenCount": 7},
    }
    transport = httpx.MockTransport(_handler(200, body=ok_body))

    result = await _complete(GeminiClient(transport=transport))

    assert result.text == "hello"
    assert result.prompt_tokens == 5


async def test_retry_after_header_value_is_actually_honoured(monkeypatch):
    """Both existing 429 tests monkeypatch asyncio.sleep away and send Retry-After: 0,
    so the header parsing had no regression guard."""
    slept: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        slept.append(seconds)

    monkeypatch.setattr(asyncio, "sleep", fake_sleep)

    calls = {"n": 0}
    ok_body = {
        "candidates": [{"content": {"parts": [{"text": "ok"}]}}],
        "usageMetadata": {},
    }

    def handle(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429, json={}, headers={"Retry-After": "7"})
        return httpx.Response(200, json=ok_body)

    await _complete(GeminiClient(transport=httpx.MockTransport(handle)))

    assert slept == [7.0], f"expected a 7s backoff from the header, got {slept}"


async def test_retry_after_is_capped(monkeypatch):
    slept: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        slept.append(seconds)

    monkeypatch.setattr(asyncio, "sleep", fake_sleep)

    calls = {"n": 0}
    ok_body = {"candidates": [{"content": {"parts": [{"text": "ok"}]}}], "usageMetadata": {}}

    def handle(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429, json={}, headers={"Retry-After": "9999"})
        return httpx.Response(200, json=ok_body)

    await _complete(GeminiClient(transport=httpx.MockTransport(handle)))

    assert slept == [GeminiClient.MAX_BACKOFF_SECONDS]
