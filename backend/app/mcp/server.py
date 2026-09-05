from __future__ import annotations

import asyncio
import logging
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date

from mcp.server.fastmcp import Context, FastMCP

from app.mcp.client import SPTClient
from app.mcp.config import MCPConfig
from app.mcp.errors import MCPConfigError, tool_errors


@asynccontextmanager
async def lifespan(_: FastMCP) -> AsyncIterator[SPTClient]:
    config = MCPConfig.load()
    client = SPTClient(config)
    try:
        yield client
    finally:
        await client.aclose()


mcp = FastMCP("simple-project-tool", lifespan=lifespan)


async def _whoami_impl(client: SPTClient) -> dict:
    return await client.get("/auth/me")


@mcp.tool()
@tool_errors
async def whoami(ctx: Context) -> dict:
    """Return the current identity: user id, name, email, role, and (if authenticated via
    API key) the key's label and scopes. Call this first if you're unsure what you're
    allowed to do."""
    client: SPTClient = ctx.request_context.lifespan_context
    return await _whoami_impl(client)


async def _list_projects_impl(client: SPTClient, include_archived: bool = False) -> list:
    params = {"archived": include_archived} if include_archived else None
    return await client.fetch_all("/projects", params)


@mcp.tool()
@tool_errors
async def list_projects(ctx: Context, include_archived: bool = False) -> list:
    """List projects accessible to the current user. By default returns only active
    (non-archived) projects. Set include_archived=True to see only archived projects
    instead of active ones - the two sets are not combined."""
    client: SPTClient = ctx.request_context.lifespan_context
    return await _list_projects_impl(client, include_archived)


async def _get_project_impl(client: SPTClient, project_id: str) -> dict:
    project, members, statuses = await asyncio.gather(
        client.get(f"/projects/{project_id}"),
        client.get(f"/projects/{project_id}/members"),
        client.get(f"/projects/{project_id}/statuses"),
    )
    return {"project": project, "statuses": statuses, "members": members}


@mcp.tool()
@tool_errors
async def get_project(ctx: Context, project_id: str) -> dict:
    """Call this before creating or updating anything in a project. Statuses are per-project -
    the slugs returned here are the only values update_task will accept. Member user_ids
    here are the only valid assignee_ids."""
    client: SPTClient = ctx.request_context.lifespan_context
    return await _get_project_impl(client, project_id)


async def _list_stories_impl(client: SPTClient, project_id: str) -> list:
    return await client.fetch_all(f"/projects/{project_id}/stories")


@mcp.tool()
@tool_errors
async def list_stories(ctx: Context, project_id: str) -> list:
    """List stories in a project."""
    client: SPTClient = ctx.request_context.lifespan_context
    return await _list_stories_impl(client, project_id)


async def _list_tasks_impl(
    client: SPTClient,
    project_id: str,
    status: str | None = None,
    assignee_id: str | None = None,
    story_id: str | None = None,
    q: str | None = None,
    unassigned: bool = False,
) -> list:
    params: dict = {}
    if status is not None:
        params["status"] = status
    if assignee_id is not None:
        params["assignee_id"] = assignee_id
    if q is not None:
        params["q"] = q

    # The REST `unassigned` query param (project-scoped endpoint only) actually means
    # "no story", not "no assignee" - there's no server-side "assignee is null" filter
    # on either endpoint, so "no assignee" is applied here as a client-side post-filter,
    # which works identically whether or not story_id is set.
    if story_id is not None:
        items = await client.fetch_all(f"/stories/{story_id}/tasks", params)
    else:
        items = await client.fetch_all(f"/projects/{project_id}/tasks", params)

    if unassigned:
        items = [item for item in items if item.get("assignee_id") is None]
    return items


@mcp.tool()
@tool_errors
async def list_tasks(
    ctx: Context,
    project_id: str,
    status: str | None = None,
    assignee_id: str | None = None,
    story_id: str | None = None,
    q: str | None = None,
    unassigned: bool = False,
) -> list:
    """List tasks in a project, or within a single story if story_id is given. Filter by
    status slug, assignee_id, or a free-text query q. unassigned=True returns only tasks
    with no assignee (works with or without story_id)."""
    client: SPTClient = ctx.request_context.lifespan_context
    return await _list_tasks_impl(client, project_id, status, assignee_id, story_id, q, unassigned)


