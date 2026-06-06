import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User


@pytest.mark.asyncio
async def test_register_success(api_client: AsyncClient):
    email = f"new_{uuid.uuid4().hex[:8]}@example.com"
    resp = await api_client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Alice", "password": "secret123"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == email
    assert data["name"] == "Alice"
    assert "id" in data
    assert "password" not in data
    assert "password_hash" not in data


@pytest.mark.asyncio
async def test_register_duplicate_email(api_client: AsyncClient):
    email = f"dup_{uuid.uuid4().hex[:8]}@example.com"
    payload = {"email": email, "name": "Bob", "password": "secret123"}
    await api_client.post("/api/v1/auth/register", json=payload)
    resp = await api_client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_login_success(api_client: AsyncClient, api_db: AsyncSession):
    from sqlalchemy import update as sa_update

    email = f"login_{uuid.uuid4().hex[:8]}@example.com"
    await api_client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Carol", "password": "mypassword"},
    )
    await api_db.execute(sa_update(User).where(User.email == email).values(email_confirmed=True))
    await api_db.flush()
    resp = await api_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "mypassword"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" not in data
    assert data["token_type"] == "bearer"
    # Refresh token is now in an httpOnly cookie, not the response body
    assert "spt_refresh" in resp.cookies


@pytest.mark.asyncio
async def test_login_wrong_password(api_client: AsyncClient):
    email = f"wrong_{uuid.uuid4().hex[:8]}@example.com"
    await api_client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Dave", "password": "correctpass"},
    )
    resp = await api_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "wrongpass"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_email(api_client: AsyncClient):
    resp = await api_client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@nowhere.com", "password": "whatever"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_authenticated(api_client: AsyncClient, auth_token: str):
    resp = await api_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data
    assert "email" in data


@pytest.mark.asyncio
async def test_me_unauthenticated(api_client: AsyncClient):
    resp = await api_client.get("/api/v1/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_sets_last_login(api_client: AsyncClient, api_db: AsyncSession):
    from sqlalchemy import update as sa_update

    email = f"lastlogin_{uuid.uuid4().hex[:8]}@example.com"
    await api_client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Test", "password": "password123"},
    )

    user = await api_db.scalar(select(User).where(User.email == email))
    assert user.last_login is None

    await api_db.execute(sa_update(User).where(User.email == email).values(email_confirmed=True))
    await api_db.flush()

    await api_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "password123"},
    )

    await api_db.refresh(user)
    assert user.last_login is not None


@pytest.mark.asyncio
async def test_change_password_success(api_client: AsyncClient, auth_headers: dict):
    resp = await api_client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "testpassword123", "new_password": "newpassword456"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["message"] == "Password updated"


@pytest.mark.asyncio
async def test_change_password_wrong_current(api_client: AsyncClient, auth_headers: dict):
    resp = await api_client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "wrongpassword", "new_password": "newpassword456"},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "Current password is incorrect"


@pytest.mark.asyncio
async def test_change_password_unauthenticated(api_client: AsyncClient):
    resp = await api_client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "testpassword123", "new_password": "newpassword456"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_change_password_new_password_works(
    api_client: AsyncClient, auth_headers: dict, api_db: AsyncSession
):
    """After changing password, user can log in with the new one."""
    from sqlalchemy import update as sa_update

    email = f"changepw_{__import__('uuid').uuid4().hex[:8]}@example.com"
    await api_client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "PwTest", "password": "oldpassword123"},
    )
    await api_db.execute(sa_update(User).where(User.email == email).values(email_confirmed=True))
    await api_db.flush()
    login_resp = await api_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "oldpassword123"},
    )
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    await api_client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "oldpassword123", "new_password": "brandnew789"},
        headers=headers,
    )

    resp = await api_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "brandnew789"},
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_login_blocked_when_email_not_confirmed(api_client: AsyncClient):
    email = f"unconf_{uuid.uuid4().hex[:8]}@example.com"
    with patch("app.core.email.send_email", new=AsyncMock()):
        await api_client.post(
            "/api/v1/auth/register",
            json={"email": email, "name": "Unconfirmed", "password": "secret123"},
        )
    resp = await api_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "secret123"},
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "EMAIL_NOT_CONFIRMED"


