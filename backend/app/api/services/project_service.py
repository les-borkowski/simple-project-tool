import uuid
from datetime import UTC, datetime
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException

from app.auth.permissions import require_project_access, require_manager
from app.db.models import Project, ProjectMember, User, StatusHistory
from app.db.base import PriorityEnum, RoleEnum
from app.api.schemas.project import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    MemberAdd,
    MemberUpdate,
    MemberResponse,
)
from app.api.schemas.common import PaginatedResponse
from app.api.pagination import encode_cursor, decode_cursor


async def list_projects(
    user: User,
    db: AsyncSession,
    cursor: str | None = None,
    limit: int = 25,
    status: str | None = None,
    priority: str | None = None,
    archived: bool = False,
    q: str | None = None,
) -> PaginatedResponse[ProjectResponse]:
    """List projects accessible to the user with cursor pagination."""
    limit = min(limit, 100)

    # Base query: projects where user is owner, member, or global manager
    stmt = select(Project)

    if user.role == RoleEnum.manager:
        # Global managers see all non-archived projects
        stmt = stmt.where(Project.archived_at.is_(None) if not archived else Project.archived_at.isnot(None))
    else:
        # Contributors see only projects where they are owner or member
        stmt = stmt.where(
            or_(
                Project.owner_id == user.id,
                Project.id.in_(
                    select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)
                ),
            )
        )
        stmt = stmt.where(Project.archived_at.is_(None) if not archived else Project.archived_at.isnot(None))

    # Apply filters
    if status:
        stmt = stmt.where(Project.status == status)
    if priority:
        stmt = stmt.where(Project.priority == priority)
    if q:
        stmt = stmt.where(Project.name.ilike(f"%{q}%"))

    # Cursor pagination
    if cursor:
        cursor_ts, cursor_id = decode_cursor(cursor)
        stmt = stmt.where((Project.created_at, Project.id) < (cursor_ts, cursor_id))

    stmt = stmt.order_by(Project.created_at.desc(), Project.id.desc()).limit(limit + 1)
    items = (await db.scalars(stmt)).all()

    # Check if there are more results
    next_cursor = None
    if len(items) > limit:
        items = items[:limit]
        next_cursor = encode_cursor(items[-1].created_at, items[-1].id)

    return PaginatedResponse(
        items=[ProjectResponse.model_validate(item) for item in items],
        next_cursor=next_cursor,
    )


async def create_project(
    data: ProjectCreate, user: User, db: AsyncSession
) -> ProjectResponse:
    """Create a new project. Only managers can create projects."""
    require_manager(user.role)

    from app.api.services.project_status_service import (
        seed_default_statuses,
        get_default_status_slug,
        validate_status_slug,
    )

    project = Project(
        name=data.name,
        description=data.description,
        status="to_do",  # placeholder — overwritten after seeding
        priority=data.priority or PriorityEnum.medium,
        owner_id=user.id,
        created_by=user.id,
    )
    db.add(project)
    await db.flush()

    member = ProjectMember(
        project_id=project.id,
        user_id=user.id,
        role=user.role,
    )
    db.add(member)

    await seed_default_statuses(project.id, db)
    await db.flush()

    if data.status:
        project.status = await validate_status_slug(project.id, data.status, db)
    else:
        project.status = await get_default_status_slug(project.id, db)

    history = StatusHistory(
        project_id=project.id,
        from_status=None,
        to_status=project.status,
        changed_by=user.id,
    )
    db.add(history)
    await db.commit()

    return ProjectResponse.model_validate(project)


async def get_project(project_id: uuid.UUID, user: User, db: AsyncSession) -> ProjectResponse:
    """Get a project by ID (with access check)."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await require_project_access(user, project_id, db)
    return ProjectResponse.model_validate(project)


async def update_project(
    project_id: uuid.UUID, data: ProjectUpdate, user: User, db: AsyncSession
) -> ProjectResponse:
    """Update a project. Only project managers can update."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    role = await require_project_access(user, project_id, db)
    require_manager(role)

    old_status = project.status

    # Apply updates
    if data.name is not None:
        project.name = data.name
    if data.description is not None:
        project.description = data.description
    if data.status is not None:
        from app.api.services.project_status_service import validate_status_slug
        project.status = await validate_status_slug(project_id, data.status, db)
    if data.priority is not None:
        project.priority = data.priority

    project.updated_by = user.id

    # Record status change if status changed
    if data.status is not None and old_status != project.status:
        history = StatusHistory(
            project_id=project.id,
            from_status=old_status,
            to_status=project.status,
            changed_by=user.id,
        )
        db.add(history)

    await db.commit()
    return ProjectResponse.model_validate(project)


