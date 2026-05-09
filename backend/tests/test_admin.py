import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.services import get_totals, get_weekly_trends
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