@pytest.mark.asyncio
async def test_confirm_email_allows_login(api_client: AsyncClient, api_db):
    from app.auth.security import create_email_confirmation_token
    from app.db.models import User

    email = f"conf_{uuid.uuid4().hex[:8]}@example.com"
    with patch("app.core.email.send_email", new=AsyncMock()):
        await api_client.post(
            "/api/v1/auth/register",
            json={"email": email, "name": "Conf User", "password": "secret123"},
        )
    user = await api_db.scalar(select(User).where(User.email == email))
    token = create_email_confirmation_token(user.id)

    resp = await api_client.post("/api/v1/auth/confirm-email", json={"token": token})
    assert resp.status_code == 200

    login_resp = await api_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "secret123"},
    )
    assert login_resp.status_code == 200
    assert "access_token" in login_resp.json()


@pytest.mark.asyncio
async def test_password_reset_sends_email(api_client: AsyncClient, api_db):
    from sqlalchemy import update

    email = f"reset_{uuid.uuid4().hex[:8]}@example.com"
    with patch("app.core.email.send_email", new=AsyncMock()):
        await api_client.post(
            "/api/v1/auth/register",
            json={"email": email, "name": "Reset User", "password": "oldpassword"},
        )
    await api_db.execute(update(User).where(User.email == email).values(email_confirmed=True))
    await api_db.flush()

    with patch("app.core.email.send_password_reset_email", new=AsyncMock()) as mock_send:
        resp = await api_client.post("/api/v1/auth/password-reset", json={"email": email})
    assert resp.status_code == 200
    mock_send.assert_called_once()
    args = mock_send.call_args[0]
    assert args[0] == email
    assert args[2]


@pytest.mark.asyncio
async def test_password_reset_does_not_return_token(api_client: AsyncClient, api_db):
    """POST /auth/password-reset must never expose the reset token in the response."""
    from sqlalchemy import update

    email = f"noleak_{uuid.uuid4().hex[:8]}@example.com"
    with patch("app.core.email.send_email", new=AsyncMock()):
        await api_client.post(
            "/api/v1/auth/register",
            json={"email": email, "name": "No Leak", "password": "secret123"},
        )
    await api_db.execute(update(User).where(User.email == email).values(email_confirmed=True))
    await api_db.flush()

    with patch("app.core.email.send_password_reset_email", new=AsyncMock()):
        resp = await api_client.post("/api/v1/auth/password-reset", json={"email": email})

    assert resp.status_code == 200
    data = resp.json()
    assert "reset_token" not in data
    assert "message" in data


@pytest.mark.asyncio
async def test_password_reset_token_is_single_use(api_client: AsyncClient, api_db):
    """Using a password-reset token a second time must fail with 400."""
    from sqlalchemy import update

    from app.auth.security import create_password_reset_token

    email = f"singleuse_{uuid.uuid4().hex[:8]}@example.com"
    with patch("app.core.email.send_email", new=AsyncMock()):
        await api_client.post(
            "/api/v1/auth/register",
            json={"email": email, "name": "Single Use", "password": "oldpassword"},
        )
    await api_db.execute(update(User).where(User.email == email).values(email_confirmed=True))
    await api_db.flush()

    user = await api_db.scalar(select(User).where(User.email == email))
    token = create_password_reset_token(user.id, user.password_changed_at)

    # First use — should succeed
    resp1 = await api_client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": token, "new_password": "newpassword1"},
    )
    assert resp1.status_code == 200

    # Second use with the same token — must be rejected
    resp2 = await api_client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": token, "new_password": "newpassword2"},
    )
    assert resp2.status_code == 400
    assert "already been used" in resp2.json()["error"]["code"]


@pytest.mark.asyncio
async def test_refresh_blocked_for_unconfirmed_user(api_client: AsyncClient, api_db):
    """Refresh token for a user that has not confirmed email must return 403."""
    from app.auth.security import create_refresh_token

    email = f"unconf_refresh_{uuid.uuid4().hex[:8]}@example.com"
    # Register but do NOT confirm email
    with patch("app.core.email.send_email", new=AsyncMock()):
        await api_client.post(
            "/api/v1/auth/register",
            json={"email": email, "name": "Unconfirmed Refresh", "password": "secret123"},
        )

    user = await api_db.scalar(select(User).where(User.email == email))
    refresh_token = create_refresh_token(user.id)

    # Refresh token is now sent via httpOnly cookie
    resp = await api_client.post(
        "/api/v1/auth/refresh",
        cookies={"spt_refresh": refresh_token},
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "EMAIL_NOT_CONFIRMED"
