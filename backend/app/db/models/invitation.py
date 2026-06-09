import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, InvitationStatusEnum, RoleEnum

if TYPE_CHECKING:
    from app.db.models.project import Project
    from app.db.models.user import User


class Invitation(Base):
    __tablename__ = "invitations"
    __table_args__ = (
        Index("ix_invitation_email_status", "invitee_email", "status"),
        Index("ix_invitation_project_id", "project_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    inviter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    invitee_email: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[RoleEnum] = mapped_column(default=RoleEnum.contributor, nullable=False)
    status: Mapped[InvitationStatusEnum] = mapped_column(
        default=InvitationStatusEnum.pending, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(nullable=False)

    project: Mapped["Project"] = relationship("Project", back_populates="invitations")
    inviter: Mapped["User"] = relationship("User", foreign_keys=[inviter_id])
