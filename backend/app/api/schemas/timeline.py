from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from app.db.base import PriorityEnum


class TimelineTaskResponse(BaseModel):
    task_id: UUID
    title: str
    status: str
    priority: PriorityEnum
    story_id: UUID | None
    sprint_id: UUID | None
    bar_start: date
    bar_end: date
    source: Literal["deadline", "sprint", "status_history"]


class TimelineResponse(BaseModel):
    items: list[TimelineTaskResponse]
    truncated: bool
