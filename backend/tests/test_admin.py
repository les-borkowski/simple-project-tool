import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.services import get_totals, get_weekly_trends
from app.core.config import settings
from app.db.models import User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _admin_login(client: AsyncClient) -> None:
    await client.post(
        "/admin/login",
        data={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_PASSWORD},
    )


async def _create_user_via_admin(client: AsyncClient, email: str, name: str = "Test") -> None:
    await client.post(
        "/admin/users",
        data={"name": name, "email": email, "password": "password123", "role": "contributor"},
    )


async def test_get_totals_returns_counts(db: AsyncSession):
    user = User(
        email=f"admin_svc_{uuid.uuid4().hex[:8]}@example.com",
        name="Admin Test",
        password_hash="x",
        last_login=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add(user)
    await db.flush()

    totals = await get_totals(db)

    assert totals["users"] >= 1
    assert isinstance(totals["projects"], int)
    assert isinstance(totals["stories"], int)
    assert isinstance(totals["tasks"], int)
    assert totals["last_login"] is not None


async def test_get_weekly_trends_returns_52_weeks(db: AsyncSession):
    trends = await get_weekly_trends(db)

    assert set(trends.keys()) == {"users", "projects", "stories", "tasks"}
    assert len(trends["users"]) == 52
    assert all("week" in point and "count" in point for point in trends["users"])
    assert all(isinstance(point["count"], int) for point in trends["users"])


async def test_admin_unauthenticated_redirects(api_client: AsyncClient):
    resp = await api_client.get("/admin", follow_redirects=False)
    assert resp.status_code == 302
    assert "/admin/login" in resp.headers["location"]


async def test_admin_login_page_ok(api_client: AsyncClient):
    resp = await api_client.get("/admin/login")
    assert resp.status_code == 200
    assert b"Admin login" in resp.content


async def test_admin_login_wrong_credentials(api_client: AsyncClient):
    resp = await api_client.post("/admin/login", data={"username": "wrong", "password": "wrong"})
    assert resp.status_code == 401
    assert b"Invalid credentials" in resp.content


async def test_admin_login_success_redirects(api_client: AsyncClient):
    resp = await api_client.post(
        "/admin/login",
        data={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_PASSWORD},
        follow_redirects=False,
    )
    assert resp.status_code == 302
    assert resp.headers["location"] == "/admin"


async def test_admin_dashboard_after_login(api_client: AsyncClient):
    await api_client.post(
        "/admin/login",
        data={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_PASSWORD},
    )
    resp = await api_client.get("/admin")
    assert resp.status_code == 200
    assert b"Dashboard" in resp.content


async def test_admin_logout_clears_session(api_client: AsyncClient):
    await api_client.post(
        "/admin/login",
        data={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_PASSWORD},
    )
    await api_client.post("/admin/logout", follow_redirects=False)
    resp = await api_client.get("/admin", follow_redirects=False)
    assert resp.status_code == 302
    assert "/admin/login" in resp.headers["location"]


# ---------------------------------------------------------------------------
# User management — list & create
# ---------------------------------------------------------------------------


async def test_users_list_requires_session(api_client: AsyncClient):
    resp = await api_client.get("/admin/users", follow_redirects=False)
    assert resp.status_code == 302
    assert "/admin/login" in resp.headers["location"]


async def test_users_new_requires_session(api_client: AsyncClient):
    resp = await api_client.get("/admin/users/new", follow_redirects=False)
    assert resp.status_code == 302
    assert "/admin/login" in resp.headers["location"]


async def test_create_user_auto_verified(api_client: AsyncClient, api_db: AsyncSession):
    await _admin_login(api_client)
    email = f"newuser_{uuid.uuid4().hex[:8]}@example.com"

    resp = await api_client.post(
        "/admin/users",
        data={"name": "New Person", "email": email, "password": "password123", "role": "contributor"},
        follow_redirects=False,
    )
    assert resp.status_code == 302

    from sqlalchemy import select
    user = await api_db.scalar(select(User).where(User.email == email))
    assert user is not None
    assert user.email_confirmed is True
    assert user.is_blocked is False


async def test_create_user_duplicate_email_redirects_with_error(api_client: AsyncClient, api_db: AsyncSession):
    await _admin_login(api_client)
    email = f"dup_{uuid.uuid4().hex[:8]}@example.com"
    await _create_user_via_admin(api_client, email)

    resp = await api_client.post(
        "/admin/users",
        data={"name": "Dup", "email": email, "password": "password123", "role": "contributor"},
        follow_redirects=False,
    )
    # Redirects back to create form on error
    assert resp.status_code == 302
    assert "/admin/users/new" in resp.headers["location"]


async def test_users_list_shows_created_user(api_client: AsyncClient):
    await _admin_login(api_client)
    email = f"listed_{uuid.uuid4().hex[:8]}@example.com"
    await _create_user_via_admin(api_client, email, name="Listed User")

    resp = await api_client.get("/admin/users")
    assert resp.status_code == 200
    assert email.encode() in resp.content


# ---------------------------------------------------------------------------
# Verify
# ---------------------------------------------------------------------------


async def test_verify_user(api_client: AsyncClient, api_db: AsyncSession):
    from sqlalchemy import select, update

    await _admin_login(api_client)
    email = f"unverified_{uuid.uuid4().hex[:8]}@example.com"
    await _create_user_via_admin(api_client, email)

    # Force unverified
    await api_db.execute(update(User).where(User.email == email).values(email_confirmed=False))
    await api_db.flush()

    user = await api_db.scalar(select(User).where(User.email == email))
    resp = await api_client.post(f"/admin/users/{user.id}/verify", follow_redirects=False)
    assert resp.status_code == 302

    await api_db.refresh(user)
    assert user.email_confirmed is True


# ---------------------------------------------------------------------------
# Block / unblock
# ---------------------------------------------------------------------------


async def test_block_user_prevents_login(api_client: AsyncClient, api_db: AsyncSession):
    from sqlalchemy import select

    await _admin_login(api_client)
    email = f"toblock_{uuid.uuid4().hex[:8]}@example.com"
    await _create_user_via_admin(api_client, email)

    user = await api_db.scalar(select(User).where(User.email == email))
    await api_client.post(f"/admin/users/{user.id}/block")

    resp = await api_client.post(
        "/api/v1/auth/login", json={"email": email, "password": "password123"}
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "ACCOUNT_BLOCKED"


async def test_blocked_user_api_rejected(api_client: AsyncClient, api_db: AsyncSession):
    from sqlalchemy import select, update

    await _admin_login(api_client)
    email = f"blockapi_{uuid.uuid4().hex[:8]}@example.com"
    await _create_user_via_admin(api_client, email)

    # Get a valid token before blocking
    login_resp = await api_client.post(
        "/api/v1/auth/login", json={"email": email, "password": "password123"}
    )
    token = login_resp.json()["access_token"]

    # Block the user
    user = await api_db.scalar(select(User).where(User.email == email))
    await api_db.execute(update(User).where(User.id == user.id).values(is_blocked=True))
    await api_db.flush()

    # Existing token should now be rejected
    resp = await api_client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 403


async def test_unblock_user_restores_login(api_client: AsyncClient, api_db: AsyncSession):
    from sqlalchemy import select

    await _admin_login(api_client)
    email = f"unblock_{uuid.uuid4().hex[:8]}@example.com"
    await _create_user_via_admin(api_client, email)

    user = await api_db.scalar(select(User).where(User.email == email))
    await api_client.post(f"/admin/users/{user.id}/block")
    await api_client.post(f"/admin/users/{user.id}/unblock")

    resp = await api_client.post(
        "/api/v1/auth/login", json={"email": email, "password": "password123"}
    )
    assert resp.status_code == 200
    assert "access_token" in resp.json()


# ---------------------------------------------------------------------------
# Reset password
# ---------------------------------------------------------------------------


async def test_reset_password_sends_email(api_client: AsyncClient, api_db: AsyncSession):
    from sqlalchemy import select

    await _admin_login(api_client)
    email = f"resetpwd_{uuid.uuid4().hex[:8]}@example.com"
    await _create_user_via_admin(api_client, email)

    user = await api_db.scalar(select(User).where(User.email == email))

    with patch("app.core.email.send_email", new=AsyncMock()) as mock_send:
        resp = await api_client.post(
            f"/admin/users/{user.id}/reset-password", follow_redirects=False
        )
        assert resp.status_code == 302
        mock_send.assert_called_once()
        call_args = mock_send.call_args
        assert call_args[0][0] == email  # to address


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


async def test_delete_user(api_client: AsyncClient, api_db: AsyncSession):
    from sqlalchemy import select

    await _admin_login(api_client)
    email = f"todelete_{uuid.uuid4().hex[:8]}@example.com"
    await _create_user_via_admin(api_client, email)

    user = await api_db.scalar(select(User).where(User.email == email))
    assert user is not None

    resp = await api_client.post(f"/admin/users/{user.id}/delete", follow_redirects=False)
    assert resp.status_code == 302

    gone = await api_db.scalar(select(User).where(User.email == email))
    assert gone is None


# ---------------------------------------------------------------------------
# Unauthenticated access to action routes
# ---------------------------------------------------------------------------


async def test_action_routes_require_session(api_client: AsyncClient):
    fake_id = uuid.uuid4()
    routes = [
        ("POST", f"/admin/users/{fake_id}/verify"),
        ("POST", f"/admin/users/{fake_id}/block"),
        ("POST", f"/admin/users/{fake_id}/unblock"),
        ("POST", f"/admin/users/{fake_id}/reset-password"),
        ("POST", f"/admin/users/{fake_id}/delete"),
    ]
    for method, url in routes:
        resp = await api_client.request(method, url, follow_redirects=False)
        assert resp.status_code == 302, f"{method} {url} should redirect unauthenticated"
        assert "/admin/login" in resp.headers["location"]
