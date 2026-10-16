import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, RoleEnum, TimestampMixin

if TYPE_CHECKING:
    from app.db.models.api_key import APIKey
    from app.db.models.user_config import UserConfig
    from app.db.models.user_llm_provider import UserLLMProvider


KIND_HUMAN = "human"
KIND_AGENT = "agent"


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "(kind = 'human' AND email IS NOT NULL AND password_hash IS NOT NULL"
            " AND owner_id IS NULL)"
            " OR (kind = 'agent' AND email IS NULL AND password_hash IS NULL"
            " AND owner_id IS NOT NULL)",
            name="ck_users_kind_shape",
        ),
        Index(
            "uq_users_agent_owner_name",
            "owner_id",
            func.lower(text("name")),
            unique=True,
            postgresql_where=text("kind = 'agent'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Agents have no email/password; the kind_shape CHECK enforces the human/agent split.
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    kind: Mapped[str] = mapped_column(
        String(16), nullable=False, default=KIND_HUMAN, server_default=KIND_HUMAN
    )
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    role: Mapped[RoleEnum] = mapped_column(default=RoleEnum.manager, nullable=False)
    last_login: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    email_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_blocked: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    is_demo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Throttles password-reset emails per account. Stored on the user rather than in a
    # request log because no mail is sent for an unknown address anyway, so per-account
    # is the granularity that actually bounds the mail-bombing and the Mailgun spend.
    last_password_reset_request_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    llm_rpm_ceiling: Mapped[int | None] = mapped_column(Integer, nullable=True)
    llm_tpm_ceiling: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Relationships
    config: Mapped["UserConfig"] = relationship(
        "UserConfig", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    api_keys: Mapped[list["APIKey"]] = relationship(
        "APIKey", back_populates="user", cascade="all, delete-orphan"
    )
    llm_providers: Mapped[list["UserLLMProvider"]] = relationship(
        "UserLLMProvider", back_populates="user", cascade="all, delete-orphan"
    )
