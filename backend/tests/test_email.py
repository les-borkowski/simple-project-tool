from unittest.mock import MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_send_email_skips_when_mailgun_not_configured():
    import app.core.email as email_module
    from app.core.email import send_email

    mock_settings = MagicMock(MAILGUN_API_KEY="", MAILGUN_DOMAIN="mg.example.com")
    with patch.object(email_module, "settings", mock_settings):
        with patch.object(email_module.logger, "warning") as mock_warn:
            await send_email("to@example.com", "Subject", "<p>Body</p>")
    mock_warn.assert_called_once()
    assert "Mailgun not configured" in mock_warn.call_args[0][0]
