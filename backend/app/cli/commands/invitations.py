from __future__ import annotations

import typer
from rich.table import Table

from ..config import CLIConfig
from ..http import APIClient
from ..output import console, fmt_date, load_locale, short_id, t

app = typer.Typer(help="Invitation commands")


def _setup() -> tuple[CLIConfig, APIClient]:
    config = CLIConfig.load()
    load_locale(config.locale)
    return config, APIClient(config)


@app.command("list")
def list_invitations() -> None:
    """List my pending invitations."""
    config, client = _setup()
    items = client.get("/invitations/mine").get("items", [])
    table = Table(title="Invitations")
    table.add_column(t("col.id"), style="cyan")
    table.add_column("Project")
    table.add_column(t("col.role"))
    table.add_column(t("col.created"))
    for inv in items:
        table.add_row(
            short_id(inv["id"]),
            inv.get("project_name", ""),
            t(f"role.{inv.get('role', '')}"),
            fmt_date(inv.get("created_at")),
        )
    console.print(table)


@app.command()
def accept(invitation_id: str = typer.Argument(...)) -> None:
    """Accept an invitation."""
    config, client = _setup()
    client.post(f"/invitations/{invitation_id}/accept")
    console.print(t("invitation.accepted"))


@app.command()
def decline(invitation_id: str = typer.Argument(...)) -> None:
    """Decline an invitation."""
    config, client = _setup()
    client.post(f"/invitations/{invitation_id}/decline")
    console.print(t("invitation.declined"))
