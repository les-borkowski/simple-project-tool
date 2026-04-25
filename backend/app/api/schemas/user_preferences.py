from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


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
