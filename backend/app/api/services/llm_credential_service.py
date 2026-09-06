"""Per-user LLM credential CRUD (T15).

Security-critical invariant: the raw API key is encrypted at rest and must never
appear on any response model — only `api_key_hint` (last 4 chars) is surfaced.
"""

import logging
from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.llm_provider import UserLLMProviderResponse, UserLLMProviderUpdate
from app.auth.permissions import require_not_demo
from app.core.crypto import CredentialEncryptionUnavailable, decrypt_secret, encrypt_secret
from app.core.llm import get_llm_client_for
from app.core.llm.base import LLMAuthError
from app.core.llm.providers import get_provider
from app.db.models import User, UserLLMProvider
from app.db.models.user_llm_provider import effective_rpm_limit, effective_tpm_limit

_logger = logging.getLogger(__name__)


@dataclass
class ResolvedCredential:
    provider: str
    api_key: str
    model: str | None


def _to_response(row: UserLLMProvider, user: User) -> UserLLMProviderResponse:
    spec = get_provider(row.provider)
    return UserLLMProviderResponse(
        provider=row.provider,
        label=spec.label,
        api_key_hint=row.api_key_hint,
        model=row.model,
        rpm_limit=row.rpm_limit,
        tpm_limit=row.tpm_limit,
        effective_rpm=effective_rpm_limit(row, user),
        effective_tpm=effective_tpm_limit(row, user),
        is_default=row.is_default,
        enabled=row.enabled,
    )


async def list_providers(user: User, db: AsyncSession) -> list[UserLLMProviderResponse]:
    stmt = select(UserLLMProvider).where(UserLLMProvider.user_id == user.id)
    rows = (await db.scalars(stmt)).all()
    return [_to_response(row, user) for row in rows]


async def _validate_key_live(provider_id: str, api_key: str) -> None:
    """One minimal generation call to catch a pasted typo/wrong key.

    Only LLMAuthError (401/403) blocks the save — a provider outage or any other
    transient failure must not stop the user from storing what may be a valid key.
    """
    client = get_llm_client_for(provider_id)
    try:
        await client.complete(
            "You are a test.", "Reply with OK.", max_tokens=1, temperature=0.0, api_key=api_key
        )
    except LLMAuthError:
        raise HTTPException(status_code=422, detail="LLM_KEY_INVALID") from None
    except Exception as exc:  # noqa: BLE001 - deliberately broad, see docstring
        _logger.warning("LLM key validation call failed for provider %s: %s", provider_id, exc)


async def upsert_provider(
    user: User, provider_id: str, data: UserLLMProviderUpdate, db: AsyncSession
) -> UserLLMProviderResponse:
    require_not_demo(user)
    spec = get_provider(provider_id)
    if not spec.available:
        raise HTTPException(status_code=422, detail="PROVIDER_NOT_AVAILABLE")

    existing = (
        await db.scalars(
            select(UserLLMProvider).where(
                UserLLMProvider.user_id == user.id,
                UserLLMProvider.provider == provider_id,
            )
        )
    ).one_or_none()

    has_new_key = bool(data.api_key)
    if existing is None and not has_new_key:
        raise HTTPException(status_code=422, detail="API_KEY_REQUIRED")

    encrypted: str | None = None
    hint: str | None = None
    if has_new_key:
        await _validate_key_live(provider_id, data.api_key)
        try:
            encrypted = encrypt_secret(data.api_key)
        except CredentialEncryptionUnavailable as exc:
            raise HTTPException(status_code=503, detail="CREDENTIAL_STORAGE_UNAVAILABLE") from exc
        hint = data.api_key[-4:]

    is_first_ever = False
    if existing is None:
        existing_count = await db.scalar(
            select(func.count())
            .select_from(UserLLMProvider)
            .where(UserLLMProvider.user_id == user.id)
        )
        is_first_ever = not existing_count

        row = UserLLMProvider(
            user_id=user.id,
            provider=provider_id,
            api_key_encrypted=encrypted,
            api_key_hint=hint,
        )
        if data.model is not None:
            row.model = data.model
        if data.rpm_limit is not None:
            row.rpm_limit = data.rpm_limit
        if data.tpm_limit is not None:
            row.tpm_limit = data.tpm_limit
        if data.enabled is not None:
            row.enabled = data.enabled
        db.add(row)
    else:
        row = existing
        if has_new_key:
            row.api_key_encrypted = encrypted
            row.api_key_hint = hint
        if data.model is not None:
            row.model = data.model
        if data.rpm_limit is not None:
            row.rpm_limit = data.rpm_limit
        if data.tpm_limit is not None:
            row.tpm_limit = data.tpm_limit
        if data.enabled is not None:
            row.enabled = data.enabled

    # Clamp to the effective ceiling rather than rejecting an over-the-ceiling request.
    if row.rpm_limit is not None:
        row.rpm_limit = effective_rpm_limit(row, user)
    if row.tpm_limit is not None:
        row.tpm_limit = effective_tpm_limit(row, user)

    if is_first_ever:
        row.is_default = True
    elif data.is_default is not None:
        row.is_default = data.is_default

    await db.flush()

    if row.is_default:
        await db.execute(
            update(UserLLMProvider)
            .where(UserLLMProvider.user_id == user.id, UserLLMProvider.id != row.id)
            .values(is_default=False)
        )

    await db.commit()
    await db.refresh(row)
    return _to_response(row, user)


async def delete_provider(user: User, provider_id: str, db: AsyncSession) -> None:
    require_not_demo(user)
    row = (
        await db.scalars(
            select(UserLLMProvider).where(
                UserLLMProvider.user_id == user.id,
                UserLLMProvider.provider == provider_id,
            )
        )
    ).one_or_none()
    if row is None:
        return
    await db.delete(row)
    await db.commit()


async def resolve_credential(user: User, db: AsyncSession) -> ResolvedCredential | None:
    """The user's decrypted default credential, or None if there isn't a usable one.

    Never raises — a decryption failure (e.g. key rotated) just falls back to the
    server key elsewhere, so it's logged and swallowed here.
    """
    stmt = select(UserLLMProvider).where(
        UserLLMProvider.user_id == user.id,
        UserLLMProvider.enabled.is_(True),
    )
    rows = (await db.scalars(stmt)).all()
    if not rows:
        return None

    defaults = [row for row in rows if row.is_default]
    if len(defaults) == 1:
        row = defaults[0]
    elif len(rows) == 1:
        row = rows[0]
    else:
        return None

    try:
        api_key = decrypt_secret(row.api_key_encrypted)
    except CredentialEncryptionUnavailable as exc:
        _logger.warning(
            "Could not decrypt stored credential for user %s provider %s: %s",
            user.id,
            row.provider,
            exc,
        )
        return None

    return ResolvedCredential(provider=row.provider, api_key=api_key, model=row.model)
