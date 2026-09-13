from __future__ import annotations

import functools
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

import httpx

T = TypeVar("T")


class MCPConfigError(Exception):
    pass


class SPTAPIError(Exception):
    def __init__(self, status: int, code: str, message: str, details: list | None = None) -> None:
        self.status = status
        self.code = code
        self.message = message
        self.details = details
        super().__init__(message)

    def __str__(self) -> str:
        return f"{self.code}: {self.message}"


def tool_errors(fn: Callable[..., Awaitable[T]]) -> Callable[..., Awaitable[T]]:
    """Wrap an @mcp.tool() function so an SPTAPIError surfaces with a clean message.

    FastMCP's own call_tool handler already catches any exception raised by a tool and
    turns it into an `isError: true` result, so we must NOT swallow SPTAPIError into a
    plain return value here - doing so would report the error as `isError: false`,
    with the error text embedded as if it were successful tool output. We re-raise as
    a plain Exception so the "CODE: message" text stays clean of the SPTAPIError repr,
    while still letting FastMCP's handler flag the call as failed.
    """

    @functools.wraps(fn)
    async def wrapper(*args: Any, **kwargs: Any) -> T:
        try:
            return await fn(*args, **kwargs)
        except SPTAPIError as exc:
            raise Exception(str(exc)) from exc
        except httpx.HTTPError as exc:
            # The API being unreachable is the most likely failure for a host that has
            # just been configured, and httpx's own text for it ("All connection
            # attempts failed") says nothing about what to check. Name the URL — taken
            # from the failed request itself — so the answer is in the message the
            # assistant actually reads.
            target = getattr(getattr(exc, "request", None), "url", None)
            where = f" at {target}" if target else ""
            raise Exception(
                f"Cannot reach the SPT API{where}: {exc}. "
                "Check the server is running and SPT_API_URL is correct."
            ) from exc

    return wrapper
