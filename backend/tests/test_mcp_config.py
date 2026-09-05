import json

import pytest


def test_requires_api_key(monkeypatch):
    from app.mcp.config import MCPConfig
    from app.mcp.errors import MCPConfigError

    monkeypatch.delenv("SPT_API_KEY", raising=False)
    with pytest.raises(MCPConfigError):
        MCPConfig.load()


def test_defaults_when_only_api_key_set(monkeypatch, tmp_path):
    from app.mcp.config import MCPConfig

    monkeypatch.setenv("SPT_API_KEY", "key123")
    monkeypatch.delenv("SPT_API_URL", raising=False)
    monkeypatch.delenv("SPT_LOCALE", raising=False)
    monkeypatch.delenv("SPT_TIMEOUT_SECONDS", raising=False)
    monkeypatch.setattr("app.cli.config.CONFIG_PATH", tmp_path / "config.json")

    config = MCPConfig.load()

    assert config.api_key == "key123"
    assert config.api_url == "http://localhost:8000"
    assert config.locale == "en-GB"
    assert config.timeout == 30.0


def test_env_vars_take_precedence(monkeypatch):
    from app.mcp.config import MCPConfig

    monkeypatch.setenv("SPT_API_KEY", "key123")
    monkeypatch.setenv("SPT_API_URL", "http://env-url:9000")
    monkeypatch.setenv("SPT_LOCALE", "pl")
    monkeypatch.setenv("SPT_TIMEOUT_SECONDS", "5.5")

    config = MCPConfig.load()

    assert config.api_url == "http://env-url:9000"
    assert config.locale == "pl"
    assert config.timeout == 5.5


def test_invalid_timeout_raises_mcp_config_error(monkeypatch):
    from app.mcp.config import MCPConfig
    from app.mcp.errors import MCPConfigError

    monkeypatch.setenv("SPT_API_KEY", "key123")
    monkeypatch.setenv("SPT_TIMEOUT_SECONDS", "not-a-number")

    with pytest.raises(MCPConfigError, match="SPT_TIMEOUT_SECONDS"):
        MCPConfig.load()


def test_falls_back_to_cli_config_api_url(monkeypatch, tmp_path):
    from app.mcp.config import MCPConfig

    monkeypatch.setenv("SPT_API_KEY", "key123")
    monkeypatch.delenv("SPT_API_URL", raising=False)

    config_path = tmp_path / "config.json"
    config_path.write_text(json.dumps({"api_base_url": "http://cli-url:8001"}))
    monkeypatch.setattr("app.cli.config.CONFIG_PATH", config_path)

    config = MCPConfig.load()

    assert config.api_url == "http://cli-url:8001"
