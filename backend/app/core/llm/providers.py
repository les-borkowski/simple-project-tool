"""Provider catalogue: declarative metadata only, no I/O and no adapter classes.

Adding a provider is a data entry here plus one adapter module wired into the
`_ADAPTERS` registry in `__init__.py` — not a new branch in an `if` chain.
Providers with `available=False` are visible in the catalogue (e.g. for a
future "choose your provider" UI) without any adapter code to maintain.
"""

from dataclasses import dataclass

from fastapi import HTTPException

from app.core.config import settings


@dataclass(frozen=True)
class ProviderSpec:
    id: str
    label: str
    default_model: str
    available: bool
    key_hint: str
    docs_url: str
    default_rpm: int
    default_tpm: int


PROVIDERS: dict[str, ProviderSpec] = {
    "google": ProviderSpec(
        id="google",
        label="Google Gemini",
        default_model=settings.LLM_MODEL,
        available=True,
        key_hint="starts with AIza",
        docs_url="https://aistudio.google.com/apikey",
        default_rpm=15,
        default_tpm=250_000,
    ),
    "anthropic": ProviderSpec(
        id="anthropic",
        label="Anthropic Claude",
        default_model="claude-sonnet-4-5",
        available=False,
        key_hint="starts with sk-ant-",
        docs_url="https://console.anthropic.com/settings/keys",
        default_rpm=50,
        default_tpm=100_000,
    ),
    "openai": ProviderSpec(
        id="openai",
        label="OpenAI",
        default_model="gpt-5",
        available=False,
        key_hint="starts with sk-",
        docs_url="https://platform.openai.com/api-keys",
        default_rpm=60,
        default_tpm=150_000,
    ),
}


def get_provider(provider_id: str) -> ProviderSpec:
    try:
        return PROVIDERS[provider_id]
    except KeyError:
        raise HTTPException(status_code=422, detail="UNKNOWN_PROVIDER") from None


def available_providers() -> list[ProviderSpec]:
    return [spec for spec in PROVIDERS.values() if spec.available]
