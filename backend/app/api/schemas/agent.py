from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.api.schemas.api_key import (
    DEFAULT_KEY_LIFETIME_DAYS,
    APIKeyCreatedResponse,
    validate_scopes,
)

DEFAULT_AGENT_SCOPES = ["read:projects", "read:stories", "read:tasks", "read:comments"]


def _strip_name(v: str) -> str:
    # Stripped-length check, so whitespace-only names are rejected.
    v = v.strip()
    if not 1 <= len(v) <= 100:
        raise ValueError("Name must be 1-100 characters")
    return v


class AgentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    scopes: list[str] = Field(default_factory=lambda: list(DEFAULT_AGENT_SCOPES))
    expires_in_days: int = Field(default=DEFAULT_KEY_LIFETIME_DAYS, ge=1, le=3650)

    _check_name = field_validator("name")(_strip_name)
    _check_scopes = field_validator("scopes")(validate_scopes)


class AgentRename(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str

    _check_name = field_validator("name")(_strip_name)


class AgentResponse(BaseModel):
    id: UUID
    name: str
    is_active: bool
    created_at: datetime
    key_count: int


class AgentCreatedResponse(AgentResponse):
    key: APIKeyCreatedResponse
