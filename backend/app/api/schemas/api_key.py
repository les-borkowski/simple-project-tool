from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, field_validator

from app.auth.security import SCOPE_HIERARCHY

VALID_SCOPES = set(SCOPE_HIERARCHY.keys()) | {
    s for implied in SCOPE_HIERARCHY.values() for s in implied
}


class APIKeyCreate(BaseModel):
    label: str
    scopes: list[str]

    @field_validator("scopes")
    @classmethod
    def validate_scopes(cls, v: list[str]) -> list[str]:
        invalid = [s for s in v if s not in VALID_SCOPES]
        if invalid:
            raise ValueError(f"Unknown scopes: {invalid}. Valid: {sorted(VALID_SCOPES)}")
        return v


class APIKeyResponse(BaseModel):
    id: UUID
    label: str
    scopes: list[str]
    last_used_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


class APIKeyCreatedResponse(BaseModel):
    id: UUID
    label: str
    scopes: list[str]
    key: str
