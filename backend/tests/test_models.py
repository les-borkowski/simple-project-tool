"""Integration tests for SQLAlchemy ORM models.

Each test runs inside a rolled-back transaction, so there are no
persistent side-effects between tests.
"""

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import RoleEnum
from app.db.models.api_key import APIKey
from app.db.models.comment import Comment
from app.db.models.project import Project
from app.db.models.project_member import ProjectMember
from app.db.models.story import Story
from app.db.models.task import Task
from app.db.models.user import User
from app.db.models.user_config import UserConfig

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_user(email: str | None = None) -> User:
    """Return an unsaved User instance with sensible defaults."""
    if email is None:
        email = f"user-{uuid.uuid4().hex[:8]}@example.com"
    return User(
        email=email,
        name="Test User",
        password_hash="hashed",
    )


def make_project(owner: User) -> Project:
    """Return an unsaved Project owned by *owner*."""
    return Project(
        name="Test Project",
        owner_id=owner.id,
        created_by=owner.id,
    )


def make_story(project: Project, creator: User) -> Story:
    """Return an unsaved Story in *project*."""
    return Story(
        project_id=project.id,
        title="Test Story",
        created_by=creator.id,
    )


def make_task(story: Story, creator: User) -> Task:
    """Return an unsaved Task in *story*."""
    return Task(
        story_id=story.id,
        title="Test Task",
        created_by=creator.id,
    )


# ---------------------------------------------------------------------------
# Test 1 — User can be created and queried
# ---------------------------------------------------------------------------


async def test_user_create_and_query(db: AsyncSession) -> None:
    user = make_user("alice@example.com")
    db.add(user)
    await db.flush()

    result = await db.execute(select(User).where(User.email == "alice@example.com"))
    fetched = result.scalar_one()
    assert fetched.email == "alice@example.com"
    assert fetched.id == user.id


# ---------------------------------------------------------------------------
# Test 2 — UserConfig is cascade-deleted with User
# ---------------------------------------------------------------------------


async def test_user_config_cascade_delete(db: AsyncSession) -> None:
    user = make_user()
    db.add(user)
    await db.flush()

    config = UserConfig(user_id=user.id)
    db.add(config)
    await db.flush()

    # Verify config exists
    result = await db.execute(select(UserConfig).where(UserConfig.user_id == user.id))
    assert result.scalar_one_or_none() is not None

    await db.delete(user)
    await db.flush()

    result = await db.execute(select(UserConfig).where(UserConfig.user_id == user.id))
    assert result.scalar_one_or_none() is None


# ---------------------------------------------------------------------------
# Test 3 — Project with owner
# ---------------------------------------------------------------------------


async def test_project_with_owner(db: AsyncSession) -> None:
    user = make_user()
    db.add(user)
    await db.flush()

    project = make_project(user)
    db.add(project)
    await db.flush()

    result = await db.execute(select(Project).where(Project.id == project.id))
    fetched = result.scalar_one()
    assert fetched.owner_id == user.id


# ---------------------------------------------------------------------------
# Test 4 — Story cascade-deletes from Project
# ---------------------------------------------------------------------------


async def test_story_cascade_delete_from_project(db: AsyncSession) -> None:
    user = make_user()
    db.add(user)
    await db.flush()

    project = make_project(user)
    db.add(project)
    await db.flush()

    story = make_story(project, user)
    db.add(story)
    await db.flush()

    story_id = story.id
    await db.delete(project)
    await db.flush()

    result = await db.execute(select(Story).where(Story.id == story_id))
    assert result.scalar_one_or_none() is None


# ---------------------------------------------------------------------------
# Test 5 — Task cascade-deletes from Story
# ---------------------------------------------------------------------------


async def test_task_cascade_delete_from_story(db: AsyncSession) -> None:
    user = make_user()
    db.add(user)
    await db.flush()

    project = make_project(user)
    db.add(project)
    await db.flush()

    story = make_story(project, user)
    db.add(story)
    await db.flush()

    task = make_task(story, user)
    db.add(task)
    await db.flush()

    task_id = task.id
    await db.delete(story)
    await db.flush()

    result = await db.execute(select(Task).where(Task.id == task_id))
    assert result.scalar_one_or_none() is None


# ---------------------------------------------------------------------------
# Test 6 — Comment CHECK constraint rejects two parents
# ---------------------------------------------------------------------------


async def test_comment_check_constraint_two_parents(db: AsyncSession) -> None:
    user = make_user()
    db.add(user)
    await db.flush()

    project = make_project(user)
    db.add(project)
    await db.flush()

    story = make_story(project, user)
    db.add(story)
    await db.flush()

    # Two non-null parent columns → CHECK constraint must fire
    bad_comment = Comment(
        project_id=project.id,
        story_id=story.id,
        task_id=None,
        author_id=user.id,
        body="This should fail",
    )
    db.add(bad_comment)

    with pytest.raises(IntegrityError):
        await db.flush()


# ---------------------------------------------------------------------------
# Test 7 — APIKey scopes default to empty list
# ---------------------------------------------------------------------------


async def test_api_key_scopes_default_empty(db: AsyncSession) -> None:
    user = make_user()
    db.add(user)
    await db.flush()

    api_key = APIKey(
        user_id=user.id,
        key_hash="some-hash",
        label="CI key",
    )
    db.add(api_key)
    await db.flush()

    result = await db.execute(select(APIKey).where(APIKey.id == api_key.id))
    fetched = result.scalar_one()
    assert fetched.scopes == []


# ---------------------------------------------------------------------------
# Test 8 — ProjectMember composite PK enforced
# ---------------------------------------------------------------------------


async def test_project_member_composite_pk_unique(db: AsyncSession) -> None:
    user = make_user()
    db.add(user)
    await db.flush()

    project = make_project(user)
    db.add(project)
    await db.flush()

    member1 = ProjectMember(
        project_id=project.id,
        user_id=user.id,
        role=RoleEnum.contributor,
    )
    db.add(member1)
    await db.flush()

    member2 = ProjectMember(
        project_id=project.id,
        user_id=user.id,
        role=RoleEnum.manager,
    )
    db.add(member2)

    with pytest.raises(IntegrityError):
        await db.flush()
