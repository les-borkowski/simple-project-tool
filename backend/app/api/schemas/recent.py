# backend/app/api/schemas/recent.py
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class RecentItemResponse(BaseModel):
    type: Literal["project", "story", "task"]
    id: str
    title: str
    project_id: str
    story_id: str | None
    updated_at: datetime

    model_config = {"from_attributes": True}
