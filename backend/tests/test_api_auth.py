import uuid

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_success(api_client: AsyncClient):
    email = f"new_{uuid.uuid4().hex[:8]}@example.com"
    resp = await api_client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Alice", "password": "secret123"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == email
    assert data["name"] == "Alice"
    assert "id" in data
    assert "password" not in data
    assert "password_hash" not in data


@pytest.mark.asyncio
async def test_register_duplicate_email(api_client: AsyncClient):
    email = f"dup_{uuid.uuid4().hex[:8]}@example.com"
    payload = {"email": email, "name": "Bob", "password": "secret123"}
    await api_client.post("/api/v1/auth/register", json=payload)
    resp = await api_client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_login_success(api_client: AsyncClient):
    email = f"login_{uuid.uuid4().hex[:8]}@example.com"
    await api_client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Carol", "password": "mypassword"},
    )
    resp = await api_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "mypassword"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(api_client: AsyncClient):
    email = f"wrong_{uuid.uuid4().hex[:8]}@example.com"
    await api_client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Dave", "password": "correctpass"},
    )
    resp = await api_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "wrongpass"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_email(api_client: AsyncClient):
    resp = await api_client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@nowhere.com", "password": "whatever"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_authenticated(api_client: AsyncClient, auth_token: str):
    resp = await api_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data
    assert "email" in data


@pytest.mark.asyncio
async def test_me_unauthenticated(api_client: AsyncClient):
    resp = await api_client.get("/api/v1/auth/me")
    assert resp.status_code == 401
