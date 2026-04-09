# Implementation Plan: CLI Tool

**Module**: `backend/app/cli/`
**Depends on**: API layer (must be running; CLI communicates via HTTP only)
**Shares**: Python environment with backend (same `pyproject.toml`)

---

## Overview

The CLI tool (`spt`) mirrors the full REST API surface as terminal commands. It is implemented with Typer, outputs via Rich (tables, panels, progress), handles auth token storage, and fully supports the two locales (en-GB, pl) using Babel for date/number formatting and JSON translation files. The CLI never imports backend models directly — it only makes HTTP calls.

---

## 1. Setup & Scaffolding

### 1.1 Entry point
In `backend/pyproject.toml`:
```toml
[project.scripts]
spt = "app.cli.main:app"
```

Install (from `backend/` directory):
```bash
uv pip install -e .
spt --help    # verify
```

### 1.2 Directory structure
```
backend/app/cli/
├── __init__.py
├── main.py                    # Root Typer app, register command groups
├── config.py                  # CLIConfig — token + locale storage
├── http.py                    # httpx client, auth, error handling
├── i18n.py                    # t() function, locale loading
├── utils/
│   ├── __init__.py
│   ├── format.py              # format_date, format_duration, format_table
│   └── output.py              # Rich console helpers
├── locales/
│   ├── en-GB.json
│   └── pl.json
└── commands/
    ├── __init__.py
    ├── auth.py
    ├── projects.py
    ├── stories.py
    ├── tasks.py
    ├── comments.py
    ├── invitations.py
    ├── time_tracking.py
    └── config_cmd.py          # `config` is a reserved word; use config_cmd
```

---

## 2. Configuration & Credential Storage (`config.py`)

```python
from pathlib import Path
import json
from dataclasses import dataclass, asdict

CONFIG_PATH = Path.home() / ".config" / "spt" / "config.json"

@dataclass
class CLIConfig:
    access_token: str | None = None
    refresh_token: str | None = None
    api_base_url: str = "http://localhost:8000"
    locale: str = "en-GB"

def load_config() -> CLIConfig:
    if CONFIG_PATH.exists():
        data = json.loads(CONFIG_PATH.read_text())
        return CLIConfig(**data)
    return CLIConfig()

def save_config(config: CLIConfig) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(asdict(config), indent=2))
    CONFIG_PATH.chmod(0o600)     # owner read/write only — tokens are sensitive
```

**Security**: Set file permissions to `0o600` on every write. Tokens are sensitive.

---

## 3. i18n (`i18n.py`)

```python
import json
from pathlib import Path

_locale_cache: dict[str, dict] = {}

def _load_locale(locale: str) -> dict:
    if locale not in _locale_cache:
        path = Path(__file__).parent / "locales" / f"{locale}.json"
        if not path.exists():
            path = Path(__file__).parent / "locales" / "en-GB.json"
        _locale_cache[locale] = json.loads(path.read_text())
    return _locale_cache[locale]

def t(key: str, locale: str | None = None, **kwargs) -> str:
    if locale is None:
        locale = load_config().locale
    messages = _load_locale(locale)
    template = messages.get(key, key)
    return template.format(**kwargs) if kwargs else template
```

### CLI locale JSON (`locales/en-GB.json`)
```json
{
  "auth.logged_in": "Logged in as {name}",
  "auth.logged_out": "Logged out successfully",
  "auth.login_prompt_email": "Email",
  "auth.login_prompt_password": "Password",

  "projects.created": "Project created: {name}",
  "projects.deleted": "Project deleted",
  "projects.archived": "Project archived",
  "projects.restored": "Project restored",
  "projects.header_name": "Name",
  "projects.header_status": "Status",
  "projects.header_priority": "Priority",

  "status.to_do": "To do",
  "status.in_progress": "In progress",
  "status.in_review": "In review",
  "status.in_testing": "In testing",
  "status.done": "Done",

  "priority.low": "Low",
  "priority.medium": "Medium",
  "priority.high": "High",

  "confirm.delete": "Are you sure you want to delete this? [y/N]",
  "confirm.revoke": "Revoke this API key? [y/N]",

  "error.not_authenticated": "Not logged in. Run: spt auth login",
  "error.api_error": "API error: {message}",

  "time.seconds": "{count}s",
  "time.minutes": "{count}m",
  "time.hours": "{count}h",
  "time.days": "{count}d",

  "tasks.count": "{count} task(s)"
}
```

