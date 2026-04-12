from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, EmailStr
from app.db.base import RoleEnum, InvitationStatusEnum


class InvitationCreate(BaseModel):
    invitee_email: EmailStr
    role: RoleEnum


class InvitationResponse(BaseModel):
    id: UUID
    project_id: UUID
    invitee_email: str
    role: RoleEnum
    status: InvitationStatusEnum
    created_at: datetime
    expires_at: datetime

    class Config:
        from_attributes = True
