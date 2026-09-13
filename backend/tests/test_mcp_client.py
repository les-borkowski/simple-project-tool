import httpx
import pytest

from app.mcp.client import MAX_FETCH_ALL_PAGES, SPTClient
from app.mcp.config import MCPConfig
from app.mcp.errors import SPTAPIError


def make_config() -> MCPConfig:
    return MCPConfig(api_url="http://testserver", api_key="test-key", locale="pl", timeout=5.0)


async def test_sends_auth_and_locale_headers():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["headers"] = request.headers
        return httpx.Response(200, json={"ok": True})

    client = SPTClient(make_config(), transport=httpx.MockTransport(handler))
    await client.get("/auth/me")
    await client.aclose()

    assert seen["headers"]["X-API-Key"] == "test-key"
    assert seen["headers"]["Accept-Language"] == "pl"


async def test_json_error_envelope_raises_spt_api_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            404,
            json={"error": {"code": "NOT_FOUND", "message": "Project not found", "details": []}},
        )

    client = SPTClient(make_config(), transport=httpx.MockTransport(handler))
    with pytest.raises(SPTAPIError) as excinfo:
        await client.get("/projects/bad-id")
    await client.aclose()

    assert excinfo.value.status == 404
    assert excinfo.value.code == "NOT_FOUND"
    assert excinfo.value.message == "Project not found"


async def test_non_json_error_body_raises_http_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, content=b"<html>Internal Server Error</html>")

    client = SPTClient(make_config(), transport=httpx.MockTransport(handler))
    with pytest.raises(SPTAPIError) as excinfo:
        await client.get("/projects")
    await client.aclose()

    assert excinfo.value.code == "HTTP_ERROR"
    assert excinfo.value.status == 500


async def test_fetch_all_walks_two_pages():
    responses = [
        httpx.Response(200, json={"items": [{"id": "1"}], "next_cursor": "cur1"}),
        httpx.Response(200, json={"items": [{"id": "2"}], "next_cursor": None}),
    ]
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return responses[len(calls) - 1]

    client = SPTClient(make_config(), transport=httpx.MockTransport(handler))
    results = await client.fetch_all("/projects")
    await client.aclose()

    assert results == [{"id": "1"}, {"id": "2"}]
    assert len(calls) == 2


async def test_fetch_all_stops_at_page_cap():
    call_count = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        call_count["n"] += 1
        return httpx.Response(
            200, json={"items": [{"id": str(call_count["n"])}], "next_cursor": "more"}
        )

    client = SPTClient(make_config(), transport=httpx.MockTransport(handler))
    results = await client.fetch_all("/projects")
    await client.aclose()

    assert call_count["n"] == MAX_FETCH_ALL_PAGES
    assert len(results) == MAX_FETCH_ALL_PAGES
