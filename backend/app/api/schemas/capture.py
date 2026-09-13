import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict, Field

from app.api.schemas.task import TaskResponse
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


class CaptureRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=4000)
    reference_date: date | None = None
    story_id: uuid.UUID | None = None


class CapturedTask(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str
    description: str | None
    story_hint: str | None
    story_id: uuid.UUID | None
    story_resolved: bool
    assignee_hint: str | None
    assignee_id: uuid.UUID | None
    assignee_resolved: bool
    due_date: date | None
    priority: PriorityEnum | None
    confidence: float
    low_confidence: bool


class CaptureResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tasks: list[CapturedTask]
    unparseable: bool
    needs_confirmation: bool
    warnings: list[str]
    model: str
    prompt_version: str
    latency_ms: int


class ConfirmTaskItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=500)
    description: str | None = None
    story_id: uuid.UUID | None = None
    assignee_id: uuid.UUID | None = None
    due_date: date | None = None
    priority: PriorityEnum | None = None


class ConfirmRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tasks: list[ConfirmTaskItem] = Field(min_length=1, max_length=20)


class ConfirmResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    created: list[TaskResponse]
