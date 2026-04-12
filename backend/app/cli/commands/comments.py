from __future__ import annotations
import typer
from rich.table import Table
from ..config import CLIConfig
from ..http import APIClient
from ..output import console, load_locale, t, short_id, fmt_date

app = typer.Typer(help="Comment commands")

VALID_TYPES = {"project", "story", "task"}


def _parse_item_ref(item_ref: str) -> tuple[str, str]:
    parts = item_ref.split(":", 1)
    if len(parts) != 2 or parts[0] not in VALID_TYPES:
        raise typer.BadParameter(f"item must be in 'type:uuid' format, type one of: {', '.join(VALID_TYPES)}")
    return parts[0], parts[1]


def _setup() -> tuple[CLIConfig, APIClient]:
    config = CLIConfig.load()
    load_locale(config.locale)
    return config, APIClient(config)


@app.command("add")
def add_comment(
    item: str = typer.Argument(..., help="Item reference: project:<id>, story:<id>, or task:<id>"),
    text: str = typer.Argument(..., help="Comment text"),
) -> None:
    """Add a comment to an item."""
    item_type, item_id = _parse_item_ref(item)
    config, client = _setup()
    client.post(f"/{item_type}s/{item_id}/comments", json={"body": text})
    console.print(t("comment.added"))


@app.command("list")
def list_comments(
    item: str = typer.Argument(..., help="Item reference: project:<id>, story:<id>, or task:<id>"),
) -> None:
    """List comments on an item."""
    item_type, item_id = _parse_item_ref(item)
    config, client = _setup()
    items = client.get(f"/{item_type}s/{item_id}/comments").get("items", [])
    table = Table(title="Comments")
    table.add_column(t("col.id"), style="cyan")
    table.add_column(t("col.author"))
    table.add_column(t("col.body"))
    table.add_column(t("col.created"))
    for c in items:
        table.add_row(
            short_id(c["id"]), c.get("author_name", ""),
            c.get("body", ""), fmt_date(c.get("created_at")),
        )
    console.print(table)
