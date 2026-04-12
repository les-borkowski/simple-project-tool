import json
import os
import stat
from pathlib import Path
import pytest
from unittest.mock import patch


def test_load_defaults_when_no_file(tmp_path):
    from app.cli.config import CLIConfig, DEFAULT_API_BASE_URL, DEFAULT_LOCALE
    with patch("app.cli.config.CONFIG_PATH", tmp_path / "config.json"):
        cfg = CLIConfig.load()
    assert cfg.access_token is None
    assert cfg.refresh_token is None
    assert cfg.api_base_url == DEFAULT_API_BASE_URL
    assert cfg.locale == DEFAULT_LOCALE


def test_load_from_file(tmp_path):
    from app.cli.config import CLIConfig
    p = tmp_path / "config.json"
    p.write_text(json.dumps({"access_token": "tok", "locale": "pl",
                              "api_base_url": "http://api:8000", "refresh_token": "ref"}))
    with patch("app.cli.config.CONFIG_PATH", p):
        cfg = CLIConfig.load()
    assert cfg.access_token == "tok"
    assert cfg.locale == "pl"
    assert cfg.refresh_token == "ref"


def test_load_ignores_unknown_keys(tmp_path):
    from app.cli.config import CLIConfig
    p = tmp_path / "config.json"
    p.write_text(json.dumps({"unknown_key": "val", "locale": "pl"}))
    with patch("app.cli.config.CONFIG_PATH", p):
        cfg = CLIConfig.load()
    assert cfg.locale == "pl"


def test_save_creates_file_with_correct_permissions(tmp_path):
    from app.cli.config import CLIConfig
    p = tmp_path / "spt" / "config.json"
    with patch("app.cli.config.CONFIG_PATH", p):
        cfg = CLIConfig(access_token="tok", locale="en-GB")
        cfg.save()
    assert p.exists()
    data = json.loads(p.read_text())
    assert data["access_token"] == "tok"
    mode = oct(stat.S_IMODE(os.stat(p).st_mode))
    assert mode == oct(0o600)


def test_clear_tokens(tmp_path):
    from app.cli.config import CLIConfig
    p = tmp_path / "config.json"
    with patch("app.cli.config.CONFIG_PATH", p):
        cfg = CLIConfig(access_token="tok", refresh_token="ref")
        cfg.clear_tokens()
        assert cfg.access_token is None
        assert cfg.refresh_token is None
        saved = json.loads(p.read_text())
    assert saved["access_token"] is None
    assert saved["refresh_token"] is None
