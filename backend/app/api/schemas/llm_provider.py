from pydantic import BaseModel, Field

# `model` is interpolated into the provider request path, so it is constrained to the
# characters real model ids actually use. Without this, `../` segments let a user
# redirect the server's own request to an arbitrary path on the provider's host.
MODEL_ID_PATTERN = r"^[A-Za-z0-9._-]+$"


class UserLLMProviderUpdate(BaseModel):
    # 512 is generous for any realistic provider key; 100 matches the DB column
    # (String(100)) — both reject absurdly long input at the boundary with a clean
    # 422 instead of an eventual DB error. The lower bound matters too: api_key_hint is
    # api_key[-4:], so a shorter key would be stored as its own hint.
    api_key: str | None = Field(default=None, min_length=8, max_length=512)
    model: str | None = Field(default=None, max_length=100, pattern=MODEL_ID_PATTERN)
    # A stored 0 makes `count >= limit` always true, so every capture 429s with nothing
    # to explain why. Nothing legitimate sets a per-credential limit of zero — use
    # `enabled: false` to turn a credential off.
    rpm_limit: int | None = Field(default=None, ge=1)
    tpm_limit: int | None = Field(default=None, ge=1)
    is_default: bool | None = None
    enabled: bool | None = None


class UserLLMProviderResponse(BaseModel):
    """Never carries api_key/api_key_encrypted — the raw key must never leave the server."""

    provider: str
    label: str
    api_key_hint: str
    model: str | None
    rpm_limit: int | None
    tpm_limit: int | None
    effective_rpm: int
    effective_tpm: int
    is_default: bool
    enabled: bool


class ProviderCatalogueItem(BaseModel):
    id: str
    label: str
    default_model: str
    available: bool
    key_hint: str
    docs_url: str
