import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_invitation_sends_email(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    invitee_email = f"invitee_{uuid.uuid4().hex[:8]}@example.com"

    with patch("app.api.routes.invitations.send_invitation_email", new=AsyncMock()) as mock_send:
        resp = await api_client.post(
            f"/api/v1/projects/{test_project['id']}/invitations",
            json={"invitee_email": invitee_email},
            headers=manager_headers,
        )
    assert resp.status_code == 201
    mock_send.assert_called_once()
    args = mock_send.call_args[0]
    assert args[0] == invitee_email
