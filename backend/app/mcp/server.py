from __future__ import annotations

import asyncio
import logging
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

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
