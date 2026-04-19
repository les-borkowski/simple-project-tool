from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.search import SearchResultItem
from app.api.services.search_service import search_items
from app.auth.dependencies import get_current_user
from app.db.database import get_db
from app.db.models import User

router = APIRouter(tags=["search"])


@router.get("/search", response_model=list[SearchResultItem])
async def search(
    q: str = Query(..., min_length=1),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await search_items(q, current_user, db)
