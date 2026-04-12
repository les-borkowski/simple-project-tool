from datetime import datetime
from uuid import UUID
from pydantic import BaseModel
from app.db.base import StatusEnum, PriorityEnum


class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    status: StatusEnum | None = None
    priority: PriorityEnum | None = None
    assignee_id: UUID | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: StatusEnum | None = None
    priority: PriorityEnum | None = None
    assignee_id: UUID | None = None


class TaskResponse(BaseModel):
    id: UUID
    story_id: UUID
    title: str
    description: str | None
    status: StatusEnum
    priority: PriorityEnum
    assignee_id: UUID | None
    created_by: UUID
    created_at: datetime

    class Config:
        from_attributes = True
