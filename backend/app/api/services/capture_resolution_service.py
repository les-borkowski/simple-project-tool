"""DB access, RBAC, and hint resolution for the task-capture preview flow.

`capture_service.py` is scanned by a test to guarantee it never touches the DB
(`AsyncSession` must not appear in its source); everything DB-related for
capture lives here instead.
"""

import uuid
from datetime import UTC, date, datetime

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.capture import CapturedTask, CaptureRequest, CaptureResponse
from app.api.schemas.project import MemberResponse
from app.api.services.capture_service import ProjectContext, extract
from app.api.services.project_service import list_members
from app.auth.permissions import require_project_access
from app.core.config import settings
from app.db.models import Project, Story, User


async def build_project_context(
    project_id: uuid.UUID, user: User, db: AsyncSession, reference_date: date
) -> tuple[ProjectContext, list[MemberResponse], list[Story]]:
    """Resolve access and gather the prompt context in one place.

    RBAC runs first so a non-member is rejected before any LLM call happens.
    """
    await require_project_access(user, project_id, db)

    project = await db.get(Project, project_id)

    members = await list_members(project_id, user, db)
    stories = (await db.scalars(select(Story).where(Story.project_id == project_id))).all()

    ctx = ProjectContext(
        project_name=project.name,
        member_names=[m.name for m in members],
        story_names=[s.title for s in stories],
        reference_date=reference_date,
    )
    return ctx, members, stories


def resolve_assignee_hint(
    hint: str | None, members: list[MemberResponse]
) -> tuple[uuid.UUID | None, bool]:
    """Resolve a free-text assignee hint to exactly one member, or give up."""
    if hint is None:
        return None, False

    folded = hint.casefold()

    name_matches = [m for m in members if m.name.casefold() == folded]
    if len(name_matches) == 1:
        return name_matches[0].user_id, True

    email_matches = [m for m in members if m.email.split("@", 1)[0].casefold() == folded]
    if len(email_matches) == 1:
        return email_matches[0].user_id, True

    return None, False


def resolve_story_hint(hint: str | None, stories: list[Story]) -> tuple[uuid.UUID | None, bool]:
    """Resolve a free-text story hint to exactly one story, or give up."""
    if hint is None:
        return None, False

    folded = hint.casefold()
    matches = [s for s in stories if s.title.casefold() == folded]
    if len(matches) == 1:
        return matches[0].id, True

    return None, False


async def preview_capture(
    project_id: uuid.UUID,
    payload: CaptureRequest,
    user: User,
    db: AsyncSession,
    client,
    request: Request,
) -> CaptureResponse:
    """Extract candidate tasks from free text and resolve hints to real ids.

    Never writes to the DB — this is a preview only, the caller confirms
    separately before anything is persisted.
    """
    # Imported here, not at module level, to avoid a circular import: app.api.main
    # imports app.api.routes.tasks at startup, which imports this module.
    from app.api.main import translate

    reference_date = payload.reference_date or datetime.now(UTC).date()
    ctx, members, stories = await build_project_context(project_id, user, db, reference_date)

    if payload.story_id is not None and payload.story_id not in {s.id for s in stories}:
        raise HTTPException(status_code=422, detail="STORY_NOT_FOUND")

    outcome = await extract(payload.text, ctx, client)

    warnings: list[str] = []

    if outcome.unparseable:
        warnings.append(translate(request, "CAPTURE_UNPARSEABLE"))
        return CaptureResponse(
            tasks=[],
            unparseable=True,
            needs_confirmation=True,
            warnings=warnings,
            model=outcome.model,
            prompt_version=outcome.prompt_version,
            latency_ms=outcome.latency_ms,
        )

    if outcome.result.not_a_task:
        warnings.append(translate(request, "CAPTURE_NOT_A_TASK"))
        return CaptureResponse(
            tasks=[],
            unparseable=False,
            needs_confirmation=True,
            warnings=warnings,
            model=outcome.model,
            prompt_version=outcome.prompt_version,
            latency_ms=outcome.latency_ms,
        )

    captured_tasks: list[CapturedTask] = []
    for task in outcome.result.tasks:
        assignee_id, assignee_resolved = resolve_assignee_hint(task.assignee_hint, members)
        if task.assignee_hint is not None and not assignee_resolved:
            warnings.append(
                f"Could not resolve assignee '{task.assignee_hint}' to a project member"
            )

        story_id, story_resolved = resolve_story_hint(task.story_hint, stories)
        if task.story_hint is not None and not story_resolved:
            warnings.append(f"Could not resolve story '{task.story_hint}' to a project story")
        if story_id is None and payload.story_id is not None:
            story_id = payload.story_id
            story_resolved = True

        low_confidence = task.confidence < settings.LLM_CAPTURE_MIN_CONFIDENCE

        captured_tasks.append(
            CapturedTask(
                title=task.title,
                description=task.description,
                story_hint=task.story_hint,
                story_id=story_id,
                story_resolved=story_resolved,
                assignee_hint=task.assignee_hint,
                assignee_id=assignee_id,
                assignee_resolved=assignee_resolved,
                due_date=task.due_date,
                priority=task.priority,
                confidence=task.confidence,
                low_confidence=low_confidence,
            )
        )

    return CaptureResponse(
        tasks=captured_tasks,
        unparseable=False,
        needs_confirmation=True,
        warnings=warnings,
        model=outcome.model,
        prompt_version=outcome.prompt_version,
        latency_ms=outcome.latency_ms,
    )
