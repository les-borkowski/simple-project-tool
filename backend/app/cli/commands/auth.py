from __future__ import annotations

import typer

from ..config import CLIConfig
from ..http import APIClient
from ..output import console, load_locale, t

app = typer.Typer(help="Authentication commands")


@app.command()
def login(
    email: str = typer.Option(..., prompt=True, help="Your email address"),
    password: str = typer.Option(..., prompt=True, hide_input=True, help="Your password"),
) -> None:
    """Log in to Simple Project Tool."""
    config = CLIConfig.load()
    load_locale(config.locale)
    client = APIClient(config)
    data = client.post("/auth/login", json={"email": email, "password": password})
    config.access_token = data["access_token"]
    config.refresh_token = data["refresh_token"]
    config.save()
    console.print(t("login.success"))


@app.command()
def logout() -> None:
    """Log out of Simple Project Tool."""
    config = CLIConfig.load()
    load_locale(config.locale)
    if config.access_token:
        client = APIClient(config)
        try:
            client.post("/auth/logout")
        except SystemExit:
            pass
    config.clear_tokens()
    console.print(t("logout.success"))


@app.command()
def whoami() -> None:
    """Show current authenticated user."""
    config = CLIConfig.load()
    load_locale(config.locale)
    client = APIClient(config)
    data = client.get("/auth/me")
    console.print(f"[bold]{data['name']}[/bold] ({data['email']}) — {data['role']}")
