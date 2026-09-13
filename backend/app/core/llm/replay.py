"""Deterministic LLM client backed by recorded fixtures; used by the eval harness and tests."""

import hashlib
import json
from pathlib import Path

from app.core.config import settings

from .base import LLMResponse
from .prompts import PROMPT_VERSION


class FixtureMissError(Exception):
    """Raised when no recorded response exists for a prompt key."""


class ReplayClient:
    def __init__(self, fixtures_dir: Path | str):
        self.dir = Path(fixtures_dir)

    def _key(self, system: str, user: str) -> str:
        payload = f"google|{settings.LLM_MODEL}|{PROMPT_VERSION}|{system}|{user}"
        return hashlib.sha256(payload.encode()).hexdigest()

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
        key = self._key(system, user)
        path = self.dir / f"{key}.json"
        if not path.exists():
            raise FixtureMissError(f"no fixture for key {key}\nsystem={system!r}\nuser={user!r}")
        raw = json.loads(path.read_text())
        return LLMResponse(
            text=raw["text"],
            model=raw.get("model", settings.LLM_MODEL),
            prompt_tokens=raw.get("prompt_tokens", 0),
            completion_tokens=raw.get("completion_tokens", 0),
            latency_ms=raw.get("latency_ms", 0),
        )
