from datetime import date
from uuid import UUID
from pydantic import BaseModel


class SprintCreate(BaseModel):
    name: str
    start_date: date
    end_date: date
    capacity: int | None = None


class SprintUpdate(BaseModel):
    name: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    capacity: int | None = None


class SprintResponse(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    start_date: date
    end_date: date
    capacity: int | None
    created_by: UUID
    total_effort: int
    task_count: int

    class Config:
        from_attributes = True
