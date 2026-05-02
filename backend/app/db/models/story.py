import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, PriorityEnum, TimestampMixin

if TYPE_CHECKING:
    from app.db.models.project import Project
    from app.db.models.task import Task


class Story(TimestampMixin, Base):
    __tablename__ = "stories"
    __table_args__ = (
        Index("ix_story_project_status", "project_id", "status"),
        Index(
            "uq_story_default_per_project",
            "project_id",
            unique=True,
            postgresql_where=text("is_default = true"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(100), default="to_do", nullable=False)
    priority: Mapped[PriorityEnum] = mapped_column(default=PriorityEnum.medium, nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    project: Mapped["Project"] = relationship("Project", back_populates="stories")
    tasks: Mapped[list["Task"]] = relationship(
        "Task", back_populates="story", cascade="all, delete-orphan"
    )
