import json
from unittest.mock import patch

import httpx
from typer.testing import CliRunner

runner = CliRunner()


def make_resp(status_code: int, data: dict | None = None) -> httpx.Response:
    content = json.dumps(data or {}).encode() if data is not None else b""
    return httpx.Response(status_code, content=content)


def make_list_resp(status_code: int, data: list) -> httpx.Response:
    """Bare JSON array response — `make_resp`'s `data or {}` mishandles an empty list."""
    return httpx.Response(status_code, content=json.dumps(data).encode())


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


def test_auth_login_saves_api_url(tmp_path):
    """--api-url is persisted, because the tokens are only valid for that server."""
    from app.cli.main import app

    p = tmp_path / "config.json"
    token_data = {"access_token": "new_access", "refresh_token": "new_refresh"}
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_resp(200, token_data)):
            result = runner.invoke(
                app,
                ["auth", "login", "--api-url", "https://spt.example.com/"],
                input="user@test.com\npassword\n",
            )
    assert result.exit_code == 0
    saved = json.loads(p.read_text())
    # Trailing slash stripped so it doesn't become a double slash before /api/v1.
    assert saved["api_base_url"] == "https://spt.example.com"
    assert saved["access_token"] == "new_access"


def test_resolve_api_base_url_precedence(monkeypatch):
    """Explicit override beats SPT_API_URL, which beats the saved config."""
    from app.cli.config import CLIConfig

    cfg = CLIConfig(api_base_url="http://saved:8000")

    monkeypatch.delenv("SPT_API_URL", raising=False)
    assert cfg.resolve_api_base_url() == "http://saved:8000"

    monkeypatch.setenv("SPT_API_URL", "http://from-env:9000/")
    assert cfg.resolve_api_base_url() == "http://from-env:9000"
    assert cfg.resolve_api_base_url("http://explicit:7000") == "http://explicit:7000"

    # Blank or whitespace-only env is treated as unset, not as a blank URL.
    monkeypatch.setenv("SPT_API_URL", "   ")
    assert cfg.resolve_api_base_url() == "http://saved:8000"


def test_env_api_url_does_not_leak_into_saved_config(tmp_path, monkeypatch):
    """SPT_API_URL must not outlive the shell that set it by baking into config.json."""
    from app.cli.config import CLIConfig

    p = tmp_path / "config.json"
    monkeypatch.setenv("SPT_API_URL", "http://from-env:9000")
    cfg = CLIConfig(access_token="tok", api_base_url="http://saved:8000")
    with patch("app.cli.config.CONFIG_PATH", p):
        cfg.save()
    assert json.loads(p.read_text())["api_base_url"] == "http://saved:8000"


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


def _preview_data(low_confidence: bool = False) -> dict:
    return {
        "tasks": [
            {
                "title": "Fix the login bug",
                "description": None,
                "story_hint": "Auth",
                "story_id": "story-uuid-1",
                "story_resolved": True,
                "assignee_hint": "Alice",
                "assignee_id": "user-uuid-1",
                "assignee_resolved": True,
                "due_date": "2026-09-10",
                "priority": "high",
                "confidence": 0.4 if low_confidence else 0.9,
                "low_confidence": low_confidence,
            }
        ],
        "unparseable": False,
        "needs_confirmation": True,
        "warnings": [],
        "model": "test-model",
        "prompt_version": "v1",
        "latency_ms": 10,
    }


