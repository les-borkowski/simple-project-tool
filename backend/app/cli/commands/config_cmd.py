from __future__ import annotations

import typer
from rich.panel import Panel
from rich.table import Table

from ..config import CLIConfig
from ..http import APIClient
from ..output import console, fmt_date, load_locale, t

app = typer.Typer(help="Configuration commands")
api_keys_app = typer.Typer(help="API key management")
app.add_typer(api_keys_app, name="api-keys")
llm_app = typer.Typer(help="LLM credential management")
app.add_typer(llm_app, name="llm")

LOCALE_FIELDS = {"locale", "theme"}

# What `config set` will send. Mirrors UserConfigUpdate minus display_preferences,
# which takes a dict and so cannot come from a CLI string argument. Kept separate
# from LOCALE_FIELDS above, which answers a different question — whether to mirror
# the value into the local config file — even though the two sets coincide today.
SETTABLE_KEYS = ("locale", "theme")

# Keys people reach for that this command cannot set, pointing at what does.
# The server ignores unknown fields rather than rejecting them, so without this
# `config set api_base_url ...` reported success and changed nothing.
REDIRECTED_KEYS = {
    "api_base_url": "config.set_api_url_hint",
    "api_url": "config.set_api_url_hint",
}


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
    if key in REDIRECTED_KEYS:
        console.print(t(REDIRECTED_KEYS[key]))
        raise typer.Exit(1)
    if key not in SETTABLE_KEYS:
        # `name=`, not `key=`: t()'s own first parameter is called `key`.
        console.print(t("config.unknown_key", name=key, keys=", ".join(SETTABLE_KEYS)))
        raise typer.Exit(1)
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
    # This endpoint returns a bare JSON array, not a paginated {"items": [...]} envelope.
    items = client.get("/config/api-keys")
    table = Table(title="API Keys")
    # Full id, not short_id: it is the argument `api-keys revoke` takes.
    table.add_column(t("col.id"), style="cyan")
    table.add_column(t("col.label"))
    table.add_column(t("col.scopes"))
    table.add_column(t("col.last_used"))
    for key in items:
        table.add_row(
            key["id"],
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


@llm_app.command("list")
def llm_list() -> None:
    """List the current user's configured LLM credentials."""
    config, client = _setup()
    items = client.get("/config/llm-providers")
    if not items:
        console.print(t("llm.no_credentials"))
        return
    table = Table(title="LLM Credentials")
    table.add_column(t("col.provider"), style="cyan")
    table.add_column(t("col.label"))
    table.add_column(t("col.hint"))
    table.add_column(t("col.model"))
    table.add_column(t("col.rpm"))
    table.add_column(t("col.tpm"))
    table.add_column(t("col.default"))
    table.add_column(t("col.enabled"))
    for item in items:
        table.add_row(
            item["provider"],
            item.get("label", ""),
            item.get("api_key_hint", ""),
            item.get("model") or "—",
            f"{item.get('rpm_limit') or '—'} / {item['effective_rpm']}",
            f"{item.get('tpm_limit') or '—'} / {item['effective_tpm']}",
            t("bool.yes") if item.get("is_default") else t("bool.no"),
            t("bool.yes") if item.get("enabled") else t("bool.no"),
        )
    console.print(table)


@llm_app.command("providers")
def llm_providers() -> None:
    """List the available LLM providers (catalogue)."""
    config, client = _setup()
    items = client.get("/config/llm-providers/available")
    if not items:
        console.print(t("llm.no_providers"))
        return
    table = Table(title="LLM Providers")
    table.add_column(t("col.id"), style="cyan")
    table.add_column(t("col.label"))
    table.add_column(t("col.default_model"))
    table.add_column(t("col.available"))
    table.add_column(t("col.hint"))
    table.add_column(t("col.docs"))
    for item in items:
        table.add_row(
            item["id"],
            item.get("label", ""),
            item.get("default_model", ""),
            t("bool.yes") if item.get("available") else t("bool.no"),
            item.get("key_hint", ""),
            item.get("docs_url", ""),
        )
    console.print(table)


@llm_app.command("set")
def llm_set(
    provider: str = typer.Argument(..., help="Provider id, e.g. google"),
    api_key: str = typer.Option(..., prompt=True, hide_input=True, help="Provider API key"),
    model: str | None = typer.Option(None, help="Model override"),
    rpm: int | None = typer.Option(None, help="Per-credential RPM limit"),
    tpm: int | None = typer.Option(None, help="Per-credential TPM limit"),
    default: bool = typer.Option(False, "--default", help="Set as default credential"),
) -> None:
    """Create or update the current user's credential for a provider."""
    config, client = _setup()
    body: dict[str, object] = {"api_key": api_key}
    if model is not None:
        body["model"] = model
    if rpm is not None:
        body["rpm_limit"] = rpm
    if tpm is not None:
        body["tpm_limit"] = tpm
    if default:
        body["is_default"] = True
    client.patch(f"/config/llm-providers/{provider}", json=body)
    console.print(t("llm.set_success"))


@llm_app.command("delete")
def llm_delete(provider: str = typer.Argument(..., help="Provider id, e.g. google")) -> None:
    """Remove the current user's credential for a provider."""
    config, client = _setup()
    client.delete(f"/config/llm-providers/{provider}")
    console.print(t("llm.deleted"))
