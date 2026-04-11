"""Unit tests for app.auth.permissions — no real database required."""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.auth.permissions import require_manager, require_project_access, resolve_role
from app.db.base import RoleEnum

# --- Helpers ---


def make_user(role: RoleEnum = RoleEnum.contributor) -> MagicMock:
    user = MagicMock()
    user.id = uuid.uuid4()
    user.role = role
    return user


def make_project(owner_id: uuid.UUID | None = None) -> MagicMock:
    project = MagicMock()
    project.id = uuid.uuid4()
    project.owner_id = owner_id if owner_id is not None else uuid.uuid4()
    return project


def make_member(role: RoleEnum = RoleEnum.contributor) -> MagicMock:
    member = MagicMock()
    member.role = role
    return member


def make_db(*, project: MagicMock | None, member: MagicMock | None) -> AsyncMock:
    """Build an AsyncMock db session with controlled return values."""
    db = AsyncMock()
    db.get.return_value = project
    db.scalar.return_value = member
    return db


# --- resolve_role ---


@pytest.mark.asyncio
async def test_resolve_role_owner_returns_manager_even_when_contributor():
    """resolve_role → manager when user is project owner (even if global role is contributor)."""
    user = make_user(role=RoleEnum.contributor)
    project = make_project(owner_id=user.id)
    db = make_db(project=project, member=None)

    role = await resolve_role(user, project.id, db)

    assert role == RoleEnum.manager


@pytest.mark.asyncio
async def test_resolve_role_returns_member_role_when_member_exists():
    """resolve_role → ProjectMember.role when member record exists."""
    user = make_user(role=RoleEnum.contributor)
    project = make_project()  # user is NOT the owner
    member = make_member(role=RoleEnum.manager)
    db = make_db(project=project, member=member)

    role = await resolve_role(user, project.id, db)

    assert role == RoleEnum.manager


@pytest.mark.asyncio
async def test_resolve_role_falls_back_to_global_role():
    """resolve_role → user.role when no ProjectMember record exists."""
    user = make_user(role=RoleEnum.contributor)
    project = make_project()  # user is NOT the owner
    db = make_db(project=project, member=None)

    role = await resolve_role(user, project.id, db)

    assert role == RoleEnum.contributor


@pytest.mark.asyncio
async def test_resolve_role_when_project_not_found_returns_global_role():
    """resolve_role → user.role when project does not exist."""
    user = make_user(role=RoleEnum.manager)
    project_id = uuid.uuid4()

    db = AsyncMock()
    db.get.return_value = None  # project not found
    db.scalar.return_value = None  # no member record either

    role = await resolve_role(user, project_id, db)
    assert role == RoleEnum.manager  # falls back to global role


# --- require_manager ---


def test_require_manager_raises_403_for_contributor():
    """require_manager → raises HTTPException(403) for contributor role."""
    with pytest.raises(HTTPException) as exc_info:
        require_manager(RoleEnum.contributor)
    assert exc_info.value.status_code == 403


def test_require_manager_passes_for_manager():
    """require_manager → does not raise for manager role."""
    require_manager(RoleEnum.manager)  # should not raise


# --- require_project_access ---


@pytest.mark.asyncio
async def test_require_project_access_raises_404_when_project_not_found():
    """require_project_access → raises HTTPException(404) when project not found."""
    user = make_user(role=RoleEnum.contributor)
    project_id = uuid.uuid4()
    db = make_db(project=None, member=None)

    with pytest.raises(HTTPException) as exc_info:
        await require_project_access(user, project_id, db)
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_require_project_access_raises_403_for_non_member_contributor():
    """require_project_access → raises 403 for non-member contributor."""
    user = make_user(role=RoleEnum.contributor)
    project = make_project(owner_id=uuid.uuid4())  # different owner

    db = AsyncMock()
    db.get.return_value = project  # db.get(Project, ...) → project
    db.scalar.side_effect = [None]  # exactly ONE scalar call expected → no member record

    with pytest.raises(HTTPException) as exc_info:
        await require_project_access(user, project.id, db)
    assert exc_info.value.status_code == 403
    db.scalar.assert_called_once()  # enforce: only one membership query


@pytest.mark.asyncio
async def test_require_project_access_owner_returns_manager():
    """require_project_access → succeeds and returns manager for project owner."""
    user = make_user(role=RoleEnum.contributor)
    project = make_project(owner_id=user.id)
    db = make_db(project=project, member=None)

    role = await require_project_access(user, project.id, db)

    assert role == RoleEnum.manager


@pytest.mark.asyncio
async def test_require_project_access_global_manager_non_member_succeeds():
    """A global manager who is not a project member or owner still gets access."""
    user = make_user(role=RoleEnum.manager)
    project = make_project(owner_id=uuid.uuid4())  # different owner

    db = AsyncMock()
    db.get.return_value = project
    db.scalar.side_effect = [None]  # no member record

    role = await require_project_access(user, project.id, db)
    assert role == RoleEnum.manager
    db.scalar.assert_called_once()
