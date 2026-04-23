from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class StatusHistoryResponse(BaseModel):
    id: UUID
    from_status: str | None
    to_status: str
    changed_by: UUID
    changed_at: datetime

    class Config:
        from_attributes = True


class TimeMetricsResponse(BaseModel):
    status_seconds: dict[str, int]
    total_seconds: int


class TimeReportResponse(BaseModel):
    items: list[dict]
