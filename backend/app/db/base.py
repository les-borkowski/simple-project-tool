import enum
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""

    pass


class TimestampMixin:
    """Mixin for automatic timestamp tracking on create/update."""

    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now(), nullable=False
    )


class StatusEnum(str, enum.Enum):
    """Work item status values."""

    to_do = "to_do"
    in_progress = "in_progress"
    in_review = "in_review"
    in_testing = "in_testing"
    done = "done"


class PriorityEnum(str, enum.Enum):
    """Work item priority levels."""

    low = "low"
    medium = "medium"
    high = "high"


class RoleEnum(str, enum.Enum):
    """User role types."""

    manager = "manager"
    contributor = "contributor"


class ThemeEnum(str, enum.Enum):
    """UI theme preferences."""

    light = "light"
    dark = "dark"
    system = "system"


class LocaleEnum(str, enum.Enum):
    """Supported locales."""

    en_gb = "en-GB"
    pl = "pl"


class InvitationStatusEnum(str, enum.Enum):
    """Project invitation status values."""

    pending = "pending"
    accepted = "accepted"
    declined = "declined"
    expired = "expired"
