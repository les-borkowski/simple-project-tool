from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.db.base import PriorityEnum


class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    status: str | None = None
    priority: PriorityEnum | None = None
    assignee_id: UUID | None = None
    effort: int | None = None
    due_date: date | None = None
    sprint_id: UUID | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    priority: PriorityEnum | None = None
    assignee_id: UUID | None = None
    effort: int | None = None
    due_date: date | None = None
    sprint_id: UUID | None = None


class TaskReorderItem(BaseModel):
    task_id: UUID
    position: int = Field(ge=0)


class TaskReorderRequest(BaseModel):
    tasks: list[TaskReorderItem]

    @model_validator(mode='after')
    def no_duplicate_task_ids(self) -> 'TaskReorderRequest':
        seen = set()
        for item in self.tasks:
            if item.task_id in seen:
                raise ValueError(f"Duplicate task_id: {item.task_id}")
            seen.add(item.task_id)
        return self


class TaskReorderResponse(BaseModel):
    updated: int


class TaskResponse(BaseModel):
    id: UUID
    project_id: UUID
    story_id: UUID | None
    title: str
    description: str | None
    status: str
    priority: PriorityEnum
    assignee_id: UUID | None
    created_by: UUID
    created_at: datetime
    effort: int | None
    due_date: date | None
    sprint_id: UUID | None
    position: int

    class Config:
        from_attributes = True