async def _get_task_impl(client: SPTClient, task_id: str, include_comments: bool = True) -> dict:
    if not include_comments:
        return await client.get(f"/tasks/{task_id}")
    task, comments = await asyncio.gather(
        client.get(f"/tasks/{task_id}"),
        client.fetch_all(f"/tasks/{task_id}/comments"),
    )
    return {**task, "comments": comments}


@mcp.tool()
@tool_errors
async def get_task(ctx: Context, task_id: str, include_comments: bool = True) -> dict:
    """Get a task by id. Includes its comments unless include_comments=False."""
    client: SPTClient = ctx.request_context.lifespan_context
    return await _get_task_impl(client, task_id, include_comments)


async def _search_impl(client: SPTClient, q: str) -> list:
    return await client.get("/search", params={"q": q})


@mcp.tool()
@tool_errors
async def search(ctx: Context, q: str) -> list:
    """Full-text search across projects, stories, and tasks visible to the current user."""
    client: SPTClient = ctx.request_context.lifespan_context
    return await _search_impl(client, q)


def _non_none(**kwargs) -> dict:
    """Build a request body from only the arguments the caller actually set - the API is
    PATCH-only by design, so sending explicit nulls would blank fields untouched."""
    return {k: v for k, v in kwargs.items() if v is not None}


async def _update_task_impl(
    client: SPTClient,
    task_id: str,
    status: str | None = None,
    priority: str | None = None,
    title: str | None = None,
    description: str | None = None,
    assignee_id: str | None = None,
) -> dict | str:
    body = _non_none(
        status=status,
        priority=priority,
        title=title,
        description=description,
        assignee_id=assignee_id,
    )
    if not body:
        return (
            "No fields provided - supply at least one of status, priority, title, "
            "description, assignee_id to update_task."
        )
    return await client.patch(f"/tasks/{task_id}", json=body)


@mcp.tool()
@tool_errors
async def update_task(
    ctx: Context,
    task_id: str,
    status: str | None = None,
    priority: str | None = None,
    title: str | None = None,
    description: str | None = None,
    assignee_id: str | None = None,
) -> dict | str:
    """Partially update a task. Only the arguments you pass are changed (PATCH semantics) -
    leave everything else as None. status must be one of the status slugs returned by
    get_project for this task's project - it is not a fixed enum, each project defines its
    own workflow; a 422 response means the slug is unknown to that project. priority is one
    of low|medium|high. assignee_id must be a member user_id from get_project. At least one
    field must be given; calling with none of them makes no HTTP request and returns an
    error string instead."""
    client: SPTClient = ctx.request_context.lifespan_context
    return await _update_task_impl(
        client, task_id, status, priority, title, description, assignee_id
    )


_COMMENT_TARGET_ENDPOINTS = {
    "project": "projects",
    "story": "stories",
    "task": "tasks",
}


async def _add_comment_impl(client: SPTClient, target: str, text: str) -> dict | str:
    parts = target.split(":", 1)
    if len(parts) != 2 or parts[0] not in _COMMENT_TARGET_ENDPOINTS:
        return (
            f"Invalid target '{target}' - must be 'project:<uuid>', 'story:<uuid>', or "
            "'task:<uuid>'."
        )
    kind, item_id = parts
    endpoint = _COMMENT_TARGET_ENDPOINTS[kind]
    return await client.post(f"/{endpoint}/{item_id}/comments", json={"body": text})


@mcp.tool()
@tool_errors
async def add_comment(ctx: Context, target: str, text: str) -> dict | str:
    """Add a comment to a project, story, or task. target is 'project:<uuid>',
    'story:<uuid>', or 'task:<uuid>' - the same item-reference format used by the CLI. A
    malformed target returns an error string instead of attempting a request."""
    client: SPTClient = ctx.request_context.lifespan_context
    return await _add_comment_impl(client, target, text)


async def _create_task_impl(
    client: SPTClient,
    project_id: str,
    title: str,
    description: str | None = None,
    story_id: str | None = None,
    assignee_id: str | None = None,
    priority: str | None = None,
    due_date: str | None = None,
) -> dict:
    body = {
        "title": title,
        **_non_none(
            description=description, assignee_id=assignee_id, priority=priority, due_date=due_date
        ),
    }

    if story_id is not None:
        return await client.post(f"/stories/{story_id}/tasks", json=body)
    return await client.post(f"/projects/{project_id}/tasks", json=body)


