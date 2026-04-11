import uuid
from typing import Optional
from sqlalchemy import String, Text, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, TimestampMixin, StatusEnum, PriorityEnum


class Task(TimestampMixin, Base):
    __tablename__ = "tasks"
    __table_args__ = (
        Index("ix_task_assignee_id", "assignee_id"),
        Index("ix_task_story_status", "story_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    story_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("stories.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[StatusEnum] = mapped_column(default=StatusEnum.to_do, nullable=False)
    priority: Mapped[PriorityEnum] = mapped_column(default=PriorityEnum.medium, nullable=False)
    assignee_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    story: Mapped["Story"] = relationship("Story", back_populates="tasks")
    assignee: Mapped[Optional["User"]] = relationship("User", foreign_keys=[assignee_id])
