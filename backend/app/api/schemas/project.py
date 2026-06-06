from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.db.base import PriorityEnum, RoleEnum


class ProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    description: str | None = None
    status: str | None = None
    priority: PriorityEnum | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None
    priority: PriorityEnum | None = None
    effort_unit: str | None = None


class ProjectResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    owner_id: UUID
    status: str
    priority: PriorityEnum
    archived_at: datetime | None
    created_by: UUID
    created_at: datetime
    effort_unit: str | None

    class Config:
        from_attributes = True


class MemberAdd(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: UUID
    role: RoleEnum


class MemberUpdate(BaseModel):
    role: RoleEnum


class MemberResponse(BaseModel):
    user_id: UUID
    role: RoleEnum
    joined_at: datetime
    name: str
    email: str

    class Config:
        from_attributes = True
