import httpx
import pytest
from unittest.mock import MagicMock, patch
from app.cli.config import CLIConfig


def make_response(
    status_code: int, data: dict | None = None, content: bytes = b""
) -> httpx.Response:
    if data is not None:
        import json

        content = json.dumps(data).encode()
    return httpx.Response(status_code, content=content)


def test_get_adds_auth_header():
    from app.cli.http import APIClient

    config = CLIConfig(access_token="mytoken", api_base_url="http://localhost:8000")
    client = APIClient(config)
    with patch.object(
        client._client, "request", return_value=make_response(200, {"items": []})
    ) as mock_req:
        client.get("/projects")
    call_kwargs = mock_req.call_args.kwargs
    assert call_kwargs.get("headers", {}).get("Authorization") == "Bearer mytoken"


def test_401_triggers_refresh_and_retry():
    from app.cli.http import APIClient

    config = CLIConfig(
        access_token="old", refresh_token="ref", api_base_url="http://localhost:8000"
    )
    client = APIClient(config)
    responses = [
        make_response(401, {"error": {"message": "Unauthorized"}}),
        make_response(200, {"access_token": "new"}),
        make_response(200, {"items": []}),
    ]
    with patch.object(client._client, "request", side_effect=responses):
        result = client.get("/projects")
    assert config.access_token == "new"
    assert result == {"items": []}


def test_401_without_refresh_token_raises_exit():
    from app.cli.http import APIClient
    from click.exceptions import Exit

    config = CLIConfig(access_token="old", refresh_token=None, api_base_url="http://localhost:8000")
    client = APIClient(config)
    with patch.object(
        client._client,
        "request",
        return_value=make_response(401, {"error": {"message": "Unauthorized"}}),
    ):
        with pytest.raises(Exit):
            client.get("/projects")


def test_non_success_raises_exit():
    from app.cli.http import APIClient
    from click.exceptions import Exit

    config = CLIConfig(access_token="tok", api_base_url="http://localhost:8000")
    client = APIClient(config)
    with patch.object(
        client._client,
        "request",
        return_value=make_response(404, {"error": {"message": "not found"}}),
    ):
        with pytest.raises(Exit):
            client.get("/projects/bad-id")


def test_fetch_all_follows_cursors():
    from app.cli.http import APIClient

    config = CLIConfig(access_token="tok", api_base_url="http://localhost:8000")
    client = APIClient(config)
    responses = [
        make_response(200, {"items": [{"id": "1"}], "next_cursor": "cur1"}),
        make_response(200, {"items": [{"id": "2"}], "next_cursor": None}),
    ]
    with patch.object(client._client, "request", side_effect=responses):
        results = client.fetch_all("/projects")
    assert results == [{"id": "1"}, {"id": "2"}]


def test_delete_204_returns_empty_dict():
    from app.cli.http import APIClient

    config = CLIConfig(access_token="tok", api_base_url="http://localhost:8000")
    client = APIClient(config)
    with patch.object(client._client, "request", return_value=make_response(204, content=b"")):
        result = client.delete("/projects/some-id")
    assert result == {}
