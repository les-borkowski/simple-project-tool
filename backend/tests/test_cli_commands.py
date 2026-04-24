import json
from unittest.mock import patch

import httpx
from typer.testing import CliRunner

runner = CliRunner()


def make_resp(status_code: int, data: dict | None = None) -> httpx.Response:
    content = json.dumps(data or {}).encode() if data is not None else b""
    return httpx.Response(status_code, content=content)


def mock_config(tmp_path, **kwargs):
    from app.cli.config import DEFAULT_API_BASE_URL, DEFAULT_LOCALE, CLIConfig

    cfg = CLIConfig(
        access_token=kwargs.get("access_token", "tok"),
        refresh_token=kwargs.get("refresh_token", "ref"),
        api_base_url=DEFAULT_API_BASE_URL,
        locale=DEFAULT_LOCALE,
    )
    p = tmp_path / "config.json"
    with patch("app.cli.config.CONFIG_PATH", p):
        cfg.save()
    return p


# --- auth tests ---


def test_auth_whoami(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    user_data = {
        "id": "u1",
        "email": "a@b.com",
        "name": "Alice",
        "role": "manager",
        "created_at": "2024-01-01T00:00:00Z",
    }
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_resp(200, user_data)):
            result = runner.invoke(app, ["auth", "whoami"])
    assert result.exit_code == 0
    assert "Alice" in result.output


def test_auth_login_saves_tokens(tmp_path):
    from app.cli.main import app

    p = tmp_path / "config.json"
    token_data = {"access_token": "new_access", "refresh_token": "new_refresh"}
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_resp(200, token_data)):
            result = runner.invoke(app, ["auth", "login"], input="user@test.com\npassword\n")
    assert result.exit_code == 0
    saved = json.loads(p.read_text())
    assert saved["access_token"] == "new_access"


def test_auth_logout_clears_tokens(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_resp(204)):
            result = runner.invoke(app, ["auth", "logout"])
    assert result.exit_code == 0
    saved = json.loads(p.read_text())
    assert saved["access_token"] is None


# --- project tests ---


def test_projects_list(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    data = {
        "items": [
            {
                "id": "aaaabbbbccccdddd",
                "name": "Alpha",
                "status": "in_progress",
                "priority": "high",
                "created_at": "2024-01-01T00:00:00Z",
            }
        ],
        "next_cursor": None,
    }
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_resp(200, data)):
            result = runner.invoke(app, ["projects", "list"])
    assert result.exit_code == 0
    assert "Alpha" in result.output


def test_projects_create(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    created = {
        "id": "proj-uuid-1234",
        "name": "New Project",
        "status": "to_do",
        "priority": "medium",
        "created_at": "2024-01-01T00:00:00Z",
    }
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_resp(201, created)):
            result = runner.invoke(app, ["projects", "create", "--name", "New Project"])
    assert result.exit_code == 0


def test_projects_view(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    detail = {
        "id": "proj-1",
        "name": "Alpha",
        "status": "in_progress",
        "priority": "high",
        "created_at": "2024-01-01T00:00:00Z",
        "description": "Desc here",
    }
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_resp(200, detail)):
            result = runner.invoke(app, ["projects", "view", "proj-1"])
    assert result.exit_code == 0


def test_projects_delete_with_yes(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_resp(204)):
            result = runner.invoke(app, ["projects", "delete", "proj-1", "--yes"])
    assert result.exit_code == 0


def test_projects_members(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    data = {
        "items": [
            {
                "user_id": "u-uuid-1234",
                "name": "Bob",
                "email": "bob@test.com",
                "role": "contributor",
            }
        ],
        "next_cursor": None,
    }
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_resp(200, data)):
            result = runner.invoke(app, ["projects", "members", "proj-1"])
    assert result.exit_code == 0


# --- story tests ---


def test_stories_list(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    data = {
        "items": [
            {
                "id": "s-uuid-1234",
                "title": "Story A",
                "status": "to_do",
                "priority": "medium",
                "created_at": "2024-01-01T00:00:00Z",
            }
        ],
        "next_cursor": None,
    }
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_resp(200, data)):
            result = runner.invoke(app, ["stories", "list", "proj-1"])
    assert result.exit_code == 0


