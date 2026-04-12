from __future__ import annotations

import typer
from rich.table import Table

from ..config import CLIConfig
from ..http import APIClient
from ..output import console, fmt_date, load_locale, priority_label, short_id, status_label, t

app = typer.Typer(help="Story commands")


def _setup() -> tuple[CLIConfig, APIClient]:
    config = CLIConfig.load()
    load_locale(config.locale)
    return config, APIClient(config)


@app.command("list")
def list_stories(
    project_id: str = typer.Argument(..., help="Project ID"),
    all_pages: bool = typer.Option(False, "--all"),
) -> None:
    """List stories in a project."""
    config, client = _setup()
    if all_pages:
        items = client.fetch_all(f"/projects/{project_id}/stories")
    else:
        items = client.get(f"/projects/{project_id}/stories", params={"limit": 25}).get("items", [])
    table = Table(title="Stories")
    table.add_column(t("col.id"), style="cyan")
    table.add_column(t("col.title"))
    table.add_column(t("col.status"))
    table.add_column(t("col.priority"))
    table.add_column(t("col.created"))
    for s in items:
        table.add_row(
            short_id(s["id"]),
            s.get("title", ""),
            status_label(s.get("status", "")),
            priority_label(s.get("priority", "")),
            fmt_date(s.get("created_at")),
        )
    console.print(table)


@app.command()
def create(
    project_id: str = typer.Argument(..., help="Project ID"),
    title: str = typer.Option(..., prompt=True),
    description: str | None = typer.Option(None),
    priority: str | None = typer.Option(None, help="low|medium|high"),
) -> None:
    """Create a story in a project."""
    config, client = _setup()
    body: dict = {"title": title}
    if description:
        body["description"] = description
    if priority:
        body["priority"] = priority
    data = client.post(f"/projects/{project_id}/stories", json=body)
    console.print(f"{t('story.created')} [cyan]{short_id(data['id'])}[/cyan]")


@app.command()
def update(
    story_id: str = typer.Argument(...),
    title: str | None = typer.Option(None),
    status: str | None = typer.Option(None, help="to_do|in_progress|in_review|in_testing|done"),
    priority: str | None = typer.Option(None, help="low|medium|high"),
    description: str | None = typer.Option(None),
) -> None:
    """Update a story."""
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
    client.patch(f"/stories/{story_id}", json=body)
    console.print(t("story.updated"))


@app.command()
def delete(
    story_id: str = typer.Argument(...),
    yes: bool = typer.Option(False, "--yes", "-y"),
) -> None:
    """Delete a story."""
    if not yes:
        typer.confirm("Delete this story?", abort=True)
    config, client = _setup()
    client.delete(f"/stories/{story_id}")
    console.print(t("story.deleted"))


@app.command()
def move(
    story_id: str = typer.Argument(..., help="Story ID"),
    project_id: str = typer.Argument(..., help="Destination project ID"),
) -> None:
    """Move a story to another project."""
    config, client = _setup()
    client.post(f"/stories/{story_id}/move", json={"project_id": project_id})
    console.print(t("story.moved"))
