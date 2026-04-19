from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.search import SearchResultItem
from app.api.services import search_service
from app.auth.dependencies import get_current_user
from app.db.database import get_db
from app.db.models import User

router = APIRouter(tags=["search"])


@router.get("/search", response_model=list[SearchResultItem])
async def search(
    q: str = Query(..., min_length=1, max_length=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await search_service.search_items(q, user, db)
