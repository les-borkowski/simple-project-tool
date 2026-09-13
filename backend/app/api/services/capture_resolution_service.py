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

from app.api.schemas.capture import (
    CapturedTask,
    CaptureRequest,
    CaptureResponse,
    ConfirmRequest,
    ConfirmResponse,
)
from app.api.schemas.project import MemberResponse
from app.api.schemas.task import TaskCreate, TaskResponse
from app.api.services.capture_service import ProjectContext, extract
from app.api.services.llm_credential_service import resolve_credential
from app.api.services.llm_usage_service import (
    record_usage,
    release_usage,
    reserve_usage,
)
from app.api.services.project_service import list_members
from app.api.services.story_service import get_default_story
from app.api.services.task_service import assemble_task
from app.auth.permissions import require_not_demo, require_project_access
from app.core.config import settings
from app.core.llm import get_llm_client_for
from app.core.llm.base import LLMNotConfigured
from app.db.models import Project, Story, Task, User


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

    # Sorted, because both queries above are unordered: Postgres is free to return
    # rows in a different order after any update, and these names are interpolated
    # into the prompt. An unstable prompt means an unstable ReplayClient fixture key.
    ctx = ProjectContext(
        project_name=project.name,
        member_names=sorted(m.name for m in members),
        story_names=sorted(s.title for s in stories),
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

    Never writes task data — this is a preview only, the caller confirms
    separately before anything is persisted. Does record a rate-limiting
    usage event (token count) for the caller.
    """
    # Imported here, not at module level, to avoid a circular import: app.api.main
    # imports app.api.routes.tasks at startup, which imports this module.
    from app.api.main import translate

    # The pin wins over the client's date on purpose: the frontend always sends today,
    # so a replay demo can only stay reproducible if the server overrides it.
    if settings.CAPTURE_REFERENCE_DATE:
        reference_date = date.fromisoformat(settings.CAPTURE_REFERENCE_DATE)
    else:
        reference_date = payload.reference_date or datetime.now(UTC).date()
    ctx, members, stories = await build_project_context(project_id, user, db, reference_date)

    if payload.story_id is not None and payload.story_id not in {s.id for s in stories}:
        raise HTTPException(status_code=422, detail="STORY_NOT_FOUND")

    cred = await resolve_credential(user, db)
    provider = cred.provider if cred else settings.LLM_PROVIDER

    # The adapter must match the credential, not the global LLM_PROVIDER. The injected
    # `client` is built from settings, so a user whose default credential is for another
    # provider would have their key sent to the wrong one — an Anthropic key in a
    # x-goog-api-key header to Google. Unreachable today (only "google" is available),
    # but it becomes live credential exfiltration the moment another provider is
    # switched on in app/core/llm/providers.py.
    if cred is not None and cred.provider != settings.LLM_PROVIDER:
        client = get_llm_client_for(cred.provider)
    # Claimed before the call, for every user rather than just demo accounts. The claim
    # is what closes the window against concurrent callers, and it is what makes a
    # failed call still count: if extract raises below, this row stays behind with
    # total_tokens=0 instead of the call going unmetered because record_usage was
    # never reached. Raises 429 itself when the allowance is already gone.
    event_id = await reserve_usage(user, provider, db)

    # End the read transaction before the provider round-trip. reserve_usage already
    # committed the claim; what is still open here is the transaction its verify reads
    # started. Holding that across a multi-second LLM call ties up a pooled connection
    # per in-flight capture and, on managed Postgres, pins the xmin horizon and stalls
    # autovacuum.
    await db.commit()

    try:
        outcome = await extract(
            payload.text,
            ctx,
            client,
            api_key=cred.api_key if cred else None,
            model=cred.model if cred else None,
        )
    except LLMNotConfigured:
        # Raised before any request leaves the process, so no call was spent. Without
        # this, a server with no key configured burns the caller's whole allowance on
        # calls it never made, and they start seeing 429 instead of the 503 that would
        # actually tell them what is wrong.
        await release_usage(event_id, db)
        raise
    # Recorded once here, before branching on the outcome's shape — tokens were spent
    # whether the result parsed cleanly, came back "not a task", or was unparseable.
    await record_usage(
        user,
        provider,
        outcome.prompt_tokens + outcome.completion_tokens,
        db,
        event_id=event_id,
    )

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
                translate(request, "CAPTURE_ASSIGNEE_UNRESOLVED", hint=task.assignee_hint)
            )

        story_id, story_resolved = resolve_story_hint(task.story_hint, stories)
        if task.story_hint is not None and not story_resolved:
            warnings.append(translate(request, "CAPTURE_STORY_UNRESOLVED", hint=task.story_hint))
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


async def confirm_capture(
    project_id: uuid.UUID, payload: ConfirmRequest, user: User, db: AsyncSession
) -> ConfirmResponse:
    """Create real tasks from a reviewed capture batch. All-or-nothing: a 4xx creates zero tasks."""
    require_not_demo(user)

    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="PROJECT_NOT_FOUND")

    role = await require_project_access(user, project_id, db)

    backlog = await get_default_story(project_id, db)

    members = await list_members(project_id, user, db)
    valid_assignee_ids = {project.owner_id} | {m.user_id for m in members}

    # Validate the whole batch before writing anything, so a single invalid item
    # can never leave a partial set of tasks behind.
    for item in payload.tasks:
        if item.story_id is not None:
            story = await db.get(Story, item.story_id)
            if not story or story.project_id != project_id:
                raise HTTPException(status_code=422, detail="STORY_NOT_FOUND")
        if item.assignee_id is not None and item.assignee_id not in valid_assignee_ids:
            raise HTTPException(status_code=422, detail="INVALID_ASSIGNEE")

    created_tasks: list[Task] = []
    try:
        for item in payload.tasks:
            story_id = item.story_id if item.story_id is not None else backlog.id
            data = TaskCreate(
                title=item.title,
                description=item.description,
                status=None,
                priority=item.priority,
                assignee_id=item.assignee_id,
                effort=None,
                due_date=item.due_date,
                sprint_id=None,
            )
            task = await assemble_task(
                project_id,
                story_id,
                data,
                user,
                db,
                caller_role=role,
                default_assignee_to_creator=False,
            )
            created_tasks.append(task)
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return ConfirmResponse(created=[TaskResponse.model_validate(t) for t in created_tasks])