def test_stories_create(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    created = {
        "id": "s-new-uuid-12",
        "title": "New Story",
        "status": "to_do",
        "priority": "low",
        "created_at": "2024-01-01T00:00:00Z",
    }
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_resp(201, created)):
            result = runner.invoke(app, ["stories", "create", "proj-1", "--title", "New Story"])
    assert result.exit_code == 0


# --- task tests ---


def test_tasks_list(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    data = {
        "items": [
            {
                "id": "t-uuid-1234",
                "title": "Task A",
                "status": "to_do",
                "priority": "high",
                "assignee_name": "Alice",
                "created_at": "2024-01-01T00:00:00Z",
            }
        ],
        "next_cursor": None,
    }
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_resp(200, data)):
            result = runner.invoke(app, ["tasks", "list", "story-1"])
    assert result.exit_code == 0


def test_tasks_create(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    created = {
        "id": "t-new-uuid-12",
        "title": "New Task",
        "status": "to_do",
        "priority": "medium",
        "created_at": "2024-01-01T00:00:00Z",
    }
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_resp(201, created)):
            result = runner.invoke(app, ["tasks", "create", "story-1", "--title", "New Task"])
    assert result.exit_code == 0


# --- comment tests ---


def test_comments_add(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch(
            "httpx.Client.request", return_value=make_resp(201, {"id": "c-1", "body": "hello"})
        ):
            result = runner.invoke(app, ["comments", "add", "task:t-uuid-1", "hello"])
    assert result.exit_code == 0


def test_comments_list(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    data = {
        "items": [
            {
                "id": "c-1",
                "body": "First comment",
                "author_name": "Alice",
                "created_at": "2024-01-01T00:00:00Z",
            }
        ],
        "next_cursor": None,
    }
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_resp(200, data)):
            result = runner.invoke(app, ["comments", "list", "story:s-uuid-1"])
    assert result.exit_code == 0


# --- invitation tests ---


def test_invitations_list(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    data = {
        "items": [
            {
                "id": "inv-1",
                "project_name": "Alpha",
                "role": "contributor",
                "created_at": "2024-01-01T00:00:00Z",
            }
        ],
        "next_cursor": None,
    }
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_resp(200, data)):
            result = runner.invoke(app, ["invitations", "list"])
    assert result.exit_code == 0


def test_invitations_accept(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_resp(200, {})):
            result = runner.invoke(app, ["invitations", "accept", "inv-1"])
    assert result.exit_code == 0


# --- time tracking tests ---


def test_time_metrics(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    data = {
        "total_seconds": 7200,
        "by_status": [
            {"status": "in_progress", "seconds": 5400},
        ],
    }
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_resp(200, data)):
            result = runner.invoke(app, ["time-metrics", "task:t-uuid-1"])
    assert result.exit_code == 0


def test_time_history(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    data = {
        "items": [
            {
                "status": "in_progress",
                "changed_at": "2024-01-01T00:00:00Z",
                "changed_by_name": "Alice",
            }
        ],
        "next_cursor": None,
    }
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_resp(200, data)):
            result = runner.invoke(app, ["time-history", "story:s-uuid-1"])
    assert result.exit_code == 0


# --- config tests ---


def test_config_get(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    cfg_data = {"locale": "en-GB", "theme": "light", "display_preferences": {}}
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_resp(200, cfg_data)):
            result = runner.invoke(app, ["config", "get", "locale"])
    assert result.exit_code == 0


def test_config_api_keys_list(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    data = {
        "items": [
            {
                "id": "key-uuid-1",
                "label": "My key",
                "scopes": ["read:projects"],
                "last_used_at": None,
            }
        ],
        "next_cursor": None,
    }
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_resp(200, data)):
            result = runner.invoke(app, ["config", "api-keys", "list"])
    assert result.exit_code == 0