async def delete_project(project_id: uuid.UUID, user: User, db: AsyncSession) -> None:
    """Delete a project. Only project managers can delete."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    role = await require_project_access(user, project_id, db)
    require_manager(role)

    await db.delete(project)
    await db.commit()


async def archive_project(project_id: uuid.UUID, user: User, db: AsyncSession) -> ProjectResponse:
    """Archive a project. Only managers can archive."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    role = await require_project_access(user, project_id, db)
    require_manager(role)

    project.archived_at = datetime.now(UTC).replace(tzinfo=None)
    await db.commit()
    return ProjectResponse.model_validate(project)


async def restore_project(project_id: uuid.UUID, user: User, db: AsyncSession) -> ProjectResponse:
    """Restore an archived project. Only managers can restore."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    role = await require_project_access(user, project_id, db)
    require_manager(role)

    project.archived_at = None
    await db.commit()
    return ProjectResponse.model_validate(project)


async def list_members(
    project_id: uuid.UUID, user: User, db: AsyncSession
) -> list[MemberResponse]:
    """List members of a project."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await require_project_access(user, project_id, db)

    stmt = select(ProjectMember).where(ProjectMember.project_id == project_id)
    members = (await db.scalars(stmt)).all()

    result = []
    for member in members:
        member_user = await db.get(User, member.user_id)
        if member_user:
            result.append(
                MemberResponse(
                    user_id=member.user_id,
                    role=member.role,
                    joined_at=member.joined_at,
                    name=member_user.name,
                    email=member_user.email,
                )
            )

    return result


async def add_member(
    project_id: uuid.UUID, data: MemberAdd, user: User, db: AsyncSession
) -> MemberResponse:
    """Add a member to a project. Only managers can add members."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    role = await require_project_access(user, project_id, db)
    require_manager(role)

    # Check if member already exists
    stmt = select(ProjectMember).where(
        and_(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == data.user_id,
        )
    )
    existing = await db.scalar(stmt)
    if existing:
        raise HTTPException(status_code=409, detail="User is already a member")

    # Add member
    member = ProjectMember(project_id=project_id, user_id=data.user_id, role=data.role)
    db.add(member)
    await db.flush()

    member_user = await db.get(User, data.user_id)
    await db.commit()

    return MemberResponse(
        user_id=member.user_id,
        role=member.role,
        joined_at=member.joined_at,
        name=member_user.name,
        email=member_user.email,
    )


async def update_member_role(
    project_id: uuid.UUID, target_user_id: uuid.UUID, role: RoleEnum, user: User, db: AsyncSession
) -> MemberResponse:
    """Update a member's role in a project. Only managers can update."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    auth_role = await require_project_access(user, project_id, db)
    require_manager(auth_role)

    stmt = select(ProjectMember).where(
        and_(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == target_user_id,
        )
    )
    member = await db.scalar(stmt)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    member.role = role
    await db.commit()

    member_user = await db.get(User, target_user_id)
    return MemberResponse(
        user_id=member.user_id,
        role=member.role,
        joined_at=member.joined_at,
        name=member_user.name,
        email=member_user.email,
    )


async def remove_member(
    project_id: uuid.UUID, target_user_id: uuid.UUID, user: User, db: AsyncSession
) -> None:
    """Remove a member from a project. Only managers can remove."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    auth_role = await require_project_access(user, project_id, db)
    require_manager(auth_role)

    stmt = select(ProjectMember).where(
        and_(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == target_user_id,
        )
    )
    member = await db.scalar(stmt)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    await db.delete(member)
    await db.commit()
