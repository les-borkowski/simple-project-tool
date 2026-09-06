import asyncio
import time

import httpx

from app.core.config import settings

from .base import LLMNotConfigured, LLMResponse, LLMUnavailable
from .schema_adapter import to_gemini_schema


class GeminiClient:
    BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
    MAX_RETRIES = 3
    DEFAULT_BACKOFF_SECONDS = 1.0
    MAX_BACKOFF_SECONDS = 30.0

    def __init__(self, *, transport: httpx.BaseTransport | None = None):
        self._transport = transport

    async def complete(
        self,
        system: str,
        user: str,
        *,
        json_schema: dict | None = None,
        max_tokens: int,
        temperature: float,
        api_key: str | None = None,
        model: str | None = None,
    ) -> LLMResponse:
        key = api_key or (settings.GOOGLE_API_KEY if settings.LLM_ALLOW_SERVER_KEY_FALLBACK else "")
        if not key:
            raise LLMNotConfigured("GOOGLE_API_KEY is empty")

        resolved_model = model or settings.LLM_MODEL
        url = f"{self.BASE_URL}/{resolved_model}:generateContent"

        generation_config: dict = {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        }
        if json_schema is not None:
            generation_config["responseMimeType"] = "application/json"
            generation_config["responseSchema"] = to_gemini_schema(json_schema)

        body = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": generation_config,
        }
        headers = {
            "x-goog-api-key": key,
            "content-type": "application/json",
        }

        start = time.monotonic()
        resp = None
        async with httpx.AsyncClient(
            timeout=settings.LLM_TIMEOUT_SECONDS, transport=self._transport
        ) as client:
            for attempt in range(self.MAX_RETRIES + 1):
                try:
                    resp = await client.post(url, json=body, headers=headers)
                except httpx.TimeoutException as e:
                    raise LLMUnavailable(f"request timed out: {e}") from e
                except httpx.RequestError as e:
                    raise LLMUnavailable(f"request failed: {e}") from e

                if resp.status_code == 429:
                    if attempt < self.MAX_RETRIES:
                        await asyncio.sleep(self._retry_after(resp))
                        continue
                    raise LLMUnavailable("rate limited")
                if resp.status_code >= 500:
                    raise LLMUnavailable(f"provider {resp.status_code}")
                if resp.status_code >= 400:
                    raise LLMUnavailable(f"unexpected status {resp.status_code}")
                break

        resp.raise_for_status()
        data = resp.json()
        try:
            text = data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError, TypeError) as e:
            raise LLMUnavailable("malformed response") from e

        usage = data.get("usageMetadata", {})
        return LLMResponse(
            text=text,
            model=resolved_model,
            prompt_tokens=usage.get("promptTokenCount", 0),
            completion_tokens=usage.get("candidatesTokenCount", 0),
            latency_ms=int((time.monotonic() - start) * 1000),
        )

    def _retry_after(self, resp: httpx.Response) -> float:
        raw = resp.headers.get("Retry-After")
        if raw is None:
            return self.DEFAULT_BACKOFF_SECONDS
        try:
            return min(float(raw), self.MAX_BACKOFF_SECONDS)
        except ValueError:
            return self.DEFAULT_BACKOFF_SECONDS