### `locales/pl.json`
```json
{
  "auth.logged_in": "Zalogowano jako {name}",
  "auth.logged_out": "Wylogowano pomyślnie",
  "auth.login_prompt_email": "E-mail",
  "auth.login_prompt_password": "Hasło",

  "projects.created": "Projekt utworzony: {name}",
  "projects.deleted": "Projekt usunięty",
  "projects.archived": "Projekt zarchiwizowany",
  "projects.restored": "Projekt przywrócony",
  "projects.header_name": "Nazwa",
  "projects.header_status": "Status",
  "projects.header_priority": "Priorytet",

  "status.to_do": "Do zrobienia",
  "status.in_progress": "W toku",
  "status.in_review": "W przeglądzie",
  "status.in_testing": "W testach",
  "status.done": "Gotowe",

  "priority.low": "Niski",
  "priority.medium": "Średni",
  "priority.high": "Wysoki",

  "confirm.delete": "Na pewno chcesz to usunąć? [t/N]",
  "confirm.revoke": "Unieważnić ten klucz API? [t/N]",

  "error.not_authenticated": "Niezalogowany. Uruchom: spt auth login",
  "error.api_error": "Błąd API: {message}",

  "time.seconds": "{count} s",
  "time.minutes": "{count} min",
  "time.hours": "{count} godz.",
  "time.days": "{count} dni"
}
```

---

## 4. HTTP Client (`http.py`)

```python
import httpx
import typer
from .config import load_config, save_config
from .i18n import t

def get_client(authenticated: bool = True) -> httpx.Client:
    config = load_config()
    headers = {"Accept-Language": config.locale}
    if authenticated:
        if not config.access_token:
            typer.echo(t("error.not_authenticated"), err=True)
            raise typer.Exit(1)
        headers["Authorization"] = f"Bearer {config.access_token}"
    return httpx.Client(base_url=config.api_base_url + "/api/v1", headers=headers)

def handle_response(response: httpx.Response) -> dict:
    """Return parsed JSON on success; print error and exit on failure."""
    if response.status_code == 401:
        # Try token refresh
        refreshed = _try_refresh()
        if refreshed:
            # Caller must retry — raise a sentinel to signal this
            raise TokenRefreshException()
        typer.echo(t("error.not_authenticated"), err=True)
        raise typer.Exit(1)
    if not response.is_success:
        body = response.json()
        msg = body.get("error", {}).get("message", response.text)
        typer.echo(t("error.api_error", message=msg), err=True)
        raise typer.Exit(1)
    return response.json() if response.content else {}

def _try_refresh() -> bool:
    config = load_config()
    if not config.refresh_token:
        return False
    try:
        resp = httpx.post(
            config.api_base_url + "/api/v1/auth/refresh",
            json={"refresh_token": config.refresh_token},
        )
        if resp.is_success:
            config.access_token = resp.json()["access_token"]
            save_config(config)
            return True
    except Exception:
        pass
    return False
```

**Retry pattern**: Commands call `handle_response`. If it raises `TokenRefreshException`, the command retries the request with the new token (simple wrapper handles this).

---

## 5. Formatting Utilities (`utils/format.py`)

```python
from babel.dates import format_date as babel_format_date
from babel.numbers import format_number
from datetime import datetime

def format_date(iso_str: str, locale: str) -> str:
    dt = datetime.fromisoformat(iso_str)
    # Babel locale: "en_GB", "pl"
    babel_locale = locale.replace("-", "_")
    return babel_format_date(dt, format="short", locale=babel_locale)
    # en_GB → "09/04/2026"
    # pl → "09.04.2026"

def format_duration(total_seconds: float, locale: str) -> str:
    from .i18n import t
    if total_seconds < 60:
        return t("time.seconds", locale=locale, count=int(total_seconds))
    elif total_seconds < 3600:
        return t("time.minutes", locale=locale, count=int(total_seconds / 60))
    elif total_seconds < 86400:
        return t("time.hours", locale=locale, count=int(total_seconds / 3600))
    else:
        return t("time.days", locale=locale, count=int(total_seconds / 86400))
```

---

## 6. `main.py` — Root App

```python
import typer
from .commands import auth, projects, stories, tasks, comments, invitations, time_tracking, config_cmd

app = typer.Typer(name="spt", help="simple-project-tool CLI")
app.add_typer(auth.app, name="auth")
app.add_typer(projects.app, name="projects")
app.add_typer(stories.app, name="stories")
app.add_typer(tasks.app, name="tasks")
app.add_typer(comments.app, name="comments")
app.add_typer(invitations.app, name="invitations")
app.add_typer(time_tracking.app, name="time")     # spt time-metrics, spt time-history, spt time-report
app.add_typer(config_cmd.app, name="config")

if __name__ == "__main__":
    app()
```

---

