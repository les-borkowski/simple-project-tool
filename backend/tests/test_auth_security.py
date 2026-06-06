"""Unit tests for app.auth.security — no database required."""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock

import bcrypt
import jwt
import pytest
from fastapi import HTTPException

from app.auth.security import (
    check_scope,
    create_access_token,
    create_password_reset_token,
    create_refresh_token,
    decode_token,
    generate_api_key,
    hash_password,
    verify_password,
    verify_password_reset_token,
)
from app.core.config import settings
from app.db.base import RoleEnum
from app.db.models.api_key import APIKey

# --- Password hashing ---


def test_hash_and_verify_password_round_trip():
    """hash_password + verify_password with correct password returns True."""
    plain = "super-secret-123"
    hashed = hash_password(plain)
    assert verify_password(plain, hashed) is True


def test_verify_password_wrong_password():
    """verify_password with wrong password returns False."""
    hashed = hash_password("correct-password")
    assert verify_password("wrong-password", hashed) is False


# --- JWT tokens ---


def test_create_access_token_decode():
    """create_access_token + decode_token returns correct sub and role."""
    user_id = uuid.uuid4()
    role = RoleEnum.manager
    token = create_access_token(user_id, role)
    payload = decode_token(token)
    assert payload["sub"] == str(user_id)
    assert payload["role"] == role.value
    assert payload["type"] == "access"


def test_create_refresh_token_decode():
    """create_refresh_token + decode_token returns correct sub and type."""
    user_id = uuid.uuid4()
    token = create_refresh_token(user_id)
    payload = decode_token(token)
    assert payload["sub"] == str(user_id)
    assert payload["type"] == "refresh"


def test_expired_token_raises_401():
    """Expired token raises HTTPException with 401 status."""
    user_id = uuid.uuid4()
    expired_token = jwt.encode(
        {
            "sub": str(user_id),
            "type": "access",
            "exp": datetime.now(UTC) - timedelta(seconds=10),
        },
        settings.SECRET_KEY,
        algorithm="HS256",
    )
    with pytest.raises(HTTPException) as exc_info:
        decode_token(expired_token)
    assert exc_info.value.status_code == 401
    assert "expired" in exc_info.value.detail.lower()


def test_token_with_wrong_secret_raises_401():
    """Token signed with wrong secret raises HTTPException with 401 status."""
    user_id = uuid.uuid4()
    # Encode a token with a completely invalid signature to ensure 401
    invalid_token = jwt.encode(
        {
            "sub": str(user_id),
            "type": "refresh",
            "exp": datetime.now(UTC) + timedelta(hours=1),
        },
        "wrong-secret-key",
        algorithm="HS256",
    )
    with pytest.raises(HTTPException) as exc_info:
        decode_token(invalid_token)
    assert exc_info.value.status_code == 401


def test_invalid_token_raises_401():
    """Completely invalid token raises HTTPException with 401 status."""
    with pytest.raises(HTTPException) as exc_info:
        decode_token("not.a.valid.jwt.token")
    assert exc_info.value.status_code == 401


# --- API key generation ---


def test_generate_api_key_raw_not_equal_hash():
    """generate_api_key returns raw key that differs from the hash."""
    raw_key, key_hash = generate_api_key()
    assert raw_key != key_hash


def test_generate_api_key_bcrypt_verify():
    """bcrypt.checkpw verifies the raw key against the hash."""
    raw_key, key_hash = generate_api_key()
    assert bcrypt.checkpw(raw_key.encode(), key_hash.encode()) is True


def test_generate_api_key_unique():
    """Two calls generate different keys."""
    raw1, _ = generate_api_key()
    raw2, _ = generate_api_key()
    assert raw1 != raw2


# --- Scope checking helpers ---


def _make_api_key(scopes: list[str], revoked: bool = False) -> MagicMock:
    """Create a mock APIKey with given scopes and optional revocation."""
    key = MagicMock()
    key.scopes = scopes
    key.revoked_at = datetime.now(UTC) if revoked else None
    return key


# --- Scope checking ---


def test_write_tasks_grants_read_tasks():
    """API key with write:tasks scope passes check for read:tasks."""
    api_key = _make_api_key(["write:tasks"])
    assert check_scope(api_key, "read:tasks") is True


def test_read_tasks_does_not_grant_write_tasks():
    """API key with only read:tasks does NOT pass check for write:tasks."""
    api_key = _make_api_key(["read:tasks"])
    assert check_scope(api_key, "write:tasks") is False


