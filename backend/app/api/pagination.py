import base64
from datetime import datetime
from uuid import UUID

from fastapi import HTTPException


def encode_cursor(created_at: datetime, id: UUID) -> str:
    """Encode created_at and id into a cursor string."""
    return base64.b64encode(f"{created_at.isoformat()}|{id}".encode()).decode()


def decode_cursor(cursor: str) -> tuple[datetime, UUID]:
    """Decode cursor string back to created_at and id. Raises 400 on invalid input."""
    try:
        val = base64.b64decode(cursor.encode()).decode()
        ts, uid = val.split("|", 1)
        return datetime.fromisoformat(ts), UUID(uid)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid cursor")