## 7. Command Groups

### 7.1 `commands/auth.py`
```
app = typer.Typer(help="Authentication commands")

@app.command()
def login():
    email = typer.prompt(t("auth.login_prompt_email"))
    password = typer.prompt(t("auth.login_prompt_password"), hide_input=True)
    with get_client(authenticated=False) as client:
        resp = handle_response(client.post("/auth/login", json={"email": email, "password": password}))
    config = load_config()
    config.access_token = resp["access_token"]
    config.refresh_token = resp["refresh_token"]
    save_config(config)
    # Load user name for confirmation message
    with get_client() as client:
        user = handle_response(client.get("/auth/me"))
    typer.echo(t("auth.logged_in", name=user["name"]))

@app.command()
def logout():
    with get_client() as client:
        client.post("/auth/logout")     # best-effort
    config = load_config()
    config.access_token = None
    config.refresh_token = None
    save_config(config)
    typer.echo(t("auth.logged_out"))

@app.command()
def whoami():
    with get_client() as client:
        user = handle_response(client.get("/auth/me"))
    panel = Panel(f"[bold]{user['name']}[/bold]\n{user['email']}\n{t('role.' + user['role'])}")
    console.print(panel)
```

### 7.2 `commands/projects.py`
```
@app.command("list")
def list_projects(
    status: str | None = typer.Option(None),
    priority: str | None = typer.Option(None),
    archived: bool = typer.Option(False),
    search: str | None = typer.Option(None, "--search", "-s"),
    all_pages: bool = typer.Option(False, "--all", help="Fetch all pages automatically"),
):
    # Build params; fetch first page
    # If --all: loop fetching next pages until next_cursor is None
    # Display as Rich Table with columns: ID (short), Name, Status, Priority, Created
    # Status and priority shown as localised strings

@app.command()
def create(
    name: str = typer.Option(None, prompt=True),
    description: str | None = typer.Option(None),
    priority: str = typer.Option("medium"),
):
    # POST /projects → print created project name

@app.command()
def view(project_id: str):
    # GET /projects/{id}
    # Display as Rich Panel: all fields formatted
    # Show members table below

@app.command()
def update(project_id: str):
    # GET current state → interactive prompt for each field (enter to keep current)
    # PATCH with changed fields only

@app.command()
def delete(project_id: str):
    typer.confirm(t("confirm.delete"), abort=True)
    # DELETE /projects/{id}

@app.command()
def archive(project_id: str):
    # POST /projects/{id}/archive

@app.command()
def restore(project_id: str):
    # POST /projects/{id}/restore

@app.command()
def members(project_id: str):
    # GET /projects/{id}/members → Table: Name, Email, Role, Joined

@app.command()
def invite(
    project_id: str,
    email: str,
    role: str = typer.Option("contributor"),
):
    # POST /projects/{id}/invitations
```

### 7.3 `commands/stories.py`
Same CRUD pattern as projects, plus:
```
@app.command()
def move(story_id: str, target_project_id: str):
    # POST /stories/{id}/move {project_id: target_project_id}

@app.command()
def status(story_id: str, new_status: str):
    # PATCH /stories/{id} {status: new_status}

@app.command()
def priority(story_id: str, new_priority: str):
    # PATCH /stories/{id} {priority: new_priority}
```

### 7.4 `commands/tasks.py`
Same pattern, plus:
```
@app.command()
def assign(task_id: str, user_email: str):
    # Need to resolve email to user ID: GET /projects/.../members to find user
    # For simplicity: accept user_id directly OR resolve via dedicated endpoint (future)
    # PATCH /tasks/{id} {assignee_id: resolved_id}

@app.command()
def unassign(task_id: str):
    # PATCH /tasks/{id} {assignee_id: null}
```

### 7.5 `commands/comments.py`
```
# item_ref format: "project:<uuid>", "story:<uuid>", "task:<uuid>"

@app.command()
def add(item_ref: str, text: str):
    item_type, item_id = item_ref.split(":", 1)
    # POST /{item_type}s/{item_id}/comments

@app.command("list")
def list_comments(item_ref: str):
    item_type, item_id = item_ref.split(":", 1)
    # GET /{item_type}s/{item_id}/comments → Table: Author, Body, Date
```

### 7.6 `commands/invitations.py`
```
@app.command("list")
def list_invitations():
    # GET /invitations/mine → Table: Project, Inviter, Role, Expires

@app.command()
def accept(invitation_id: str):
    # POST /invitations/{id}/accept

@app.command()
def decline(invitation_id: str):
    # POST /invitations/{id}/decline
```

