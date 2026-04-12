import enum
from datetime import UTC, datetime

from sqlalchemy import func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""

    pass


def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class TimestampMixin:
    """Mixin for automatic timestamp tracking on create/update."""

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    # onupdate uses a Python callable so it fires on ORM-level updates (not just Core UPDATE)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=_utcnow)


class StatusEnum(enum.StrEnum):
    """Work item status values."""

    to_do = "to_do"
    in_progress = "in_progress"
    in_review = "in_review"
    in_testing = "in_testing"
    done = "done"


class PriorityEnum(enum.StrEnum):
    """Work item priority levels."""

    low = "low"
    medium = "medium"
    high = "high"


class RoleEnum(enum.StrEnum):
    """User role types."""

    manager = "manager"
    contributor = "contributor"


class ThemeEnum(enum.StrEnum):
    """UI theme preferences."""

    light = "light"
    dark = "dark"
    system = "system"


class LocaleEnum(enum.StrEnum):
    """Supported locales."""

    en_gb = "en-GB"
    pl = "pl"


class InvitationStatusEnum(enum.StrEnum):
    """Project invitation status values."""

    pending = "pending"
    accepted = "accepted"
    declined = "declined"
    expired = "expired"
