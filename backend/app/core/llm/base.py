from dataclasses import dataclass
from typing import Protocol, runtime_checkable


@dataclass
class LLMResponse:
    text: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    latency_ms: int


class LLMNotConfigured(Exception):
    """Raised when the selected provider has no API key configured."""


class LLMUnavailable(Exception):
    """Raised on provider errors, timeouts, or malformed responses."""


class LLMAuthError(LLMUnavailable):
    """Raised when the provider rejects the supplied credential (401/403)."""


@runtime_checkable
class LLMClient(Protocol):
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
    ) -> LLMResponse: ...
