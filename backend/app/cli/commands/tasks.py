from __future__ import annotations

from datetime import date

import typer
from rich.table import Table

from ..config import CLIConfig
from ..http import APIClient
from ..output import console, fmt_date, load_locale, priority_label, short_id, status_label, t

app = typer.Typer(help="Task commands")


def _setup(api_key: str | None = None) -> tuple[CLIConfig, APIClient]:
    config = CLIConfig.load()
    load_locale(config.locale)
    return config, APIClient(config, api_key=api_key)


@app.command("list")
def list_tasks(
    story_id: str = typer.Argument(..., help="Story ID"),
    all_pages: bool = typer.Option(False, "--all"),
) -> None:
    """List tasks in a story."""
    config, client = _setup()
    if all_pages:
        items = client.fetch_all(f"/stories/{story_id}/tasks")
    else:
        items = client.get(f"/stories/{story_id}/tasks", params={"limit": 25}).get("items", [])
    table = Table(title="Tasks")
    table.add_column(t("col.id"), style="cyan")
    table.add_column(t("col.title"))
    table.add_column(t("col.status"))
    table.add_column(t("col.priority"))
    table.add_column(t("col.assignee"))
    table.add_column(t("col.created"))
    for task in items:
        table.add_row(
            short_id(task["id"]),
            task.get("title", ""),
            status_label(task.get("status", "")),
            priority_label(task.get("priority", "")),
            task.get("assignee_name") or "—",
            fmt_date(task.get("created_at")),
        )
    console.print(table)


@app.command()
def create(
    story_id: str = typer.Argument(..., help="Story ID"),
    title: str = typer.Option(..., prompt=True),
    description: str | None = typer.Option(None),
    priority: str | None = typer.Option(None, help="low|medium|high"),
    assignee_id: str | None = typer.Option(None, "--assign"),
) -> None:
    """Create a task in a story."""
    config, client = _setup()
    body: dict = {"title": title}
    if description:
        body["description"] = description
    if priority:
        body["priority"] = priority
    if assignee_id:
        body["assignee_id"] = assignee_id
    data = client.post(f"/stories/{story_id}/tasks", json=body)
    console.print(f"{t('task.created')} [cyan]{short_id(data['id'])}[/cyan]")


@app.command()
def update(
    task_id: str = typer.Argument(...),
    title: str | None = typer.Option(None),
    status: str | None = typer.Option(None, help="to_do|in_progress|in_review|in_testing|done"),
    priority: str | None = typer.Option(None, help="low|medium|high"),
    description: str | None = typer.Option(None),
) -> None:
    """Update a task."""
    config, client = _setup()
    body = {
        k: v
        for k, v in {
            "title": title,
            "status": status,
            "priority": priority,
            "description": description,
        }.items()
        if v is not None
    }
    client.patch(f"/tasks/{task_id}", json=body)
    console.print(t("task.updated"))


@app.command()
def delete(
    task_id: str = typer.Argument(...),
    yes: bool = typer.Option(False, "--yes", "-y"),
) -> None:
    """Delete a task."""
    if not yes:
        typer.confirm("Delete this task?", abort=True)
    config, client = _setup()
    client.delete(f"/tasks/{task_id}")
    console.print(t("task.deleted"))


@app.command()
def assign(
    task_id: str = typer.Argument(..., help="Task ID"),
    user_id: str = typer.Argument(..., help="User ID to assign"),
) -> None:
    """Assign a task to a user."""
    config, client = _setup()
    client.patch(f"/tasks/{task_id}", json={"assignee_id": user_id})
    console.print(t("task.assigned"))


@app.command()
def capture(
    project_id: str = typer.Argument(...),
    text: str = typer.Argument(...),
    yes: bool = typer.Option(False, "--yes", "-y"),
    api_key: str | None = typer.Option(None, "--api-key", envvar="SPT_API_KEY"),
) -> None:
    """Extract candidate tasks from free text and create them after confirmation."""
    config, client = _setup(api_key=api_key)
    reference_date = date.today().isoformat()
    result = client.post(
        f"/projects/{project_id}/tasks/capture",
        json={"text": text, "reference_date": reference_date},
    )

    if result.get("unparseable"):
        console.print(t("capture.unparseable"))
        raise typer.Exit(0)
    if not result.get("tasks"):
        console.print(t("capture.no_tasks"))
        raise typer.Exit(0)

    for w in result.get("warnings", []):
        console.print(f"[yellow]{w}[/yellow]")

    table = Table(title=t("capture.preview_title"))
    table.add_column(t("col.title"))
    table.add_column(t("col.due_date"))
    table.add_column(t("col.assignee"))
    table.add_column(t("col.story"))
    table.add_column(t("col.priority"))
    for task in result["tasks"]:
        table.add_row(
            task["title"],
            fmt_date(task.get("due_date")),
            task.get("assignee_hint") or "—",
            task.get("story_hint") or "—",
            priority_label(task.get("priority") or ""),
            style="yellow" if task.get("low_confidence") else None,
        )
    console.print(table)

    if not yes:
        typer.confirm(t("capture.confirm_prompt"), abort=True)

    body = {
        "tasks": [
            {
                "title": item["title"],
                "description": item.get("description"),
                "story_id": item.get("story_id"),
                "assignee_id": item.get("assignee_id"),
                "due_date": item.get("due_date"),
                "priority": item.get("priority"),
            }
            for item in result["tasks"]
        ]
    }
    created = client.post(f"/projects/{project_id}/tasks/capture/confirm", json=body)
    console.print(t("capture.created", count=len(created.get("created", []))))
