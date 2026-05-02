from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, field_validator

VALID_TABS = {"board", "stories", "sprints", "timeline", "members"}


class UserProjectPreferencesResponse(BaseModel):
    id: UUID
    user_id: UUID
    project_id: UUID
    tab_order: list[str]
    hidden_tabs: list[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserProjectPreferencesUpdate(BaseModel):
    tab_order: list[str]
    hidden_tabs: list[str]

    @field_validator("tab_order", "hidden_tabs")
    @classmethod
    def validate_tab_keys(cls, v: list[str]) -> list[str]:
        invalid = [k for k in v if k not in VALID_TABS]
        if invalid:
            raise ValueError(f"Unknown tab keys: {invalid}")
        return v
