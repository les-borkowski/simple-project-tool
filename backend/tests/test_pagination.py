"""Unit tests for app.api.pagination — no database required."""

import base64
from datetime import UTC

import pytest
from fastapi import HTTPException

from app.api.pagination import decode_cursor, encode_cursor


def test_decode_cursor_invalid_base64_raises_400():
    """Malformed base64 input must raise HTTPException(400)."""
    with pytest.raises(HTTPException) as exc_info:
        decode_cursor("this-is-not-valid-base64!!!")
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Invalid cursor"


def test_decode_cursor_valid_base64_but_missing_pipe_raises_400():
    """Valid base64 that decodes to a string without '|' separator must raise 400."""
    bad = base64.b64encode(b"no-pipe-here").decode()
    with pytest.raises(HTTPException) as exc_info:
        decode_cursor(bad)
    assert exc_info.value.status_code == 400


def test_decode_cursor_invalid_timestamp_raises_400():
    """Valid base64 with pipe but a non-ISO timestamp must raise 400."""
    bad = base64.b64encode(b"not-a-date|00000000-0000-0000-0000-000000000000").decode()
    with pytest.raises(HTTPException) as exc_info:
        decode_cursor(bad)
    assert exc_info.value.status_code == 400


def test_decode_cursor_invalid_uuid_raises_400():
    """Valid base64 with pipe and valid date but bad UUID must raise 400."""
    bad = base64.b64encode(b"2026-01-01T00:00:00|not-a-uuid").decode()
    with pytest.raises(HTTPException) as exc_info:
        decode_cursor(bad)
    assert exc_info.value.status_code == 400


def test_encode_decode_cursor_roundtrip():
    """encode_cursor and decode_cursor must be inverse operations."""
    from datetime import datetime
    from uuid import UUID

    created_at = datetime(2026, 1, 15, 12, 30, 45, tzinfo=UTC)
    uid = UUID("12345678-1234-5678-1234-567812345678")

    cursor = encode_cursor(created_at, uid)
    decoded_ts, decoded_id = decode_cursor(cursor)

    assert decoded_ts == created_at
    assert decoded_id == uid
