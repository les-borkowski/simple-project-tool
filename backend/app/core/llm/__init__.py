from pathlib import Path

from app.core.config import settings

from .base import LLMClient, LLMNotConfigured, LLMResponse, LLMUnavailable
from .gemini_client import GeminiClient
from .replay import ReplayClient

__all__ = [
    "LLMClient",
    "LLMResponse",
    "LLMNotConfigured",
    "LLMUnavailable",
    "get_llm_client",
]

_FIXTURES_DIR = Path(__file__).resolve().parents[3] / "evals" / "fixtures" / "responses"


def get_llm_client() -> LLMClient:
    provider = settings.LLM_PROVIDER
    if provider == "google":
        return GeminiClient()
    if provider == "replay":
        return ReplayClient(_FIXTURES_DIR)
    raise ValueError(f"unknown LLM_PROVIDER: {provider!r}")
