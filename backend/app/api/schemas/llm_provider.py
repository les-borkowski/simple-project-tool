from pydantic import BaseModel, Field


class UserLLMProviderUpdate(BaseModel):
    # 512 is generous for any realistic provider key; 100 matches the DB column
    # (String(100)) — both reject absurdly long input at the boundary with a clean
    # 422 instead of an eventual DB error.
    api_key: str | None = Field(default=None, max_length=512)
    model: str | None = Field(default=None, max_length=100)
    rpm_limit: int | None = None
    tpm_limit: int | None = None
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
