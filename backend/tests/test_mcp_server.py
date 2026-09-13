import json
from unittest.mock import AsyncMock, patch

import pytest
from mcp.shared.memory import create_connected_server_and_client_session
from pydantic import AnyUrl

from app.mcp.errors import SPTAPIError
from app.mcp.server import _whoami_impl, main, mcp

_PROJECT = {"id": "proj-1", "name": "Project One"}
_MEMBERS = [{"user_id": "u1", "name": "Alice", "role": "manager"}]
_STATUSES = [{"slug": "to_do", "name": "To Do", "order": 1}]
_TASK = {
    "id": "task-1",
    "title": "Fix bug",
    "status": "to_do",
    "priority": "medium",
    "description": "It's broken",
    "project_id": "proj-1",
}
_COMMENTS = [{"body": "please prioritize"}]


def _fake_get(path: str, **kwargs):
    return {
        "/projects/proj-1": _PROJECT,
        "/projects/proj-1/members": _MEMBERS,
        "/projects/proj-1/statuses": _STATUSES,
        "/tasks/task-1": _TASK,
    }[path]


def _fake_fetch_all(path: str, params: dict | None = None):
    return {
        "/projects": [_PROJECT],
        "/tasks/task-1/comments": _COMMENTS,
    }[path]


def _resource_backed_client() -> AsyncMock:
    """AsyncMock SPTClient stubbed with the get_project/list_projects/get_task fixtures
    above - shared by the resource/prompt dispatch tests below."""
    instance = AsyncMock()
    instance.get.side_effect = _fake_get
    instance.fetch_all.side_effect = _fake_fetch_all
    instance.aclose = AsyncMock()
    return instance


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


async def test_projects_resource_dispatches_through_real_protocol(monkeypatch):
    """Exercises the zero-arg `spt://projects` resource end to end, including the
    mcp.get_context() workaround inside its handler (the one FunctionResource genuinely
    needs, since it has no context-injection mechanism of its own)."""
    monkeypatch.setenv("SPT_API_KEY", "dummy")
    with patch("app.mcp.server.SPTClient", return_value=_resource_backed_client()):
        async with create_connected_server_and_client_session(mcp) as client:
            result = await client.read_resource(AnyUrl("spt://projects"))

    assert json.loads(result.contents[0].text) == [_PROJECT]


async def test_project_resource_template_dispatches_through_real_protocol(monkeypatch):
    """Exercises the `spt://projects/{project_id}` template, proving the URI parameter
    resolves and ctx: Context injection (the standard tool mechanism) works for templates."""
    monkeypatch.setenv("SPT_API_KEY", "dummy")
    with patch("app.mcp.server.SPTClient", return_value=_resource_backed_client()):
        async with create_connected_server_and_client_session(mcp) as client:
            result = await client.read_resource(AnyUrl("spt://projects/proj-1"))

    body = json.loads(result.contents[0].text)
    assert body["project"] == _PROJECT
    assert body["members"] == _MEMBERS
    assert body["statuses"] == _STATUSES


async def test_work_on_task_prompt_dispatches_through_real_protocol(monkeypatch):
    """Exercises the work_on_task prompt end to end, proving ctx: Context injection works
    for prompts the same way it does for tools."""
    monkeypatch.setenv("SPT_API_KEY", "dummy")
    with patch("app.mcp.server.SPTClient", return_value=_resource_backed_client()):
        async with create_connected_server_and_client_session(mcp) as client:
            result = await client.get_prompt("work_on_task", {"task_id": "task-1"})

    text = result.messages[0].content.text
    assert _TASK["title"] in text
    assert "please prioritize" in text
    assert "to_do" in text
    assert "move it forward" in text.lower()


def test_main_exits_when_api_key_missing(monkeypatch, capsys):
    monkeypatch.delenv("SPT_API_KEY", raising=False)

    with pytest.raises(SystemExit) as excinfo:
        main()

    assert excinfo.value.code == 1
    captured = capsys.readouterr()
    assert "SPT_API_KEY" in captured.err
    assert captured.out == ""
