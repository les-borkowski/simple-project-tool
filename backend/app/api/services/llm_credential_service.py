"""Per-user LLM credential CRUD (T15).

Security-critical invariant: the raw API key is encrypted at rest and must never
appear on any response model — only `api_key_hint` (last 4 chars) is surfaced.
"""

import logging
import uuid
from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.llm_provider import UserLLMProviderResponse, UserLLMProviderUpdate
from app.auth.permissions import require_not_demo
from app.core.crypto import CredentialEncryptionUnavailable, decrypt_secret, encrypt_secret
from app.core.llm import get_llm_client_for
from app.core.llm.base import LLMAuthError, LLMUnavailable
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


async def _get_existing_row(
    user_id: uuid.UUID, provider_id: str, db: AsyncSession
) -> UserLLMProvider | None:
    return (
        await db.scalars(
            select(UserLLMProvider).where(
                UserLLMProvider.user_id == user_id,
                UserLLMProvider.provider == provider_id,
            )
        )
    ).one_or_none()


async def list_providers(user: User, db: AsyncSession) -> list[UserLLMProviderResponse]:
    stmt = select(UserLLMProvider).where(UserLLMProvider.user_id == user.id)
    rows = (await db.scalars(stmt)).all()
    return [_to_response(row, user) for row in rows]


async def _validate_key_live(provider_id: str, api_key: str, model: str | None = None) -> None:
    """One minimal generation call to catch a pasted typo/wrong key.

    Only LLMAuthError (401/403) blocks the save with a client-facing 422 — a
    provider outage, timeout, or other transient failure must not stop the user
    from storing what may be a perfectly valid key. A broken provider registry
    (get_llm_client_for's own ValueError) is different: it's a genuine server-side
    misconfiguration, not "probably fine", so it must not be swallowed as if it
    were a harmless transient failure and let an unvalidated key through silently.
    """
    try:
        client = get_llm_client_for(provider_id)
        # Probe the model the credential will actually be used with. Validating against
        # settings.LLM_MODEL instead would pass for a key that has no access to the
        # model the user picked, and fail for one that does.
        await client.complete(
            "You are a test.",
            "Reply with OK.",
            max_tokens=1,
            temperature=0.0,
            api_key=api_key,
            model=model,
        )
    except LLMAuthError:
        raise HTTPException(status_code=422, detail="LLM_KEY_INVALID") from None
    except ValueError as exc:
        raise HTTPException(status_code=503, detail="LLM_PROVIDER_MISCONFIGURED") from exc
    except LLMUnavailable as exc:
        # Only a provider-side failure — network, timeout, outage — is treated as
        # "probably fine, store it anyway". Narrowed from a bare Exception, which also
        # swallowed TypeError/AttributeError from a genuine adapter bug and stored the
        # key unvalidated as though nothing were wrong.
        _logger.warning("LLM key validation call failed for provider %s: %s", provider_id, exc)


async def upsert_provider(
    user: User, provider_id: str, data: UserLLMProviderUpdate, db: AsyncSession
) -> UserLLMProviderResponse:
    require_not_demo(user)
    spec = get_provider(provider_id)
    if not spec.available:
        raise HTTPException(status_code=422, detail="PROVIDER_NOT_AVAILABLE")

    existing = await _get_existing_row(user.id, provider_id, db)

    has_new_key = bool(data.api_key)
    if existing is None and not has_new_key:
        raise HTTPException(status_code=422, detail="API_KEY_REQUIRED")

    encrypted: str | None = None
    hint: str | None = None
    if has_new_key:
        # Encrypt first: it's cheap and doesn't depend on validation, so a
        # misconfigured server (no CREDENTIAL_ENCRYPTION_KEY) 503s before we ever
        # burn a real call against the user's provider quota.
        try:
            encrypted = encrypt_secret(data.api_key)
        except CredentialEncryptionUnavailable as exc:
            raise HTTPException(status_code=503, detail="CREDENTIAL_STORAGE_UNAVAILABLE") from exc
        hint = data.api_key[-4:]
        await _validate_key_live(provider_id, data.api_key, data.model)

    is_first_ever = False
    if existing is not None:
        row = existing
    else:
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
        db.add(row)
        try:
            await db.flush()
        except IntegrityError:
            # Two near-simultaneous upserts for the same (user, provider) both saw
            # `existing is None` — the loser here falls back to updating the
            # winner's row instead of propagating an opaque 500.
            await db.rollback()
            # rollback() unconditionally expires every object in the session (unlike
            # commit(), it ignores expire_on_commit=False) — refresh `user` explicitly
            # now, in a properly awaited context, so later attribute access (here and
            # in the clamping/_to_response calls below) can't hit a bare, un-awaited
            # lazy-load and blow up with MissingGreenlet.
            await db.refresh(user)
            row = await _get_existing_row(user.id, provider_id, db)
            if row is None:
                raise
            is_first_ever = False

    # Field assignments applied exactly once, regardless of which branch above
    # produced `row` — new, pre-existing, or the race-fallback re-fetch.
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

    # The ceiling is applied on read by effective_rpm_limit/effective_tpm_limit, so it
    # is deliberately NOT written back here. Persisting the clamped value destroys the
    # user's stated intent: someone who asks for 999 under a ceiling of 20 would have 20
    # written, and raising their ceiling later would not restore what they asked for.

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
    row = await _get_existing_row(user.id, provider_id, db)
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
        # Several enabled credentials and no single default. Picking one arbitrarily
        # would spend an unpredictable key, so nothing is resolved — but say so, because
        # the caller's alternative is to silently spend the server's key instead.
        _logger.warning(
            "User %s has %d enabled credentials and %d marked default; none resolved",
            user.id,
            len(rows),
            len(defaults),
        )
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
