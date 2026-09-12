"""Every MCP request carries X-API-Key. Over plain http to a remote host, so does the wire."""

import pytest

from app.mcp.config import MCPConfig


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("SPT_API_KEY", "k" * 43)
    yield


def _warning(capsys) -> str:
    return capsys.readouterr().err


def test_a_remote_http_url_warns(monkeypatch, capsys):
    monkeypatch.setenv("SPT_API_URL", "http://spt.example.com")

    MCPConfig.load()

    assert "cleartext" in _warning(capsys)


def test_https_does_not_warn(monkeypatch, capsys):
    monkeypatch.setenv("SPT_API_URL", "https://spt.example.com")

    MCPConfig.load()

    assert _warning(capsys) == ""


@pytest.mark.parametrize(
    "url",
    ["http://localhost:8000", "http://127.0.0.1:8000", "http://[::1]:8000"],
)
def test_a_local_url_does_not_warn(monkeypatch, capsys, url):
    """Loopback never puts the key on a network, so warning there is just noise."""
    monkeypatch.setenv("SPT_API_URL", url)

    MCPConfig.load()

    assert _warning(capsys) == ""


def test_the_warning_goes_to_stderr_not_stdout(monkeypatch, capsys):
    """stdout is the MCP protocol channel — anything written there corrupts it."""
    monkeypatch.setenv("SPT_API_URL", "http://spt.example.com")

    MCPConfig.load()

    captured = capsys.readouterr()
    assert captured.out == ""
    assert "cleartext" in captured.err
