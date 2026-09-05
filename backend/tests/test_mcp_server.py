from unittest.mock import AsyncMock, patch

import pytest
from mcp.shared.memory import create_connected_server_and_client_session

from app.mcp.errors import SPTAPIError
from app.mcp.server import _whoami_impl, main, mcp


async def test_whoami_impl_calls_auth_me():
    client = AsyncMock()
    client.get.return_value = {"id": "u1", "name": "Alice", "email": "alice@example.com"}

    result = await _whoami_impl(client)

    client.get.assert_awaited_once_with("/auth/me")
    assert result == {"id": "u1", "name": "Alice", "email": "alice@example.com"}


async def test_whoami_tool_call_reports_iserror_true_on_api_failure(monkeypatch):
    """End-to-end through the real MCP protocol handler (not just the decorator in
    isolation): a tool that raises SPTAPIError must come back as isError: true, or an
    agent checking that field would mistake the error text for real tool output."""
    monkeypatch.setenv("SPT_API_KEY", "dummy")
    with patch("app.mcp.server.SPTClient") as mock_client_cls:
        instance = AsyncMock()
        instance.get.side_effect = SPTAPIError(404, "NOT_FOUND", "nope")
        instance.aclose = AsyncMock()
        mock_client_cls.return_value = instance

        async with create_connected_server_and_client_session(mcp) as client:
            result = await client.call_tool("whoami", {})

    assert result.isError is True
    assert "NOT_FOUND: nope" in result.content[0].text


async def test_whoami_tool_call_reports_iserror_false_on_success(monkeypatch):
    monkeypatch.setenv("SPT_API_KEY", "dummy")
    with patch("app.mcp.server.SPTClient") as mock_client_cls:
        instance = AsyncMock()
        instance.get.return_value = {"id": "u1", "name": "Alice"}
        instance.aclose = AsyncMock()
        mock_client_cls.return_value = instance

        async with create_connected_server_and_client_session(mcp) as client:
            result = await client.call_tool("whoami", {})

    assert result.isError is False


def test_main_exits_when_api_key_missing(monkeypatch, capsys):
    monkeypatch.delenv("SPT_API_KEY", raising=False)

    with pytest.raises(SystemExit) as excinfo:
        main()

    assert excinfo.value.code == 1
    captured = capsys.readouterr()
    assert "SPT_API_KEY" in captured.err
    assert captured.out == ""
