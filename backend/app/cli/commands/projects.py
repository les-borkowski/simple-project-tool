from __future__ import annotations
from typing import Optional
import typer
from rich.table import Table
from rich.panel import Panel
from ..config import CLIConfig
from ..http import APIClient
from ..output import console, load_locale, t, short_id, fmt_date, status_label, priority_label

app = typer.Typer(help="Project commands")


def _setup() -> tuple[CLIConfig, APIClient]:
    config = CLIConfig.load()
    load_locale(config.locale)
    return config, APIClient(config)


@app.command("list")
def list_projects(all_pages: bool = typer.Option(False, "--all", help="Fetch all pages")) -> None:
    """List all accessible projects."""
    config, client = _setup()
    if all_pages:
        items = client.fetch_all("/projects")
    else:
        items = client.get("/projects", params={"limit": 25}).get("items", [])
    table = Table(title="Projects")
    table.add_column(t("col.id"), style="cyan", no_wrap=True)
    table.add_column(t("col.name"))
    table.add_column(t("col.status"))
    table.add_column(t("col.priority"))
    table.add_column(t("col.created"))
    for p in items:
        table.add_row(
            short_id(p["id"]), p["name"],
            status_label(p.get("status", "")),
            priority_label(p.get("priority", "")),
            fmt_date(p.get("created_at")),
        )
    console.print(table)


@app.command()
def create(
    name: str = typer.Option(..., prompt=True, help="Project name"),
    description: Optional[str] = typer.Option(None, help="Project description"),
    priority: Optional[str] = typer.Option(None, help="Priority: low|medium|high"),
) -> None:
    """Create a new project."""
    config, client = _setup()
    body: dict = {"name": name}
    if description:
        body["description"] = description
    if priority:
        body["priority"] = priority
    data = client.post("/projects", json=body)
    console.print(f"{t('project.created')} [cyan]{short_id(data['id'])}[/cyan]")


@app.command()
def view(project_id: str = typer.Argument(..., help="Project ID")) -> None:
    """View project details."""
    config, client = _setup()
    d = client.get(f"/projects/{project_id}")
    console.print(Panel(
        f"[bold]{d['name']}[/bold]\n"
        f"{t('col.status')}: {status_label(d.get('status',''))}\n"
        f"{t('col.priority')}: {priority_label(d.get('priority',''))}\n"
        f"{t('col.created')}: {fmt_date(d.get('created_at'))}\n"
        f"{d.get('description') or ''}",
        title=short_id(d["id"]),
    ))


@app.command()
def delete(
    project_id: str = typer.Argument(..., help="Project ID"),
    yes: bool = typer.Option(False, "--yes", "-y", help="Skip confirmation"),
) -> None:
    """Delete a project."""
    if not yes:
        typer.confirm("Delete this project? This cannot be undone.", abort=True)
    config, client = _setup()
    client.delete(f"/projects/{project_id}")
    console.print(t("project.deleted"))


@app.command()
def archive(project_id: str = typer.Argument(...)) -> None:
    """Archive a project."""
    config, client = _setup()
    client.post(f"/projects/{project_id}/archive")
    console.print(t("project.archived"))


@app.command()
def restore(project_id: str = typer.Argument(...)) -> None:
    """Restore an archived project."""
    config, client = _setup()
    client.post(f"/projects/{project_id}/restore")
    console.print(t("project.restored"))


@app.command()
def members(project_id: str = typer.Argument(...)) -> None:
    """List project members."""
    config, client = _setup()
    items = client.get(f"/projects/{project_id}/members").get("items", [])
    table = Table(title="Members")
    table.add_column(t("col.id"), style="cyan")
    table.add_column(t("col.name"))
    table.add_column(t("col.email"))
    table.add_column(t("col.role"))
    for m in items:
        table.add_row(
            short_id(m["user_id"]), m.get("name", ""),
            m.get("email", ""), t(f"role.{m.get('role','')}"),
        )
    console.print(table)
