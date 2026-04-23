from datetime import datetime
from uuid import UUID
from pydantic import BaseModel
from app.db.base import PriorityEnum


class StoryCreate(BaseModel):
    title: str
    description: str | None = None
    status: str | None = None
    priority: PriorityEnum | None = None


class StoryUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    priority: PriorityEnum | None = None


class StoryResponse(BaseModel):
    id: UUID
    project_id: UUID
    title: str
    description: str | None
    status: str
    priority: PriorityEnum
    created_by: UUID
    created_at: datetime

    class Config:
        from_attributes = True


class StoryMoveRequest(BaseModel):
    project_id: UUID
