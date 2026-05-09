import uuid
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.user_preferences import (
    UserProjectPreferencesResponse,
    UserProjectPreferencesUpdate,
)
from app.auth.permissions import require_project_access
from app.db.models import User, UserProjectPreferences


async def get_preferences(
    project_id: UUID, user: User, db: AsyncSession
) -> UserProjectPreferencesResponse:
    """Get or create default preferences for current user + project."""
    await require_project_access(user, project_id, db)

    result = await db.execute(
        select(UserProjectPreferences).where(
            UserProjectPreferences.user_id == user.id,
            UserProjectPreferences.project_id == project_id,
        )
    )
    prefs = result.scalar_one_or_none()

    if prefs is None:
        # Return default without persisting
        return UserProjectPreferencesResponse(
            id=uuid.uuid4(),
            user_id=user.id,
            project_id=project_id,
            tab_order=["board", "stories", "sprints", "timeline", "members"],
            hidden_tabs=[],
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

    return UserProjectPreferencesResponse.model_validate(prefs)


async def upsert_preferences(
    project_id: UUID,
    data: UserProjectPreferencesUpdate,
    user: User,
    db: AsyncSession,
) -> UserProjectPreferencesResponse:
    """Create or update preferences for current user + project."""
    await require_project_access(user, project_id, db)

    result = await db.execute(
        select(UserProjectPreferences).where(
            UserProjectPreferences.user_id == user.id,
            UserProjectPreferences.project_id == project_id,
        )
    )
    prefs = result.scalar_one_or_none()

    if prefs is None:
        prefs = UserProjectPreferences(
            user_id=user.id,
            project_id=project_id,
            tab_order=data.tab_order,
            hidden_tabs=data.hidden_tabs,
        )
        db.add(prefs)
    else:
        prefs.tab_order = data.tab_order
        prefs.hidden_tabs = data.hidden_tabs

    await db.commit()
    await db.refresh(prefs)
    return UserProjectPreferencesResponse.model_validate(prefs)
