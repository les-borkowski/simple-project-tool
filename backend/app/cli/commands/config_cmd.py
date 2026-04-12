from __future__ import annotations

import typer
from rich.panel import Panel
from rich.table import Table

from ..config import CLIConfig
from ..http import APIClient
from ..output import console, fmt_date, load_locale, short_id, t

app = typer.Typer(help="Configuration commands")
api_keys_app = typer.Typer(help="API key management")
app.add_typer(api_keys_app, name="api-keys")

LOCALE_FIELDS = {"locale", "theme"}


def _setup() -> tuple[CLIConfig, APIClient]:
    config = CLIConfig.load()
    load_locale(config.locale)
    return config, APIClient(config)


@app.command("get")
def config_get(key: str = typer.Argument(..., help="Config key to get")) -> None:
    """Get a configuration value."""
    config, client = _setup()
    data = client.get("/config")
    value = data.get(key)
    if value is None:
        typer.echo(f"Unknown key: {key}", err=True)
        raise typer.Exit(1)
    console.print(str(value))


@app.command("set")
def config_set(
    key: str = typer.Argument(..., help="Config key to set"),
    value: str = typer.Argument(..., help="Value to set"),
) -> None:
    """Set a configuration value."""
    config, client = _setup()
    client.patch("/config", json={key: value})
    if key in LOCALE_FIELDS:
        setattr(config, key, value)
        config.save()
    console.print(t("config.updated"))


@app.command("locales")
def config_locales() -> None:
    """List supported locales."""
    config, client = _setup()
    data = client.get("/config/locales")
    items = data.get("items", data if isinstance(data, list) else [])
    table = Table(title="Locales")
    table.add_column("Code", style="cyan")
    table.add_column("Name")
    table.add_column("Date Format")
    for loc in items:
        table.add_row(loc.get("code", ""), loc.get("name", ""), loc.get("date_format", ""))
    console.print(table)


@api_keys_app.command("list")
def api_keys_list() -> None:
    """List API keys."""
    config, client = _setup()
    items = client.get("/config/api-keys").get("items", [])
    table = Table(title="API Keys")
    table.add_column(t("col.id"), style="cyan")
    table.add_column(t("col.label"))
    table.add_column(t("col.scopes"))
    table.add_column(t("col.last_used"))
    for key in items:
        table.add_row(
            short_id(key["id"]),
            key.get("label", ""),
            ", ".join(key.get("scopes", [])),
            fmt_date(key.get("last_used_at")),
        )
    console.print(table)


@api_keys_app.command("create")
def api_keys_create(
    label: str = typer.Option(..., prompt=True, help="Label for this API key"),
    scopes: str = typer.Option(
        ..., help="Comma-separated scopes, e.g. read:projects,write:projects"
    ),
) -> None:
    """Create a new API key. The key is shown once only."""
    config, client = _setup()
    scope_list = [s.strip() for s in scopes.split(",") if s.strip()]
    data = client.post("/config/api-keys", json={"label": label, "scopes": scope_list})
    console.print(
        Panel(
            f"[bold yellow]{t('api_key.warning')}[/bold yellow]\n\n[green]{data['key']}[/green]",
            title=f"API Key: {data['label']}",
        )
    )


@api_keys_app.command("revoke")
def api_keys_revoke(key_id: str = typer.Argument(..., help="API key ID")) -> None:
    """Revoke an API key."""
    config, client = _setup()
    client.delete(f"/config/api-keys/{key_id}")
    console.print(t("api_key.revoked"))
