from __future__ import annotations
import typer
from rich.table import Table
from rich.panel import Panel
from ..config import CLIConfig
from ..http import APIClient
from ..output import console, load_locale, t, short_id, fmt_date, fmt_duration, status_label

VALID_TYPES = {"project", "story", "task"}


def _parse_ref(item_ref: str) -> tuple[str, str]:
    parts = item_ref.split(":", 1)
    if len(parts) != 2 or parts[0] not in VALID_TYPES:
        raise typer.BadParameter(f"item must be type:uuid, type one of: {', '.join(VALID_TYPES)}")
    return parts[0], parts[1]


def _setup() -> tuple[CLIConfig, APIClient]:
    config = CLIConfig.load()
    load_locale(config.locale)
    return config, APIClient(config)


def time_metrics(item: str = typer.Argument(..., help="Item ref: type:uuid")) -> None:
    """Get time metrics for an item."""
    item_type, item_id = _parse_ref(item)
    config, client = _setup()
    data = client.get(f"/{item_type}s/{item_id}/time-metrics")
    total = fmt_duration(data.get("total_seconds"))
    console.print(Panel(f"[bold]{t('time.total_time')}:[/bold] {total}", title="Time Metrics"))
    breakdown = data.get("by_status", [])
    if breakdown:
        table = Table(title=t("time.status_breakdown"))
        table.add_column(t("col.status"))
        table.add_column(t("col.duration"))
        for row in breakdown:
            table.add_row(status_label(row.get("status", "")), fmt_duration(row.get("seconds")))
        console.print(table)


def time_history(item: str = typer.Argument(..., help="Item ref: type:uuid")) -> None:
    """Get status change history for an item."""
    item_type, item_id = _parse_ref(item)
    config, client = _setup()
    items = client.get(f"/{item_type}s/{item_id}/status-history").get("items", [])
    table = Table(title="Status History")
    table.add_column(t("col.status"))
    table.add_column(t("time.changed_at"))
    table.add_column(t("col.changed_by"))
    for row in items:
        table.add_row(
            status_label(row.get("status", "")),
            fmt_date(row.get("changed_at")),
            row.get("changed_by_name", "—"),
        )
    console.print(table)


def time_report(project_id: str = typer.Argument(..., help="Project ID")) -> None:
    """Get project-level time report."""
    config, client = _setup()
    data = client.get(f"/projects/{project_id}/time-report")
    items = data.get("items", [])
    table = Table(title=t("time.total_time"))
    table.add_column(t("col.type"))
    table.add_column(t("col.id"), style="cyan")
    table.add_column(t("col.title"))
    table.add_column(t("col.duration"))
    for row in items:
        table.add_row(
            row.get("item_type", ""),
            short_id(row.get("item_id", "")),
            row.get("title", ""),
            fmt_duration(row.get("total_seconds")),
        )
    console.print(table)
