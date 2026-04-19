# backend/app/api/routes/recent.py
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.db.database import get_db
from app.db.models import User
from app.api.schemas.recent import RecentItemResponse
from app.api.services import recent_service

router = APIRouter(tags=["recent"])


@router.get("/recent", response_model=list[RecentItemResponse])
async def get_recent(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await recent_service.get_recent_items(user, db)
