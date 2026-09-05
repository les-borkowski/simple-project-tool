from collections.abc import Callable
from pathlib import Path

from app.core.config import settings

from .base import LLMClient, LLMNotConfigured, LLMResponse, LLMUnavailable
from .gemini_client import GeminiClient
from .providers import PROVIDERS
from .replay import ReplayClient

__all__ = [
    "LLMClient",
    "LLMResponse",
    "LLMNotConfigured",
    "LLMUnavailable",
    "get_llm_client",
    "get_llm_client_for",
]

_FIXTURES_DIR = Path(__file__).resolve().parents[3] / "evals" / "fixtures" / "responses"

_ADAPTERS: dict[str, Callable[[], LLMClient]] = {
    "google": GeminiClient,
    "replay": lambda: ReplayClient(_FIXTURES_DIR),
}


def _build(provider_id: str) -> LLMClient:
    try:
        factory = _ADAPTERS[provider_id]
    except KeyError:
        if provider_id in PROVIDERS:
            raise ValueError(f"provider {provider_id!r} is not yet available") from None
        raise ValueError(f"unknown provider: {provider_id!r}") from None
    return factory()


def get_llm_client() -> LLMClient:
    return _build(settings.LLM_PROVIDER)


def get_llm_client_for(provider_id: str) -> LLMClient:
    spec = PROVIDERS.get(provider_id)
    if spec is not None and not spec.available:
        raise ValueError(f"provider {provider_id!r} is not yet available")
    return _build(provider_id)