@mcp.tool()
@tool_errors
async def create_task(
    ctx: Context,
    project_id: str,
    title: str,
    description: str | None = None,
    story_id: str | None = None,
    assignee_id: str | None = None,
    priority: str | None = None,
    due_date: str | None = None,
) -> dict:
    """Create a task. When story_id is given, the task is created under that story's
    actual project - project_id is only used to route the request when story_id is
    omitted (creating the task directly under the project instead). priority is one of
    low|medium|high (server picks a default if omitted). due_date is YYYY-MM-DD.
    assignee_id must be a member user_id from get_project."""
    client: SPTClient = ctx.request_context.lifespan_context
    return await _create_task_impl(
        client, project_id, title, description, story_id, assignee_id, priority, due_date
    )


async def _create_story_impl(
    client: SPTClient,
    project_id: str,
    title: str,
    description: str | None = None,
    priority: str | None = None,
) -> dict:
    body = {"title": title, **_non_none(description=description, priority=priority)}
    return await client.post(f"/projects/{project_id}/stories", json=body)


@mcp.tool()
@tool_errors
async def create_story(
    ctx: Context,
    project_id: str,
    title: str,
    description: str | None = None,
    priority: str | None = None,
) -> dict:
    """Create a story in a project. priority is one of low|medium|high (server picks a
    default if omitted)."""
    client: SPTClient = ctx.request_context.lifespan_context
    return await _create_story_impl(client, project_id, title, description, priority)


async def _capture_tasks_impl(
    client: SPTClient,
    project_id: str,
    text: str,
    reference_date: str | None = None,
    story_id: str | None = None,
) -> dict:
    # Mirrors `spt tasks capture` - default to today so the LLM's relative-date
    # resolution ("tomorrow", "next Friday") has a fixed reference point.
    reference_date = reference_date or date.today().isoformat()
    body = {
        "text": text,
        "reference_date": reference_date,
        **_non_none(story_id=story_id),
    }
    return await client.post(f"/projects/{project_id}/tasks/capture", json=body)


@mcp.tool()
@tool_errors
async def capture_tasks(
    ctx: Context,
    project_id: str,
    text: str,
    reference_date: str | None = None,
    story_id: str | None = None,
) -> dict:
    """Extract candidate tasks from a free-text message using an LLM. This writes nothing -
    it only returns a preview batch of draft tasks (with resolved story/assignee ids where
    the model's hints matched, and warnings where they didn't). You must review the
    preview and call confirm_capture with the (possibly edited) tasks before anything is
    actually created. reference_date is YYYY-MM-DD and defaults to today if omitted - it
    anchors relative dates like "tomorrow" in the input text. story_id, if given, is used
    as the default story for any task the model didn't resolve a story hint for."""
    client: SPTClient = ctx.request_context.lifespan_context
    return await _capture_tasks_impl(client, project_id, text, reference_date, story_id)


_CONFIRM_ITEM_KEYS = {"title", "description", "story_id", "assignee_id", "due_date", "priority"}


def _filter_confirm_item(item: dict) -> dict:
    # capture_tasks previews carry extra fields (story_hint, confidence, etc.) that the
    # confirm endpoint's schema forbids - drop them so passing preview items straight
    # through to confirm_capture, as the capture_tasks docstring invites, actually works.
    return {k: v for k, v in item.items() if k in _CONFIRM_ITEM_KEYS}


async def _confirm_capture_impl(client: SPTClient, project_id: str, tasks: list[dict]) -> dict:
    body = {"tasks": [_filter_confirm_item(item) for item in tasks]}
    return await client.post(f"/projects/{project_id}/tasks/capture/confirm", json=body)


@mcp.tool()
@tool_errors
async def confirm_capture(ctx: Context, project_id: str, tasks: list[dict]) -> dict:
    """Create real tasks from a capture_tasks preview batch. tasks is a list of 1-20 items,
    each with keys title, description, story_id, assignee_id, due_date, priority (all but
    title are optional). This is all-or-nothing - if any item fails validation (e.g. an
    unknown story_id or assignee_id), the whole batch is rejected and no tasks are created."""
    client: SPTClient = ctx.request_context.lifespan_context
    return await _confirm_capture_impl(client, project_id, tasks)


def main() -> None:
    # stdout is the JSON-RPC wire for stdio transport; logging must go to stderr only,
    # and nothing in this process may print to stdout.
    logging.basicConfig(stream=sys.stderr, level=logging.INFO)

    try:
        MCPConfig.load()
    except MCPConfigError as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)

    mcp.run()


if __name__ == "__main__":
    main()