### 7.7 `commands/time_tracking.py`
```
# item_ref: "project:<id>", "story:<id>", "task:<id>"

@app.command("metrics")
def time_metrics(item_ref: str):
    item_type, item_id = item_ref.split(":", 1)
    # GET /{item_type}s/{item_id}/time-metrics
    # Display Table: Status | Time Spent | % of Total
    # Use format_duration() for time values

@app.command("history")
def time_history(item_ref: str):
    item_type, item_id = item_ref.split(":", 1)
    # GET /{item_type}s/{item_id}/status-history
    # Display timeline: From → To | Who | When | Duration in that status

@app.command("report")
def time_report(project_id: str):
    # GET /projects/{id}/time-report
    # Display summary table + per-item breakdown
```

### 7.8 `commands/config_cmd.py`
```
@app.command()
def set(key: str, value: str):
    # If key is "locale": validate against /config/locales; update locally too
    # PATCH /config with {key: value}
    # Also update CLIConfig.locale if key=="locale"

@app.command()
def get(key: str):
    # GET /config → print the specific key's value

@app.command()
def locales():
    # GET /config/locales → Table: Code | Name | Date format | Number format

# api-keys sub-group
api_keys_app = typer.Typer()
app.add_typer(api_keys_app, name="api-keys")

@api_keys_app.command("list")
def list_api_keys():
    # GET /config/api-keys → Table: Label | Scopes | Last used | Created

@api_keys_app.command("create")
def create_api_key(
    label: str = typer.Option(..., prompt=True),
    scopes: str = typer.Option("read:tasks", help="Comma-separated scopes"),
):
    # POST /config/api-keys → print raw key in Panel (warn: shown only once)
    panel = Panel(f"[bold yellow]Save this key — it will not be shown again:[/bold yellow]\n\n{raw_key}")
    console.print(panel)

@api_keys_app.command("revoke")
def revoke_api_key(key_id: str):
    typer.confirm(t("confirm.revoke"), abort=True)
    # DELETE /config/api-keys/{id}
```

---

## 8. Output Formatting (`utils/output.py`)

```python
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

console = Console()

def print_table(columns: list[str], rows: list[list[str]], title: str | None = None) -> None:
    table = Table(title=title, show_header=True, header_style="bold")
    for col in columns:
        table.add_column(col)
    for row in rows:
        table.add_row(*row)
    console.print(table)

def print_panel(content: str, title: str | None = None) -> None:
    console.print(Panel(content, title=title))

def short_id(uuid_str: str) -> str:
    """Return first 8 chars for compact display."""
    return uuid_str[:8]
```

All list commands use `print_table`. All detail commands use `print_panel`. Dates in all output use `format_date(iso_str, locale)`.

---

## 9. Pagination in CLI

For `list` commands:
- Default: fetch first page (limit=25), display table, print "Use --all to fetch all pages"
- `--all` flag: loop automatically, accumulate all results, display combined table
- No interactive "load more" — CLI is batch-oriented

```python
def fetch_all_pages(client, endpoint: str, params: dict) -> list[dict]:
    results = []
    cursor = None
    while True:
        if cursor:
            params["cursor"] = cursor
        data = handle_response(client.get(endpoint, params=params))
        results.extend(data["data"])
        cursor = data.get("next_cursor")
        if not cursor:
            break
    return results
```

---

## 10. Testing Checklist

- [ ] `spt --help` lists all command groups
- [ ] `spt auth login` with wrong credentials exits 1 with error message
- [ ] `spt auth login` success saves tokens to `~/.config/spt/config.json` with `0o600` permissions
- [ ] `spt auth whoami` prints name, email, role
- [ ] `spt auth logout` clears tokens from config
- [ ] `spt projects list` outputs a table with header row
- [ ] `spt projects list --all` fetches multiple pages and combines them
- [ ] `spt projects create --name "Test"` creates project and prints name
- [ ] `spt projects delete <id>` prompts for confirmation; enters "n" → no delete
- [ ] `spt config set locale pl` → subsequent `spt projects list` outputs Polish headers
- [ ] Polish locale: dates in DD.MM.YYYY format in table output
- [ ] `spt time metrics task:<id>` shows table with time per status
- [ ] `spt time history story:<id>` shows chronological status changes
- [ ] `spt config api-keys create` shows raw key in panel, warns it is shown only once
- [ ] `spt config api-keys revoke <id>` requires confirmation
- [ ] On 401 response, CLI transparently refreshes token and retries
- [ ] When refresh fails, CLI prints "not logged in" error and exits 1
- [ ] `spt invitations list` shows pending invitations
- [ ] `spt invitations accept <id>` calls accept endpoint and confirms success
