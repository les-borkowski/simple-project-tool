from __future__ import annotations

import httpx
import typer

from .config import CLIConfig


class APIClient:
    def __init__(self, config: CLIConfig) -> None:
        self.config = config
        self._base = config.api_base_url.rstrip("/") + "/api/v1"
        self._client = httpx.Client(
            base_url=self._base,
            headers={"Accept-Language": config.locale},
            timeout=30.0,
        )

    def _auth_headers(self) -> dict[str, str]:
        if self.config.access_token:
            return {"Authorization": f"Bearer {self.config.access_token}"}
        return {}

    def request(self, method: str, path: str, *, _retry: bool = True, **kwargs) -> dict:
        headers = {**self._auth_headers(), **kwargs.pop("headers", {})}
        resp = self._client.request(method, path, headers=headers, **kwargs)

        if resp.status_code == 401 and _retry and self.config.refresh_token:
            r = self._client.request(
                "POST",
                "/auth/refresh",
                json={"refresh_token": self.config.refresh_token},
                headers={},
            )
            if r.status_code == 200:
                self.config.access_token = r.json()["access_token"]
                self.config.save()
                return self.request(method, path, _retry=False, **kwargs)
            self.config.clear_tokens()
            typer.echo("Session expired. Please run: spt auth login", err=True)
            raise typer.Exit(1)

        if not resp.is_success:
            try:
                msg = resp.json()["error"]["message"]
            except Exception:
                msg = resp.text
            typer.echo(f"Error: {msg}", err=True)
            raise typer.Exit(1)

        if resp.status_code == 204 or not resp.content:
            return {}
        return resp.json()

    def get(self, path: str, **kwargs) -> dict:
        return self.request("GET", path, **kwargs)

    def post(self, path: str, **kwargs) -> dict:
        return self.request("POST", path, **kwargs)

    def patch(self, path: str, **kwargs) -> dict:
        return self.request("PATCH", path, **kwargs)

    def delete(self, path: str, **kwargs) -> dict:
        return self.request("DELETE", path, **kwargs)

    def fetch_all(self, path: str, params: dict | None = None) -> list:
        params = dict(params or {})
        results: list = []
        while True:
            data = self.get(path, params=params)
            results.extend(data.get("items", []))
            cursor = data.get("next_cursor")
            if not cursor:
                break
            params["cursor"] = cursor
        return results

    def close(self) -> None:
        self._client.close()
