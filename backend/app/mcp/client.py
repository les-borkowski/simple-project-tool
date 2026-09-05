from __future__ import annotations

from typing import Any

import httpx

from app.mcp.config import MCPConfig
from app.mcp.errors import SPTAPIError

MAX_FETCH_ALL_PAGES = 20


class SPTClient:
    def __init__(
        self, config: MCPConfig, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        self.config = config
        base_url = f"{config.api_url.rstrip('/')}/api/v1"
        self._client = httpx.AsyncClient(
            base_url=base_url,
            headers={"X-API-Key": config.api_key, "Accept-Language": config.locale},
            timeout=config.timeout,
            transport=transport,
        )

    async def request(self, method: str, path: str, **kwargs) -> Any:
        response = await self._client.request(method, path, **kwargs)

        if response.is_success:
            if response.status_code == 204:
                return None
            return response.json()

        try:
            body = response.json()
            error = body["error"]
            raise SPTAPIError(
                response.status_code, error["code"], error["message"], error.get("details")
            )
        except SPTAPIError:
            raise
        except Exception:
            raise SPTAPIError(response.status_code, "HTTP_ERROR", response.text[:200]) from None

    async def get(self, path: str, **kwargs) -> Any:
        return await self.request("GET", path, **kwargs)

    async def post(self, path: str, **kwargs) -> Any:
        return await self.request("POST", path, **kwargs)

    async def patch(self, path: str, **kwargs) -> Any:
        return await self.request("PATCH", path, **kwargs)

    async def fetch_all(self, path: str, params: dict | None = None) -> list:
        params = dict(params or {})
        results: list = []
        for _ in range(MAX_FETCH_ALL_PAGES):
            data = await self.get(path, params=params)
            results.extend(data.get("items", []))
            cursor = data.get("next_cursor")
            if not cursor:
                break
            params["cursor"] = cursor
        return results

    async def aclose(self) -> None:
        await self._client.aclose()
