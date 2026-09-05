from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.search import SearchResultItem
from app.api.services import search_service
from app.auth.dependencies import require_scope
from app.db.database import get_db
from app.db.models import User

router = APIRouter(tags=["search"])


@router.get("/search", response_model=list[SearchResultItem])
async def search(
    request: Request,
    q: str = Query(..., min_length=1, max_length=200),
    user: User = Depends(require_scope("read:projects")),
    db: AsyncSession = Depends(get_db),
):
    # Only set on the API-key path; the service decides what scopes may see.
    api_key = getattr(request.state, "api_key", None)
    return await search_service.search_items(q, user, db, api_key)
