"""The re-encryption step of a CREDENTIAL_ENCRYPTION_KEY rotation."""

import uuid

import pytest
from cryptography.fernet import Fernet
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import crypto
from app.db.models import User, UserLLMProvider
from scripts.rotate_credentials import rotate_all

KEY_OLD = Fernet.generate_key().decode()
KEY_NEW = Fernet.generate_key().decode()


@pytest.fixture(autouse=True)
def _clear_cache():
    crypto.reset_cipher_cache()
    yield
    crypto.reset_cipher_cache()


def _set_keys(monkeypatch, value: str) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "CREDENTIAL_ENCRYPTION_KEY", value)
    crypto.reset_cipher_cache()


async def _stored_credential(db: AsyncSession, ciphertext: str) -> UserLLMProvider:
    user = User(
        id=uuid.uuid4(),
        email=f"rot_{uuid.uuid4().hex[:8]}@example.com",
        name="Rotate User",
        password_hash="x",
        email_confirmed=True,
    )
    db.add(user)
    await db.flush()

    row = UserLLMProvider(
        user_id=user.id,
        provider="google",
        api_key_encrypted=ciphertext,
        api_key_hint="key1",
        is_default=True,
        enabled=True,
    )
    db.add(row)
    await db.flush()
    return row


async def test_rows_written_under_the_old_key_become_readable_by_the_new_one_alone(
    api_db: AsyncSession, monkeypatch
):
    _set_keys(monkeypatch, KEY_OLD)
    row = await _stored_credential(api_db, crypto.encrypt_secret("sk-user-secret"))

    _set_keys(monkeypatch, f"{KEY_NEW},{KEY_OLD}")
    rotated, failed = await rotate_all(api_db, dry_run=False)

    assert (rotated, failed) == (1, 0)

    # Retire the old key: the row must still decrypt.
    _set_keys(monkeypatch, KEY_NEW)
    assert crypto.decrypt_secret(row.api_key_encrypted) == "sk-user-secret"


async def test_dry_run_changes_nothing(api_db: AsyncSession, monkeypatch):
    _set_keys(monkeypatch, KEY_OLD)
    row = await _stored_credential(api_db, crypto.encrypt_secret("sk-user-secret"))
    before = row.api_key_encrypted

    _set_keys(monkeypatch, f"{KEY_NEW},{KEY_OLD}")
    rotated, failed = await rotate_all(api_db, dry_run=True)

    assert (rotated, failed) == (1, 0)
    assert row.api_key_encrypted == before


async def test_an_unreadable_row_is_reported_without_aborting_the_rest(
    api_db: AsyncSession, monkeypatch
):
    """One row whose writing key is already gone must not block every other row."""
    _set_keys(monkeypatch, KEY_OLD)
    good = await _stored_credential(api_db, crypto.encrypt_secret("sk-good"))

    stranded_key = Fernet.generate_key().decode()
    _set_keys(monkeypatch, stranded_key)
    await _stored_credential(api_db, crypto.encrypt_secret("sk-stranded"))

    _set_keys(monkeypatch, f"{KEY_NEW},{KEY_OLD}")
    rotated, failed = await rotate_all(api_db, dry_run=False)

    assert rotated == 1
    assert failed == 1

    _set_keys(monkeypatch, KEY_NEW)
    assert crypto.decrypt_secret(good.api_key_encrypted) == "sk-good"


async def test_rotation_is_idempotent(api_db: AsyncSession, monkeypatch):
    _set_keys(monkeypatch, f"{KEY_NEW},{KEY_OLD}")
    row = await _stored_credential(api_db, crypto.encrypt_secret("sk-user-secret"))

    await rotate_all(api_db, dry_run=False)
    await rotate_all(api_db, dry_run=False)

    _set_keys(monkeypatch, KEY_NEW)
    assert crypto.decrypt_secret(row.api_key_encrypted) == "sk-user-secret"
