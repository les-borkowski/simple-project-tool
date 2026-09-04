from datetime import date

from pydantic import BaseModel, ConfigDict, Field

from app.db.base import PriorityEnum


class ExtractedTask(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=500)
    description: str | None = Field(default=None, max_length=2000)
    story_hint: str | None = None
    assignee_hint: str | None = None
    due_date: date | None = None
    priority: PriorityEnum | None = None
    confidence: float = Field(ge=0, le=1)


class ExtractionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tasks: list[ExtractedTask] = Field(default_factory=list)
    not_a_task: bool = False
    notes: str | None = None
