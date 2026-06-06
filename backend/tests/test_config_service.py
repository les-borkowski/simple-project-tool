import pytest

from app.api.schemas.api_key import APIKeyCreate


def test_api_key_invalid_scope_rejected():
    with pytest.raises(ValueError):
        APIKeyCreate(label="test", scopes=["made:up:scope"])


def test_api_key_valid_scope_accepted():
    key = APIKeyCreate(label="test", scopes=["read:tasks"])
    assert key.scopes == ["read:tasks"]