def test_tasks_capture_happy_path_with_yes(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    preview = _preview_data()
    confirm = {"created": [{"id": "t-1"}]}
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch(
            "httpx.Client.request",
            side_effect=[make_resp(200, preview), make_resp(201, confirm)],
        ):
            result = runner.invoke(app, ["tasks", "capture", "proj-1", "some text", "--yes"])
    assert result.exit_code == 0
    assert "1 task(s) created." in result.output


def test_tasks_capture_declined_prompt(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    preview = _preview_data()
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_resp(200, preview)) as mock_req:
            result = runner.invoke(app, ["tasks", "capture", "proj-1", "some text"], input="n\n")
    assert result.exit_code != 0
    assert mock_req.call_count == 1
    assert "task(s) created" not in result.output


def test_tasks_capture_unparseable(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    preview = {
        "tasks": [],
        "unparseable": True,
        "needs_confirmation": True,
        "warnings": [],
        "model": "test-model",
        "prompt_version": "v1",
        "latency_ms": 5,
    }
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_resp(200, preview)) as mock_req:
            result = runner.invoke(app, ["tasks", "capture", "proj-1", "gibberish", "--yes"])
    assert result.exit_code == 0
    assert "Could not extract any tasks from that text." in result.output
    assert mock_req.call_count == 1


def test_tasks_capture_api_key_flag(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path, access_token="stored-bearer-token")
    preview = _preview_data()
    confirm = {"created": [{"id": "t-1"}]}
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch(
            "httpx.Client.request",
            side_effect=[make_resp(200, preview), make_resp(201, confirm)],
        ) as mock_req:
            result = runner.invoke(
                app,
                ["tasks", "capture", "proj-1", "some text", "--yes", "--api-key", "some-key"],
            )
    assert result.exit_code == 0
    first_call_headers = mock_req.call_args_list[0].kwargs.get("headers", {})
    assert first_call_headers.get("X-API-Key") == "some-key"
    assert "Authorization" not in first_call_headers


def test_tasks_capture_api_key_env_var(tmp_path, monkeypatch):
    from app.cli.main import app

    monkeypatch.setenv("SPT_API_KEY", "some-key")
    p = mock_config(tmp_path, access_token="stored-bearer-token")
    preview = _preview_data()
    confirm = {"created": [{"id": "t-1"}]}
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch(
            "httpx.Client.request",
            side_effect=[make_resp(200, preview), make_resp(201, confirm)],
        ) as mock_req:
            result = runner.invoke(app, ["tasks", "capture", "proj-1", "some text", "--yes"])
    assert result.exit_code == 0
    first_call_headers = mock_req.call_args_list[0].kwargs.get("headers", {})
    assert first_call_headers.get("X-API-Key") == "some-key"
    assert "Authorization" not in first_call_headers


def test_config_api_keys_list(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    # GET /config/api-keys returns a bare JSON array, not a paginated envelope.
    data = [
        {
            "id": "3f2b8c1e-0a4d-4e5f-9b6a-7c8d9e0f1a2b",
            "label": "My key",
            "scopes": ["read:projects"],
            "last_used_at": None,
        }
    ]
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_list_resp(200, data)):
            result = runner.invoke(app, ["config", "api-keys", "list"])
    assert result.exit_code == 0
    assert "My key" in result.output
    # The full id, because it is what `api-keys revoke` takes.
    assert "3f2b8c1e-0a4d-4e5f-9b6a-7c8d9e0f1a2b" in result.output.replace("\n", "")


# --- config llm tests ---


def test_config_llm_list_empty(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_list_resp(200, [])):
            result = runner.invoke(app, ["config", "llm", "list"])
    assert result.exit_code == 0
    assert "No LLM credentials configured." in result.output


def test_config_llm_list_populated(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    data = [
        {
            "provider": "google",
            "label": "Gemini",
            "api_key_hint": "abcd",
            "model": "flash",
            "rpm_limit": 10,
            "tpm_limit": None,
            "effective_rpm": 10,
            "effective_tpm": 100000,
            "is_default": True,
            "enabled": True,
        }
    ]
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_list_resp(200, data)):
            result = runner.invoke(app, ["config", "llm", "list"])
    assert result.exit_code == 0
    assert "google" in result.output
    assert "Gemini" in result.output
    assert "abcd" in result.output
    assert "flash" in result.output


def test_config_llm_providers(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    data = [
        {
            "id": "google",
            "label": "Google Gemini",
            "default_model": "gemini-2.5-flash",
            "available": True,
            "key_hint": "AIza...",
            "docs_url": "https://ai.google.dev",
        },
        {
            "id": "openai",
            "label": "OpenAI",
            "default_model": "gpt-4o",
            "available": False,
            "key_hint": "sk-...",
            "docs_url": "https://platform.openai.com",
        },
    ]
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_list_resp(200, data)):
            result = runner.invoke(app, ["config", "llm", "providers"])
    assert result.exit_code == 0
    assert "google" in result.output
    assert "openai" in result.output
    assert "Yes" in result.output
    assert "No" in result.output


def test_config_llm_set(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    resp_data = {
        "provider": "google",
        "label": "Google Gemini",
        "api_key_hint": "cret",
        "model": "gemini-2.5-pro",
        "rpm_limit": 5,
        "tpm_limit": None,
        "effective_rpm": 5,
        "effective_tpm": 100000,
        "is_default": True,
        "enabled": True,
    }
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_resp(200, resp_data)) as mock_req:
            result = runner.invoke(
                app,
                [
                    "config",
                    "llm",
                    "set",
                    "google",
                    "--model",
                    "gemini-2.5-pro",
                    "--rpm",
                    "5",
                    "--default",
                ],
                input="my-secret-key\n",
            )
    assert result.exit_code == 0
    assert "my-secret-key" not in result.stdout
    assert "LLM credential saved." in result.output
    sent_body = mock_req.call_args.kwargs["json"]
    assert sent_body["api_key"] == "my-secret-key"
    assert sent_body["model"] == "gemini-2.5-pro"
    assert sent_body["rpm_limit"] == 5
    assert sent_body["is_default"] is True
    assert "tpm_limit" not in sent_body


def test_config_llm_delete(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_resp(204)):
            result = runner.invoke(app, ["config", "llm", "delete", "google"])
    assert result.exit_code == 0
    assert "LLM credential deleted." in result.output
