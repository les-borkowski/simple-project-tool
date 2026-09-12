from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.auth.security import SCOPE_HIERARCHY

# 90 days: long enough not to be a nuisance for a running agent, short enough that a
# key leaked from a third-party config file stops working on its own.
DEFAULT_KEY_LIFETIME_DAYS = 90

VALID_SCOPES = set(SCOPE_HIERARCHY.keys()) | {
    s for implied in SCOPE_HIERARCHY.values() for s in implied
}


class APIKeyCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: str
    scopes: list[str]
    # Bounded lifetime by default: these keys are handed to third-party LLM hosts and
    # stored in config files on user machines.
    expires_in_days: int = Field(default=DEFAULT_KEY_LIFETIME_DAYS, ge=1, le=3650)

    @field_validator("scopes")
    @classmethod
    def validate_scopes(cls, v: list[str]) -> list[str]:
        invalid = [s for s in v if s not in VALID_SCOPES]
        if invalid:
            raise ValueError(f"Unknown scopes: {invalid}. Valid: {sorted(VALID_SCOPES)}")
        return v


class APIKeyIdentity(BaseModel):
    """The calling key's own identity, as surfaced to agents by GET /auth/me."""

    label: str
    scopes: list[str]


class APIKeyResponse(BaseModel):
    id: UUID
    label: str
    scopes: list[str]
    last_used_at: datetime | None
    created_at: datetime
    expires_at: datetime | None

    class Config:
        from_attributes = True


class APIKeyCreatedResponse(BaseModel):
    id: UUID
    label: str
    scopes: list[str]
    key: str
    expires_at: datetime | None
