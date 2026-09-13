import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.db.models.user import User


class UserLLMProvider(TimestampMixin, Base):
    __tablename__ = "user_llm_providers"
    __table_args__ = (
        UniqueConstraint("user_id", "provider", name="uq_user_llm_provider_user_provider"),
        Index("ix_user_llm_provider_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    api_key_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    api_key_hint: Mapped[str] = mapped_column(String(8), nullable=False)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    rpm_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tpm_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    user: Mapped["User"] = relationship("User", back_populates="llm_providers")


def effective_rpm_limit(row: "UserLLMProvider | None", user: "User") -> int:
    """A user-set limit wins if under the ceiling; otherwise clamps to it (never rejected)."""
    ceiling = user.llm_rpm_ceiling if user.llm_rpm_ceiling is not None else settings.LLM_MAX_RPM
    if row is None or row.rpm_limit is None:
        return ceiling
    return min(row.rpm_limit, ceiling)


def effective_tpm_limit(row: "UserLLMProvider | None", user: "User") -> int:
    ceiling = user.llm_tpm_ceiling if user.llm_tpm_ceiling is not None else settings.LLM_MAX_TPM
    if row is None or row.tpm_limit is None:
        return ceiling
    return min(row.tpm_limit, ceiling)
