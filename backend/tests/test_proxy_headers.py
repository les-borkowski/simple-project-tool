import httpx

from app.api.main import app


async def test_redirect_keeps_https_from_railway_proxy():
    """Railway's proxy connects from 100.64.0.0/10 and forwards X-Forwarded-Proto: https;
    a redirect built from that request must stay on https."""
    transport = httpx.ASGITransport(app=app, client=("100.64.0.5", 51234))
    async with httpx.AsyncClient(transport=transport, base_url="http://backend.test") as client:
        resp = await client.get("/admin/", headers={"X-Forwarded-Proto": "https"})
    assert resp.is_redirect
    assert resp.headers["location"].startswith("https://")
