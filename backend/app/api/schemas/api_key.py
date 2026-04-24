from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class APIKeyCreate(BaseModel):
    label: str
    scopes: list[str]


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
