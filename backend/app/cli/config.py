from __future__ import annotations

import json
import os
import stat
from dataclasses import asdict, dataclass
from pathlib import Path

CONFIG_PATH = Path.home() / ".config" / "spt" / "config.json"
DEFAULT_API_BASE_URL = "http://localhost:8000"
DEFAULT_LOCALE = "en-GB"
# Same variable the MCP server reads, so one export points both at a server.
ENV_API_BASE_URL = "SPT_API_URL"


@dataclass
class CLIConfig:
    access_token: str | None = None
    refresh_token: str | None = None
    api_base_url: str = DEFAULT_API_BASE_URL
    locale: str = DEFAULT_LOCALE

    @classmethod
    def load(cls) -> CLIConfig:
        if not CONFIG_PATH.exists():
            return cls()
        try:
            with open(CONFIG_PATH) as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            return cls()
        valid = cls.__dataclass_fields__
        return cls(**{k: v for k, v in data.items() if k in valid})

    def save(self) -> None:
        CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(CONFIG_PATH, "w") as f:
            json.dump(asdict(self), f, indent=2)
        os.chmod(CONFIG_PATH, stat.S_IRUSR | stat.S_IWUSR)

    def resolve_api_base_url(self, override: str | None = None) -> str:
        """Where to reach the API.

        An explicit --api-url beats SPT_API_URL, which beats the saved config.
        Deliberately not a dataclass field: `save()` serialises those, and an
        environment variable that silently baked itself into config.json would
        outlive the shell that set it.
        """
        for candidate in (override, os.environ.get(ENV_API_BASE_URL), self.api_base_url):
            if candidate and candidate.strip():
                return candidate.strip().rstrip("/")
        return DEFAULT_API_BASE_URL

    def clear_tokens(self) -> None:
        self.access_token = None
        self.refresh_token = None
        self.save()
