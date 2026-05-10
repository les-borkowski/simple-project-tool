import logging
import pytest


@pytest.mark.asyncio
async def test_send_email_skips_when_mailgun_not_configured(caplog):
    from app.core.email import send_email
    from unittest.mock import patch, MagicMock

    mock_settings = MagicMock()
    mock_settings.MAILGUN_API_KEY = ""
    mock_settings.MAILGUN_DOMAIN = "mg.example.com"
    with patch("app.core.email.settings", mock_settings):
        with caplog.at_level(logging.WARNING, logger="app.core.email"):
            await send_email("to@example.com", "Subject", "<p>Body</p>")
    assert "Mailgun not configured" in caplog.text
