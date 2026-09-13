import pytest

from app.mcp.errors import SPTAPIError, tool_errors


async def test_tool_errors_passes_through_success():
    @tool_errors
    async def ok() -> str:
        return "result"

    assert await ok() == "result"


async def test_tool_errors_reraises_spt_api_error():
    exc = SPTAPIError(422, "SOME_CODE", "some message")

    @tool_errors
    async def boom() -> dict:
        raise exc

    # Must still propagate - FastMCP's own call_tool handler is what turns this into
    # an `isError: true` result. Swallowing it into a string return would instead
    # report success with the error text embedded as tool output (see test_mcp_server.py
    # for the end-to-end isError verification).
    with pytest.raises(Exception, match="SOME_CODE: some message"):
        await boom()


def test_spt_api_error_str():
    assert str(SPTAPIError(400, "CODE", "message")) == "CODE: message"
