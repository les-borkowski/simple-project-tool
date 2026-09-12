from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from urllib.parse import urlparse

from app.cli.config import CLIConfig
from app.mcp.errors import MCPConfigError

DEFAULT_API_URL = "http://localhost:8000"
DEFAULT_LOCALE = "en-GB"

# Hosts that stay on the loopback interface never put the key on a network.
_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "[::1]"}


def _warn_if_key_travels_in_cleartext(api_url: str) -> None:
    """Every request carries X-API-Key. Over plain http to a remote host, so does the
    network. Warn rather than refuse: a private network or an SSH tunnel is a legitimate
    setup, and this server has no way to tell one from an accident."""
    parsed = urlparse(api_url)
    if parsed.scheme == "https" or (parsed.hostname or "") in _LOCAL_HOSTS:
        return
    print(
        f"warning: SPT_API_URL is {api_url!r} — your API key will be sent in cleartext "
        "to a non-local host. Use https:// unless this is a trusted private network.",
        file=sys.stderr,
    )


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
        _warn_if_key_travels_in_cleartext(api_url)

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
