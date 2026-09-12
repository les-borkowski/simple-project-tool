"""Capture text should not have to be a shell argument.

`spt tasks capture <project> "<text>"` puts the captured text into the user's shell
history, and capture text is exactly the sort of thing that quotes someone or describes
unreleased work. --file and stdin keep it out.
"""

from unittest.mock import MagicMock, patch

import pytest
from typer.testing import CliRunner

from app.cli.main import app

runner = CliRunner()

PREVIEW = {
    "tasks": [
        {
            "title": "Fix the login bug",
            "description": None,
            "story_id": None,
            "assignee_id": None,
            "due_date": None,
            "priority": None,
            "low_confidence": False,
            "story_hint": None,
            "assignee_hint": None,
            "confidence": 0.9,
        }
    ],
    "unparseable": False,
    "needs_confirmation": True,
    "warnings": [],
    "model": "m",
    "prompt_version": "v1",
    "latency_ms": 1,
}


@pytest.fixture
def client():
    with patch("app.cli.commands.tasks._setup") as setup:
        api = MagicMock()
        api.post.side_effect = [PREVIEW, {"created": []}]
        setup.return_value = (MagicMock(), api)
        yield api


def _posted_text(api: MagicMock) -> str:
    return api.post.call_args_list[0].kwargs["json"]["text"]


def test_text_can_be_read_from_a_file(client, tmp_path):
    note = tmp_path / "notes.txt"
    note.write_text("fix the login bug by Friday", encoding="utf-8")

    result = runner.invoke(app, ["tasks", "capture", "proj-1", "--file", str(note), "--yes"])

    assert result.exit_code == 0, result.output
    assert _posted_text(client) == "fix the login bug by Friday"


def test_text_can_be_read_from_stdin(client):
    result = runner.invoke(
        app, ["tasks", "capture", "proj-1", "-", "--yes"], input="fix the login bug\n"
    )

    assert result.exit_code == 0, result.output
    assert _posted_text(client) == "fix the login bug"


def test_a_positional_argument_still_works(client):
    result = runner.invoke(app, ["tasks", "capture", "proj-1", "fix the login bug", "--yes"])

    assert result.exit_code == 0, result.output
    assert _posted_text(client) == "fix the login bug"


def test_file_wins_over_a_positional_argument(client, tmp_path):
    note = tmp_path / "notes.txt"
    note.write_text("from the file", encoding="utf-8")

    result = runner.invoke(
        app, ["tasks", "capture", "proj-1", "from the argument", "--file", str(note), "--yes"]
    )

    assert result.exit_code == 0, result.output
    assert _posted_text(client) == "from the file"


def test_a_missing_file_fails_clearly():
    with patch("app.cli.commands.tasks._setup") as setup:
        setup.return_value = (MagicMock(), MagicMock())
        result = runner.invoke(
            app, ["tasks", "capture", "proj-1", "--file", "/nonexistent/notes.txt", "--yes"]
        )

    assert result.exit_code != 0
    assert "nonexistent" in result.output or "not found" in result.output.lower()


def test_no_text_at_all_fails_rather_than_sending_an_empty_capture():
    with patch("app.cli.commands.tasks._setup") as setup:
        api = MagicMock()
        setup.return_value = (MagicMock(), api)
        result = runner.invoke(app, ["tasks", "capture", "proj-1", "--yes"], input="")

    assert result.exit_code != 0
    assert not api.post.called, "an empty capture must not reach the server"
