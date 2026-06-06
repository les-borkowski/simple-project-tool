from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr

from app.db.base import InvitationStatusEnum, RoleEnum


class InvitationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    invitee_email: EmailStr


class InvitationResponse(BaseModel):
    id: UUID
    project_id: UUID
    project_name: str
    invitee_email: str
    inviter_name: str
    role: RoleEnum
    status: InvitationStatusEnum
    created_at: datetime
    expires_at: datetime

    class Config:
        from_attributes = True
