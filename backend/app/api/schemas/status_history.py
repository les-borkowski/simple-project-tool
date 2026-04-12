from datetime import datetime
from uuid import UUID
from pydantic import BaseModel
from app.db.base import StatusEnum


class StatusHistoryResponse(BaseModel):
    id: UUID
    from_status: StatusEnum | None
    to_status: StatusEnum
    changed_by: UUID
    changed_at: datetime

    class Config:
        from_attributes = True


class TimeMetricsResponse(BaseModel):
    status_seconds: dict[str, int]
    total_seconds: int


class TimeReportResponse(BaseModel):
    items: list[dict]
