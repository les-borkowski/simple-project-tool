from __future__ import annotations

import logging
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from mcp.server.fastmcp import Context, FastMCP

from app.mcp.client import SPTClient
from app.mcp.config import MCPConfig
from app.mcp.errors import MCPConfigError, tool_errors


@asynccontextmanager
async def lifespan(_: FastMCP) -> AsyncIterator[SPTClient]:
    config = MCPConfig.load()
    client = SPTClient(config)
    try:
        yield client
    finally:
        await client.aclose()


mcp = FastMCP("simple-project-tool", lifespan=lifespan)


async def _whoami_impl(client: SPTClient) -> dict:
    return await client.get("/auth/me")


@mcp.tool()
@tool_errors
async def whoami(ctx: Context) -> dict:
    """Return the current identity: user id, name, email, role, and (if authenticated via
    API key) the key's label and scopes. Call this first if you're unsure what you're
    allowed to do."""
    client: SPTClient = ctx.request_context.lifespan_context
    return await _whoami_impl(client)


def main() -> None:
    # stdout is the JSON-RPC wire for stdio transport; logging must go to stderr only,
    # and nothing in this process may print to stdout.
    logging.basicConfig(stream=sys.stderr, level=logging.INFO)

    try:
        MCPConfig.load()
    except MCPConfigError as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)

    mcp.run()


if __name__ == "__main__":
    main()
