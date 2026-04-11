import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, LocaleEnum, ThemeEnum, _utcnow


class UserConfig(Base):
    __tablename__ = "user_configs"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    theme: Mapped[ThemeEnum] = mapped_column(default=ThemeEnum.system, nullable=False)
    locale: Mapped[LocaleEnum] = mapped_column(default=LocaleEnum.en_gb, nullable=False)
    display_preferences: Mapped[dict] = mapped_column(
        JSONB, default=dict, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=_utcnow
    )

    user: Mapped["User"] = relationship("User", back_populates="config")
