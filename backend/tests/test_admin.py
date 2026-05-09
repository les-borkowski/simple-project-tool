import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.services import get_totals, get_weekly_trends
from app.core.config import settings
from app.db.models import User


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
    resp = await api_client.post(
        "/admin/login", data={"username": "wrong", "password": "wrong"}
    )
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
