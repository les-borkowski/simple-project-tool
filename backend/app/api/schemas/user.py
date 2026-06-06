from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.db.base import RoleEnum


class UserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    name: str
    password: str = Field(min_length=8)


class UserUpdate(BaseModel):
    name: str | None = None
    password: str | None = None


class UserResponse(BaseModel):
    id: UUID
    email: str
    name: str
    role: RoleEnum
    created_at: datetime

    class Config:
        from_attributes = True
