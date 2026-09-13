from collections.abc import Callable
from pathlib import Path

from app.core.config import settings

from .base import LLMAuthError, LLMClient, LLMNotConfigured, LLMResponse, LLMUnavailable
from .gemini_client import GeminiClient
from .providers import PROVIDERS
from .replay import ReplayClient

__all__ = [
    "LLMClient",
    "LLMResponse",
    "LLMNotConfigured",
    "LLMUnavailable",
    "LLMAuthError",
    "get_llm_client",
    "get_llm_client_for",
]

_FIXTURES_DIR = Path(__file__).resolve().parents[3] / "evals" / "fixtures" / "responses"

_ADAPTERS: dict[str, Callable[[], LLMClient]] = {
    "google": GeminiClient,
    "replay": lambda: ReplayClient(_FIXTURES_DIR),
}


def _resolve_adapter(provider_id: str, *, unknown_message: str) -> Callable[[], LLMClient]:
    """Single source of truth for the three ways a provider_id can fail to resolve.

    Order matters: an adapter always wins if registered, even for a provider not
    (yet) listed in PROVIDERS, so `_ADAPTERS`-only entries like "replay" still work.
    """
    factory = _ADAPTERS.get(provider_id)
    if factory is not None:
        return factory

    spec = PROVIDERS.get(provider_id)
    if spec is None:
        raise ValueError(unknown_message)
    if spec.available:
        # PROVIDERS says available=True but nobody registered an adapter — a wiring
        # bug, not an expected "not implemented yet", so it must not read as one.
        raise ValueError(
            f"provider {provider_id!r} is declared available but has no adapter "
            "registered (wiring bug)"
        )
    raise ValueError(f"provider {provider_id!r} is not yet available")


def get_llm_client() -> LLMClient:
    provider_id = settings.LLM_PROVIDER
    factory = _resolve_adapter(
        provider_id, unknown_message=f"unknown LLM_PROVIDER: {provider_id!r}"
    )
    return factory()


def get_llm_client_for(provider_id: str) -> LLMClient:
    factory = _resolve_adapter(provider_id, unknown_message=f"unknown provider: {provider_id!r}")
    return factory()
