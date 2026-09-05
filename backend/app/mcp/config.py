from __future__ import annotations

import os
from dataclasses import dataclass

from app.cli.config import CLIConfig
from app.mcp.errors import MCPConfigError

DEFAULT_API_URL = "http://localhost:8000"
DEFAULT_LOCALE = "en-GB"
DEFAULT_TIMEOUT_SECONDS = 30.0


@dataclass(frozen=True)
class MCPConfig:
    api_url: str
    api_key: str
    locale: str
    timeout: float

    @classmethod
    def load(cls) -> MCPConfig:
        api_key = os.environ.get("SPT_API_KEY", "").strip()
        if not api_key:
            raise MCPConfigError("SPT_API_KEY is required to run the MCP server")

        api_url = os.environ.get("SPT_API_URL", "").strip()
        if not api_url:
            api_url = CLIConfig.load().api_base_url or DEFAULT_API_URL

        locale = os.environ.get("SPT_LOCALE", "").strip() or DEFAULT_LOCALE
        timeout_raw = os.environ.get("SPT_TIMEOUT_SECONDS", "").strip()
        if timeout_raw:
            try:
                timeout = float(timeout_raw)
            except ValueError:
                raise MCPConfigError(
                    f"SPT_TIMEOUT_SECONDS must be a number, got {timeout_raw!r}"
                ) from None
        else:
            timeout = DEFAULT_TIMEOUT_SECONDS

        return cls(api_url=api_url, api_key=api_key, locale=locale, timeout=timeout)
