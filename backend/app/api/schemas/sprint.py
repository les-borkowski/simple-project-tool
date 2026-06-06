from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, model_validator


class SprintCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    start_date: date
    end_date: date
    capacity: int | None = None

    @model_validator(mode="after")
    def end_after_start(self) -> "SprintCreate":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


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
    created_at: datetime
    total_effort: int
    task_count: int

    class Config:
        from_attributes = True