def test_admin_grants_all_scopes():
    """API key with admin scope passes check for every defined scope."""
    api_key = _make_api_key(["admin"])
    all_scopes = [
        "read:projects",
        "write:projects",
        "read:stories",
        "write:stories",
        "read:tasks",
        "write:tasks",
        "read:comments",
        "write:comments",
    ]
    for scope in all_scopes:
        assert check_scope(api_key, scope) is True, f"admin should grant {scope}"


def test_revoked_api_key_check_scope_returns_false():
    """Revoked API key always returns False for check_scope, regardless of scopes."""
    api_key = _make_api_key(["admin"], revoked=True)
    assert check_scope(api_key, "read:projects") is False


def test_check_scope_empty_scopes_returns_false():
    """API key with no scopes returns False for any required scope."""
    api_key = MagicMock(spec=APIKey)
    api_key.revoked_at = None
    api_key.scopes = []
    assert check_scope(api_key, "read:projects") is False


def test_scope_hierarchy_write_projects_grants_read():
    """write:projects grants read:projects via SCOPE_HIERARCHY."""
    api_key = _make_api_key(["write:projects"])
    assert check_scope(api_key, "read:projects") is True
    assert check_scope(api_key, "write:projects") is True


def test_scope_hierarchy_write_comments_grants_read():
    """write:comments grants read:comments via SCOPE_HIERARCHY."""
    api_key = _make_api_key(["write:comments"])
    assert check_scope(api_key, "read:comments") is True


def test_check_scope_admin_grants_admin_itself():
    api_key = MagicMock(spec=APIKey)
    api_key.revoked_at = None
    api_key.scopes = ["admin"]
    assert check_scope(api_key, "admin") is True


# --- Password reset tokens ---


def test_verify_password_reset_token_wrong_type_raises_400():
    """verify_password_reset_token with an access token raises HTTPException 400."""
    user_id = uuid.uuid4()
    # Create an access token (type="access") and try to use it as a reset token
    access_token = create_access_token(user_id, RoleEnum.contributor)
    with pytest.raises(HTTPException) as exc_info:
        verify_password_reset_token(access_token, None)
    assert exc_info.value.status_code == 400


def test_verify_password_reset_token_expired_raises_401():
    """verify_password_reset_token with expired token raises HTTPException 401."""
    user_id = uuid.uuid4()
    expired_reset_token = jwt.encode(
        {
            "sub": str(user_id),
            "type": "password_reset",
            "pw_ts": "",
            "exp": datetime.now(UTC) - timedelta(seconds=10),
        },
        settings.SECRET_KEY,
        algorithm="HS256",
    )
    with pytest.raises(HTTPException) as exc_info:
        verify_password_reset_token(expired_reset_token, None)
    assert exc_info.value.status_code == 401


def test_verify_password_reset_token_valid():
    """verify_password_reset_token with valid token returns correct UUID."""
    user_id = uuid.uuid4()
    token = create_password_reset_token(user_id, None)
    result = verify_password_reset_token(token, None)
    assert result == user_id


def test_verify_password_reset_token_single_use():
    """verify_password_reset_token raises 400 when pw_ts does not match current timestamp."""
    user_id = uuid.uuid4()
    password_changed_at = datetime.now(UTC).replace(tzinfo=None)
    token = create_password_reset_token(user_id, password_changed_at)
    # Simulate that the password has since changed (different timestamp)
    new_timestamp = datetime(2020, 1, 1, 0, 0, 0)
    with pytest.raises(HTTPException) as exc_info:
        verify_password_reset_token(token, new_timestamp)
    assert exc_info.value.status_code == 400
    assert "already been used" in exc_info.value.detail


# --- Email confirmation tokens ---


def test_create_and_verify_email_confirmation_token():
    """create_email_confirmation_token + verify_email_confirmation_token returns user_id."""
    from app.auth.security import create_email_confirmation_token, verify_email_confirmation_token

    user_id = uuid.uuid4()
    token = create_email_confirmation_token(user_id)
    result = verify_email_confirmation_token(token)
    assert result == user_id


def test_verify_email_confirmation_token_rejects_wrong_type():
    """verify_email_confirmation_token with password_reset token raises HTTPException 400."""
    from app.auth.security import verify_email_confirmation_token

    user_id = uuid.uuid4()
    token = create_password_reset_token(user_id, None)
    with pytest.raises(HTTPException) as exc_info:
        verify_email_confirmation_token(token)
    assert exc_info.value.status_code == 400
