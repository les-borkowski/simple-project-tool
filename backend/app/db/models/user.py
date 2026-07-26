import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, RoleEnum, TimestampMixin

if TYPE_CHECKING:
    from app.db.models.api_key import APIKey
    from app.db.models.user_config import UserConfig


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
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

    # Relationships
    config: Mapped["UserConfig"] = relationship(
        "UserConfig", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    api_keys: Mapped[list["APIKey"]] = relationship(
        "APIKey", back_populates="user", cascade="all, delete-orphan"
    )
