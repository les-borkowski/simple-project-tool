"""Password reset must be throttled per account.

The endpoint is newly linked from the UI by this branch's ForgotPasswordPage. Its
response is correctly constant regardless of whether the account exists, and the token
is single-use — but nothing stopped 10k POSTs against one known address, which
mail-bombs the victim and burns the operator's Mailgun quota.
"""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User


async def _register(api_client: AsyncClient, api_db: AsyncSession) -> str:
    email = f"reset_{uuid.uuid4().hex[:8]}@example.com"
    with patch("app.core.email.send_email", new=AsyncMock()):
        await api_client.post(
            "/api/v1/auth/register",
            json={"email": email, "name": "Reset User", "password": "testpassword123"},
        )
    return email


async def _request_reset(api_client: AsyncClient, email: str):
    with patch("app.core.email.send_password_reset_email", new=AsyncMock()) as sender:
        resp = await api_client.post("/api/v1/auth/password-reset", json={"email": email})
    return resp, sender


async def test_a_second_request_within_the_window_sends_no_second_email(
    api_client: AsyncClient, api_db: AsyncSession
):
    email = await _register(api_client, api_db)

    _, first = await _request_reset(api_client, email)
    assert first.called, "the first request should send a reset email"

    _, second = await _request_reset(api_client, email)
    assert not second.called, "a rapid second request mail-bombs the account"


async def test_the_response_is_unchanged_when_throttled(
    api_client: AsyncClient, api_db: AsyncSession
):
    """Throttling must not become an account-existence oracle."""
    email = await _register(api_client, api_db)

    first, _ = await _request_reset(api_client, email)
    throttled, _ = await _request_reset(api_client, email)
    unknown, _ = await _request_reset(api_client, f"nobody_{uuid.uuid4().hex[:8]}@example.com")

    assert first.status_code == throttled.status_code == unknown.status_code
    assert first.json() == throttled.json() == unknown.json()


async def test_a_request_is_allowed_again_once_the_window_passes(
    api_client: AsyncClient, api_db: AsyncSession
):
    email = await _register(api_client, api_db)

    await _request_reset(api_client, email)

    user = (await api_db.scalars(select(User).where(User.email == email))).one()
    user.last_password_reset_request_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(
        hours=2
    )
    await api_db.flush()

    _, sender = await _request_reset(api_client, email)
    assert sender.called


async def test_an_unknown_address_never_sends_mail(api_client: AsyncClient):
    _, sender = await _request_reset(api_client, f"ghost_{uuid.uuid4().hex[:8]}@example.com")
    assert not sender.called
