import uuid
from datetime import datetime
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy import ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, LocaleEnum, ThemeEnum, _utcnow

if TYPE_CHECKING:
    from app.db.models.user import User


class UserConfig(Base):
    __tablename__ = "user_configs"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    theme: Mapped[ThemeEnum] = mapped_column(default=ThemeEnum.system, nullable=False)
    locale: Mapped[LocaleEnum] = mapped_column(
        sa.Enum(LocaleEnum, values_callable=lambda obj: [e.value for e in obj], create_type=False),
        default=LocaleEnum.en_gb,
        nullable=False,
    )
    display_preferences: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=_utcnow)

    user: Mapped["User"] = relationship("User", back_populates="config")
