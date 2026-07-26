from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import RoleEnum

if TYPE_CHECKING:
    from app.db.models.user import User


async def resolve_role(user: User, project_id: UUID, db: AsyncSession) -> RoleEnum:
    """
    Resolve the effective role for a user on a project.

    Precedence:
    1. If user is project owner → always RoleEnum.manager
    2. If ProjectMember record exists → return its role
    3. Otherwise → return user.role (global role)
    """
    from app.db.models.project import Project
    from app.db.models.project_member import ProjectMember

    project = await db.get(Project, project_id)
    if project and project.owner_id == user.id:
        return RoleEnum.manager

    stmt = select(ProjectMember).where(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user.id,
    )
    member = await db.scalar(stmt)
    if member:
        return member.role

    return user.role


def require_manager(role: RoleEnum) -> None:
    """Raise HTTPException(403) if role is not manager."""
    if role != RoleEnum.manager:
        raise HTTPException(status_code=403, detail="Manager role required")


def require_not_demo(user: "User") -> None:
    """Raise HTTPException(403) if user is a demo account."""
    if user.is_demo:
        raise HTTPException(status_code=403, detail="DEMO_ACCOUNT")


async def require_project_access(user: User, project_id: UUID, db: AsyncSession) -> RoleEnum:
    """Verify user can access the project. Returns resolved role.

    - 404 if project not found
    - 403 if user is not the owner and has no ProjectMember record
    - Owner → RoleEnum.manager
    - Member → member.role
    """
    from app.db.models.project import Project
    from app.db.models.project_member import ProjectMember

    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.owner_id == user.id:
        return RoleEnum.manager

    stmt = select(ProjectMember).where(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user.id,
    )
    member = await db.scalar(stmt)

    if member:
        return member.role

    raise HTTPException(status_code=403, detail="Not a project member")
