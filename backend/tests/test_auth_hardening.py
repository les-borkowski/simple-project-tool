"""Tests for auth hardening fixes (Task 3)."""
import secrets
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import bcrypt
import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import RoleEnum
from app.db.models import User


@pytest.mark.asyncio
async def test_register_short_password_rejected(api_client: AsyncClient):
    """POST /auth/register with password shorter than 8 chars must return 422."""
    email = f"short_{uuid.uuid4().hex[:8]}@example.com"
    resp = await api_client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Short Pw", "password": "short"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_accept_invitation_double_accept_409(
    api_client: AsyncClient,
    api_db: AsyncSession,
    manager_headers: dict,
    auth_headers: dict,
    test_project: dict,
):
    """Second accept of the same invitation must return 409, not 500."""
    # Get the invitee user's email from the auth_headers fixture.
    # We need to register a fresh invitee so we know their email.
    invitee_email = f"invitee_{uuid.uuid4().hex[:8]}@example.com"

    # Register invitee
    with patch("app.core.email.send_email", new=AsyncMock()):
        await api_client.post(
            "/api/v1/auth/register",
            json={"email": invitee_email, "name": "Invitee", "password": "inviteepw123"},
        )
    await api_db.execute(
        update(User).where(User.email == invitee_email).values(email_confirmed=True)
    )
    await api_db.flush()

    # Login as invitee to get token
    resp = await api_client.post(
        "/api/v1/auth/login",
        json={"email": invitee_email, "password": "inviteepw123"},
    )
    invitee_token = resp.json()["access_token"]
    invitee_headers = {"Authorization": f"Bearer {invitee_token}"}

    # Create invitation from manager
    with patch("app.api.routes.invitations.send_invitation_email", new=AsyncMock()):
        inv_resp = await api_client.post(
            f"/api/v1/projects/{test_project['id']}/invitations",
            json={"invitee_email": invitee_email},
            headers=manager_headers,
        )
    assert inv_resp.status_code == 201
    invitation_id = inv_resp.json()["id"]

    # First accept — must succeed (204)
    accept1 = await api_client.post(
        f"/api/v1/invitations/{invitation_id}/accept",
        headers=invitee_headers,
    )
    assert accept1.status_code == 204

    # Second accept — must return 409, not 500
    accept2 = await api_client.post(
        f"/api/v1/invitations/{invitation_id}/accept",
        headers=invitee_headers,
    )
    assert accept2.status_code == 409


@pytest.mark.asyncio
async def test_user_time_report_forbidden_for_other_user(
    api_client: AsyncClient,
    api_db: AsyncSession,
    auth_headers: dict,
):
    """User A cannot view User B's time report — must get 403."""
    # Register a second user (user B)
    other_email = f"userb_{uuid.uuid4().hex[:8]}@example.com"
    with patch("app.core.email.send_email", new=AsyncMock()):
        reg_resp = await api_client.post(
            "/api/v1/auth/register",
            json={"email": other_email, "name": "User B", "password": "userbpassword"},
        )
    other_user_id = reg_resp.json()["id"]

    # User A (auth_headers) tries to view user B's time report
    resp = await api_client.get(
        f"/api/v1/users/{other_user_id}/time-report",
        headers=auth_headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_legacy_api_key_empty_prefix_still_authenticates(api_db: AsyncSession):
    """Issue #1: API keys with key_prefix='' (pre-migration state) must still authenticate.

    The O(1) prefix lookup uses WHERE key_prefix = <first-8-chars>.  Pre-existing
    rows have key_prefix='' after the migration's server_default.  Without a fallback
    those keys silently fail every auth attempt with 401.
    """


    from app.auth.dependencies import get_current_user_or_api_key
    from app.db.models.api_key import APIKey
    from app.db.models.user import User

    # Insert a real user so db.get(User, ...) returns it
    user_id = uuid.uuid4()
    user = User(
        id=user_id,
        email=f"legacy_key_{uuid.uuid4().hex[:8]}@example.com",
        name="Legacy Key User",
        password_hash="irrelevant",
        role=RoleEnum.contributor,
        email_confirmed=True,
    )
    api_db.add(user)

    # Insert an API key with empty key_prefix (simulates pre-migration row)
    raw_key = secrets.token_urlsafe(32)
    key_hash = bcrypt.hashpw(raw_key.encode(), bcrypt.gensalt(rounds=4)).decode()
    api_key = APIKey(
        user_id=user_id,
        key_hash=key_hash,
        key_prefix="",  # ← legacy empty prefix, as set by migration server_default
        label="legacy",
        scopes=["read:tasks"],
    )
    api_db.add(api_key)
    await api_db.flush()

    # Build a minimal mock Request with the raw key in X-API-Key
    mock_request = MagicMock()
    mock_request.headers.get.return_value = raw_key
    mock_request.state = MagicMock()

    # Should return the user, not raise 401
    result = await get_current_user_or_api_key(
        request=mock_request,
        token=None,
        db=api_db,
    )
    assert str(result.id) == str(user_id), (
        "Legacy API key (key_prefix='') was not found — the empty-prefix fallback is missing"
    )
