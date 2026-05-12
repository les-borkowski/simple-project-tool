# Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a server-rendered admin panel at `/admin` giving the app owner aggregate usage analytics without exposing user personal data.

**Architecture:** FastAPI router with Jinja2 templates, Starlette `SessionMiddleware` for HTTP-only cookie auth, admin credentials from env vars (never touches the users table). Analytics from direct SQL count/`GROUP BY date_trunc` queries. All new code lives in `backend/app/admin/`.

**Tech Stack:** FastAPI 0.135, Jinja2, itsdangerous (SessionMiddleware), python-multipart (Form parsing), Chart.js 4 via CDN, PostgreSQL `generate_series` for weekly trends.

---

## File Map

**Created:**
- `docs/superpowers/specs/2026-05-09-admin-panel-design.md`
- `backend/app/admin/__init__.py`
- `backend/app/admin/auth.py`
- `backend/app/admin/services.py`
- `backend/app/admin/router.py`
- `backend/app/admin/templates/layout.html`
- `backend/app/admin/templates/login.html`
- `backend/app/admin/templates/dashboard.html`
- `backend/tests/test_admin.py`

**Modified:**
- `backend/pyproject.toml` — add jinja2, python-multipart, itsdangerous
- `backend/app/db/models/user.py` — add `last_login` field
- `backend/migrations/versions/<hash>_add_last_login_to_users.py` — auto-generated
- `backend/app/api/services/auth_service.py` — stamp `last_login` on login
- `backend/app/core/config.py` — add ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_SECRET
- `backend/.env.example` — document new vars
- `backend/app/api/main.py` — add SessionMiddleware + include admin router

---

## Task 1: Write spec doc

**Files:**
- Create: `docs/superpowers/specs/2026-05-09-admin-panel-design.md`

- [ ] **Step 1: Create spec doc**

```bash
mkdir -p docs/superpowers/specs
```

Create `docs/superpowers/specs/2026-05-09-admin-panel-design.md`:

```markdown
# Admin Panel Design Spec

**Date:** 2026-05-09

## Context

The app has no admin/superuser concept. The owner wants a read-only analytics dashboard
to monitor aggregate usage without exposing user personal data.

## Auth & Session

Three env vars: `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_SECRET`.

- `POST /admin/login` verifies against env vars, sets an HTTP-only signed session cookie
  via Starlette `SessionMiddleware` storing `{"admin": true}`
- All admin routes redirect unauthenticated requests to `/admin/login`
- `POST /admin/logout` clears the session
- Admin identity never touches the users table

## Backend Structure

New module `backend/app/admin/` with router, auth helpers, services, and Jinja2 templates.
Registered in `backend/app/api/main.py` with prefix `/admin`.
No new Python dependencies beyond jinja2, python-multipart, and itsdangerous.

## Data Model Change

Add `last_login: datetime | None` to the `users` table (nullable, updated on each login).
Requires an Alembic migration.

## Stats

- **Totals:** total users, projects, stories, tasks + system-wide last login timestamp
- **Trends:** new entities per week for last 52 weeks via `GROUP BY date_trunc('week', created_at)`

No user emails, names, or personal data exposed — purely counts and timestamps.

## Dashboard Layout

- Top: 4 stat cards (Users, Projects, Stories, Tasks)
- Below: "Last login: YYYY-MM-DD HH:MM UTC"
- Main: 2×2 grid of Chart.js bar charts (one per entity type, 52-week x-axis)
- Nav bar with "Log out" button
- Plain CSS, no framework; Chart.js 4 via CDN
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-09-admin-panel-design.md
git commit -m "docs: add admin panel design spec"
```

---

## Task 2: Install new Python dependencies

**Files:**
- Modify: `backend/pyproject.toml`

- [ ] **Step 1: Add dependencies to pyproject.toml**

In `backend/pyproject.toml`, add to the `dependencies` list:

```toml
dependencies = [
    "fastapi>=0.115",
    "sqlalchemy[asyncio]>=2.0",
    "alembic>=1.13",
    "asyncpg>=0.29",
    "psycopg2-binary>=2.9",
    "pydantic[email]>=2.0",
    "pydantic-settings>=2.0",
    "pyjwt>=2.8",
    "bcrypt>=4.1",
    "typer>=0.12",
    "rich>=13",
    "httpx>=0.27",
    "babel>=2.14",
    "keyring>=25",
    "uvicorn>=0.29",
    "jinja2>=3.1",
    "python-multipart>=0.0.9",
    "itsdangerous>=2.1",
]
```

- [ ] **Step 2: Install**

```bash
cd backend
uv sync
```

Expected: resolves and installs jinja2, python-multipart, itsdangerous.

- [ ] **Step 3: Verify**

```bash
cd backend
uv run python -c "import jinja2, multipart, itsdangerous; print('all ok')"
```

Expected: `all ok`

- [ ] **Step 4: Commit**

```bash
git add backend/pyproject.toml
git commit -m "chore: add jinja2, python-multipart, itsdangerous for admin panel"
```

---

## Task 3: Add admin env vars to config

**Files:**
- Modify: `backend/app/core/config.py`
- Modify: `backend/.env.example`

- [ ] **Step 1: Add admin fields to Settings**

Replace `backend/app/core/config.py` with:

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

    # Database configuration
    DATABASE_URL: str
    SYNC_DATABASE_URL: str
    TEST_DATABASE_URL: str

    # Authentication
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS — comma-separated string; parse with .cors_origins_list
    CORS_ORIGINS: str = "http://localhost:5173"

    DEBUG: bool = False

    # Admin panel
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "changeme"
    ADMIN_SECRET: str = "change-this-admin-secret-32-chars"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
```

- [ ] **Step 2: Update .env.example**

Append to `backend/.env.example`:

```
# Admin panel
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-secure-password
ADMIN_SECRET=replace-with-32-random-bytes-hex
```

- [ ] **Step 3: Add to local .env**

Add to `backend/.env` (use real values):

```
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<your-password>
ADMIN_SECRET=<32-char-random-string>
```

- [ ] **Step 4: Verify settings loads**

```bash
cd backend
uv run python -c "from app.core.config import settings; print(settings.ADMIN_USERNAME)"
```

Expected: `admin`

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/config.py backend/.env.example
git commit -m "feat: add admin panel config vars"
```

---

## Task 4: Add last_login to User model + migration

**Files:**
- Modify: `backend/app/db/models/user.py`
- Create: `backend/migrations/versions/<hash>_add_last_login_to_users.py` (auto-generated)

- [ ] **Step 1: Add last_login field to User model**

Replace `backend/app/db/models/user.py` with:

```python
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, RoleEnum, TimestampMixin

if TYPE_CHECKING:
    from app.db.models.api_key import APIKey
    from app.db.models.user_config import UserConfig


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[RoleEnum] = mapped_column(default=RoleEnum.manager, nullable=False)
    last_login: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Relationships
    config: Mapped["UserConfig"] = relationship(
        "UserConfig", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    api_keys: Mapped[list["APIKey"]] = relationship(
        "APIKey", back_populates="user", cascade="all, delete-orphan"
    )
```

- [ ] **Step 2: Generate migration**

```bash
cd backend
uv run alembic revision --autogenerate -m "add_last_login_to_users"
```

Expected: New file at `backend/migrations/versions/<hash>_add_last_login_to_users.py`

- [ ] **Step 3: Review the generated migration**

Open the generated file and verify the `upgrade` and `downgrade` match:

```python
def upgrade() -> None:
    op.add_column('users', sa.Column('last_login', sa.DateTime(), nullable=True))

def downgrade() -> None:
    op.drop_column('users', 'last_login')
```

- [ ] **Step 4: Apply migration**

```bash
cd backend
uv run alembic upgrade head
```

Expected output includes: `Running upgrade ... -> <hash>, add_last_login_to_users`

- [ ] **Step 5: Apply to test DB**

```bash
cd backend
uv run alembic -x sqlalchemy.url="$TEST_DATABASE_URL_AS_SYNC" upgrade head
```

Or run tests once — `conftest.py` runs `alembic upgrade head` on the test DB automatically at session start.

- [ ] **Step 6: Commit**

```bash
git add backend/app/db/models/user.py backend/migrations/
git commit -m "feat: add last_login column to users table"
```

---

## Task 5: Update login service to record last_login

**Files:**
- Modify: `backend/app/api/services/auth_service.py`
- Modify: `backend/tests/test_api_auth.py`

- [ ] **Step 1: Write the failing test**

Add to the end of `backend/tests/test_api_auth.py`. The file already has `import uuid` and `import pytest`; add these imports at the top if missing:

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import User
```

Then add the test:

```python
async def test_login_sets_last_login(api_client: AsyncClient, api_db: AsyncSession):
    email = f"lastlogin_{uuid.uuid4().hex[:8]}@example.com"
    await api_client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Test", "password": "password123"},
    )

    user = await api_db.scalar(select(User).where(User.email == email))
    assert user.last_login is None

    await api_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "password123"},
    )

    await api_db.refresh(user)
    assert user.last_login is not None
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend
uv run pytest tests/test_api_auth.py::test_login_sets_last_login -v
```

Expected: `FAILED` — `AssertionError: assert None is not None`

- [ ] **Step 3: Update auth_service.login to stamp last_login**

In `backend/app/api/services/auth_service.py`, replace the `login` function:

```python
async def login(email: str, password: str, db: AsyncSession) -> dict:
    """Authenticate user and return tokens."""
    from datetime import UTC, datetime

    stmt = select(User).where(User.email == email)
    user = await db.scalar(stmt)

    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user.last_login = datetime.now(UTC).replace(tzinfo=None)
    await db.commit()

    access_token = create_access_token(user.id, user.role)
    refresh_token = create_refresh_token(user.id)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd backend
uv run pytest tests/test_api_auth.py::test_login_sets_last_login -v
```

Expected: `PASSED`

- [ ] **Step 5: Run full auth test suite**

```bash
cd backend
uv run pytest tests/test_api_auth.py -v
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/services/auth_service.py backend/tests/test_api_auth.py
git commit -m "feat: stamp last_login on successful login"
```

---

## Task 6: Admin services module

**Files:**
- Create: `backend/app/admin/__init__.py`
- Create: `backend/app/admin/services.py`
- Create: `backend/tests/test_admin.py` (service tests)

- [ ] **Step 1: Create `backend/app/admin/__init__.py`**

Create an empty file at `backend/app/admin/__init__.py`.

- [ ] **Step 2: Write failing tests for admin services**

Create `backend/tests/test_admin.py`:

```python
import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.services import get_totals, get_weekly_trends
from app.db.models import User


async def test_get_totals_returns_counts(db: AsyncSession):
    user = User(
        email=f"admin_svc_{uuid.uuid4().hex[:8]}@example.com",
        name="Admin Test",
        password_hash="x",
        last_login=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add(user)
    await db.flush()

    totals = await get_totals(db)

    assert totals["users"] >= 1
    assert isinstance(totals["projects"], int)
    assert isinstance(totals["stories"], int)
    assert isinstance(totals["tasks"], int)
    assert totals["last_login"] is not None


async def test_get_weekly_trends_returns_52_weeks(db: AsyncSession):
    trends = await get_weekly_trends(db)

    assert set(trends.keys()) == {"users", "projects", "stories", "tasks"}
    assert len(trends["users"]) == 52
    assert all("week" in point and "count" in point for point in trends["users"])
    assert all(isinstance(point["count"], int) for point in trends["users"])
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd backend
uv run pytest tests/test_admin.py -v
```

Expected: `ERROR` — `ModuleNotFoundError: No module named 'app.admin.services'`

- [ ] **Step 4: Implement admin services**

Create `backend/app/admin/services.py`:

```python
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Project, Story, Task, User


async def get_totals(db: AsyncSession) -> dict:
    users = await db.scalar(select(func.count()).select_from(User))
    projects = await db.scalar(select(func.count()).select_from(Project))
    stories = await db.scalar(select(func.count()).select_from(Story))
    tasks = await db.scalar(select(func.count()).select_from(Task))
    last_login = await db.scalar(select(func.max(User.last_login)))

    return {
        "users": users or 0,
        "projects": projects or 0,
        "stories": stories or 0,
        "tasks": tasks or 0,
        "last_login": last_login,
    }


async def get_weekly_trends(db: AsyncSession) -> dict[str, list[dict]]:
    result = {}
    for table_name in ("users", "projects", "stories", "tasks"):
        rows = await db.execute(
            text(
                f"""
                WITH weeks AS (
                    SELECT generate_series(
                        date_trunc('week', NOW()) - '51 weeks'::interval,
                        date_trunc('week', NOW()),
                        '1 week'::interval
                    ) AS week
                )
                SELECT
                    w.week,
                    COALESCE(COUNT(t.created_at), 0) AS count
                FROM weeks w
                LEFT JOIN {table_name} t
                    ON date_trunc('week', t.created_at) = w.week
                GROUP BY w.week
                ORDER BY w.week
                """
            )
        )
        result[table_name] = [
            {"week": row.week.strftime("%Y-%m-%d"), "count": int(row.count)}
            for row in rows
        ]

    return result
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend
uv run pytest tests/test_admin.py::test_get_totals_returns_counts tests/test_admin.py::test_get_weekly_trends_returns_52_weeks -v
```

Expected: Both `PASSED`

- [ ] **Step 6: Commit**

```bash
git add backend/app/admin/__init__.py backend/app/admin/services.py backend/tests/test_admin.py
git commit -m "feat: add admin analytics services"
```

---

## Task 7: Admin auth helper

**Files:**
- Create: `backend/app/admin/auth.py`

- [ ] **Step 1: Create auth helper**

Create `backend/app/admin/auth.py`:

```python
from starlette.requests import Request

from app.core.config import settings


def verify_admin_credentials(username: str, password: str) -> bool:
    return username == settings.ADMIN_USERNAME and password == settings.ADMIN_PASSWORD


def is_admin_session(request: Request) -> bool:
    return bool(request.session.get("admin"))
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/admin/auth.py
git commit -m "feat: add admin auth helpers"
```

---

## Task 8: Jinja2 templates

**Files:**
- Create: `backend/app/admin/templates/layout.html`
- Create: `backend/app/admin/templates/login.html`
- Create: `backend/app/admin/templates/dashboard.html`

- [ ] **Step 1: Create layout template**

Create `backend/app/admin/templates/layout.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{% block title %}Admin{% endblock %} — simple-project-tool</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f5f5f5; color: #222; min-height: 100vh; }
    nav { background: #1a1a2e; color: #fff; display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 2rem; }
    .brand { font-weight: 700; font-size: 1rem; letter-spacing: 0.05em; }
    .brand span { color: #a78bfa; }
    nav form button { background: transparent; border: 1px solid rgba(255,255,255,0.3); color: #fff; padding: 0.3rem 0.8rem; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
    nav form button:hover { background: rgba(255,255,255,0.1); }
    main { max-width: 1200px; margin: 2rem auto; padding: 0 1.5rem; }
    h1 { font-size: 1.4rem; font-weight: 600; margin-bottom: 1.5rem; color: #1a1a2e; }
  </style>
  {% block head %}{% endblock %}
</head>
<body>
  <nav>
    <span class="brand">simple-project-tool <span>Admin</span></span>
    {% if logged_in %}
    <form method="post" action="/admin/logout">
      <button type="submit">Log out</button>
    </form>
    {% endif %}
  </nav>
  <main>
    {% block content %}{% endblock %}
  </main>
</body>
</html>
```

- [ ] **Step 2: Create login template**

Create `backend/app/admin/templates/login.html`:

```html
{% extends "layout.html" %}
{% block title %}Login{% endblock %}

{% block head %}
<style>
  .login-wrap { display: flex; justify-content: center; align-items: center; min-height: 60vh; }
  .login-box { background: #fff; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); padding: 2.5rem 2rem; width: 100%; max-width: 360px; }
  .login-box h2 { font-size: 1.2rem; margin-bottom: 1.5rem; color: #1a1a2e; }
  label { display: block; font-size: 0.85rem; font-weight: 500; margin-bottom: 0.3rem; color: #555; }
  input { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.95rem; margin-bottom: 1rem; }
  input:focus { outline: 2px solid #a78bfa; border-color: transparent; }
  .btn { width: 100%; padding: 0.6rem; background: #1a1a2e; color: #fff; border: none; border-radius: 4px; font-size: 1rem; cursor: pointer; }
  .btn:hover { background: #2d2d5e; }
  .error { color: #dc2626; font-size: 0.85rem; margin-bottom: 0.75rem; }
</style>
{% endblock %}

{% block content %}
<div class="login-wrap">
  <div class="login-box">
    <h2>Admin login</h2>
    {% if error %}
    <p class="error">{{ error }}</p>
    {% endif %}
    <form method="post" action="/admin/login">
      <label for="username">Username</label>
      <input id="username" name="username" type="text" autocomplete="username" required>
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      <button class="btn" type="submit">Log in</button>
    </form>
  </div>
</div>
{% endblock %}
```

- [ ] **Step 3: Create dashboard template**

Create `backend/app/admin/templates/dashboard.html`:

```html
{% extends "layout.html" %}
{% block title %}Dashboard{% endblock %}

{% block head %}
<style>
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
  .card { background: #fff; border-radius: 8px; padding: 1.25rem 1.5rem; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
  .card .label { font-size: 0.8rem; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.3rem; }
  .card .value { font-size: 2rem; font-weight: 700; color: #1a1a2e; }
  .last-login { font-size: 0.9rem; color: #555; margin-bottom: 2rem; }
  .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
  .chart-box { background: #fff; border-radius: 8px; padding: 1.25rem; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
  .chart-box h3 { font-size: 0.9rem; font-weight: 600; color: #555; margin-bottom: 1rem; }
  @media (max-width: 700px) { .charts { grid-template-columns: 1fr; } }
</style>
{% endblock %}

{% block content %}
<h1>Dashboard</h1>

<div class="cards">
  <div class="card"><div class="label">Users</div><div class="value">{{ totals.users }}</div></div>
  <div class="card"><div class="label">Projects</div><div class="value">{{ totals.projects }}</div></div>
  <div class="card"><div class="label">Stories</div><div class="value">{{ totals.stories }}</div></div>
  <div class="card"><div class="label">Tasks</div><div class="value">{{ totals.tasks }}</div></div>
</div>

<p class="last-login">
  {% if totals.last_login %}
    Last login: {{ totals.last_login.strftime('%Y-%m-%d %H:%M') }} UTC
  {% else %}
    Last login: no logins recorded yet
  {% endif %}
</p>

<div class="charts">
  <div class="chart-box"><h3>New users / week</h3><canvas id="chart-users"></canvas></div>
  <div class="chart-box"><h3>New projects / week</h3><canvas id="chart-projects"></canvas></div>
  <div class="chart-box"><h3>New stories / week</h3><canvas id="chart-stories"></canvas></div>
  <div class="chart-box"><h3>New tasks / week</h3><canvas id="chart-tasks"></canvas></div>
</div>

<script>
  const trends = {{ trends | tojson }};
  const COLOR = 'rgba(167, 139, 250, 0.7)';

  function makeChart(id, data) {
    new Chart(document.getElementById(id), {
      type: 'bar',
      data: {
        labels: data.map(d => d.week),
        datasets: [{ data: data.map(d => d.count), backgroundColor: COLOR, borderRadius: 3 }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxTicksLimit: 12, maxRotation: 45 } },
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });
  }

  makeChart('chart-users', trends.users);
  makeChart('chart-projects', trends.projects);
  makeChart('chart-stories', trends.stories);
  makeChart('chart-tasks', trends.tasks);
</script>
{% endblock %}
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/admin/templates/
git commit -m "feat: add admin panel Jinja2 templates"
```

---

## Task 9: Admin router

**Files:**
- Create: `backend/app/admin/router.py`

- [ ] **Step 1: Create admin router**

Create `backend/app/admin/router.py`:

```python
from pathlib import Path

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.auth import is_admin_session, verify_admin_credentials
from app.admin.services import get_totals, get_weekly_trends
from app.db.database import get_db

router = APIRouter()
templates = Jinja2Templates(directory=Path(__file__).parent / "templates")


@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    if is_admin_session(request):
        return RedirectResponse(url="/admin", status_code=302)
    return templates.TemplateResponse(request, "login.html", {"logged_in": False, "error": None})


@router.post("/login")
async def login_submit(
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
):
    if verify_admin_credentials(username, password):
        request.session["admin"] = True
        return RedirectResponse(url="/admin", status_code=302)
    return templates.TemplateResponse(
        request, "login.html", {"logged_in": False, "error": "Invalid credentials"}, status_code=401
    )


@router.get("/", response_class=HTMLResponse)
async def dashboard(request: Request, db: AsyncSession = Depends(get_db)):
    if not is_admin_session(request):
        return RedirectResponse(url="/admin/login", status_code=302)
    totals = await get_totals(db)
    trends = await get_weekly_trends(db)
    return templates.TemplateResponse(
        request, "dashboard.html", {"logged_in": True, "totals": totals, "trends": trends}
    )


@router.post("/logout")
async def logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="/admin/login", status_code=302)
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/admin/router.py
git commit -m "feat: add admin router (login/dashboard/logout)"
```

---

## Task 10: Wire up in main app + integration tests

**Files:**
- Modify: `backend/app/api/main.py`
- Modify: `backend/tests/test_admin.py`

- [ ] **Step 1: Write failing integration tests**

Add to `backend/tests/test_admin.py` (append after the existing service tests). Add `from app.core.config import settings` and `from httpx import AsyncClient` to the imports at the top if not already present:

```python
from app.core.config import settings
from httpx import AsyncClient
```

Then append:

```python
async def test_admin_unauthenticated_redirects(api_client: AsyncClient):
    resp = await api_client.get("/admin", follow_redirects=False)
    assert resp.status_code == 302
    assert "/admin/login" in resp.headers["location"]


async def test_admin_login_page_ok(api_client: AsyncClient):
    resp = await api_client.get("/admin/login")
    assert resp.status_code == 200
    assert b"Admin login" in resp.content


async def test_admin_login_wrong_credentials(api_client: AsyncClient):
    resp = await api_client.post(
        "/admin/login", data={"username": "wrong", "password": "wrong"}
    )
    assert resp.status_code == 401
    assert b"Invalid credentials" in resp.content


async def test_admin_login_success_redirects(api_client: AsyncClient):
    resp = await api_client.post(
        "/admin/login",
        data={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_PASSWORD},
        follow_redirects=False,
    )
    assert resp.status_code == 302
    assert resp.headers["location"] == "/admin"


async def test_admin_dashboard_after_login(api_client: AsyncClient):
    await api_client.post(
        "/admin/login",
        data={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_PASSWORD},
    )
    resp = await api_client.get("/admin")
    assert resp.status_code == 200
    assert b"Dashboard" in resp.content


async def test_admin_logout_clears_session(api_client: AsyncClient):
    await api_client.post(
        "/admin/login",
        data={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_PASSWORD},
    )
    await api_client.post("/admin/logout", follow_redirects=False)
    resp = await api_client.get("/admin", follow_redirects=False)
    assert resp.status_code == 302
    assert "/admin/login" in resp.headers["location"]
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
uv run pytest tests/test_admin.py -k "admin_unauthenticated or admin_login_page_ok" -v
```

Expected: `FAILED` — `assert 404 == 302` (admin routes not registered yet)

- [ ] **Step 3: Update main.py — add imports**

In `backend/app/api/main.py`, add to the import block:

```python
from starlette.middleware.sessions import SessionMiddleware

from app.admin.router import router as admin_router
```

Full updated imports section of `backend/app/api/main.py`:

```python
import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.sessions import SessionMiddleware

from app.admin.router import router as admin_router
from app.api.routes import (
    auth,
    comments,
    config,
    invitations,
    projects,
    recent,
    search,
    stories,
    tasks,
    time_tracking,
)
from app.api.routes.project_statuses import router as project_statuses_router
from app.api.routes.sprints import router as sprints_router
from app.core.config import settings
from app.db.database import engine
```

- [ ] **Step 4: Update main.py — add SessionMiddleware before CORSMiddleware**

Replace the middleware block in `backend/app/api/main.py` (SessionMiddleware added first so CORS remains the outermost layer in Starlette's LIFO stack):

```python
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.ADMIN_SECRET,
    https_only=False,
    same_site="lax",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

- [ ] **Step 5: Update main.py — register admin router**

At the bottom of `backend/app/api/main.py`, after the existing `include_router` calls, add:

```python
app.include_router(admin_router, prefix="/admin")
```

- [ ] **Step 6: Run integration tests**

```bash
cd backend
uv run pytest tests/test_admin.py -v
```

Expected: All 8 tests pass.

- [ ] **Step 7: Run full test suite**

```bash
cd backend
uv run pytest -v
```

Expected: All tests pass — no regressions.

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/main.py backend/tests/test_admin.py
git commit -m "feat: wire up admin panel — SessionMiddleware + router"
```

---

## Task 11: Lint and end-to-end smoke test

- [ ] **Step 1: Lint**

```bash
cd backend
uv run ruff check . && uv run ruff format --check .
```

Fix any issues (`uv run ruff format .` to auto-format), then re-run until clean.

- [ ] **Step 2: Start the server**

```bash
cd backend
uv run python -m app.main
```

Expected: Server starts on `http://localhost:8000`

- [ ] **Step 3: Verify unauthenticated redirect**

Open `http://localhost:8000/admin` in a browser. Should redirect to `/admin/login`.

- [ ] **Step 4: Log in**

Enter the `ADMIN_USERNAME` and `ADMIN_PASSWORD` from `.env`. Should redirect to `/admin`.

- [ ] **Step 5: Verify dashboard content**

Dashboard should show:
- 4 stat cards with integer counts
- "Last login: ..." line
- 4 Chart.js bar charts loading from CDN

- [ ] **Step 6: Log out**

Click "Log out". Should redirect to `/admin/login`.

- [ ] **Step 7: Verify session cleared**

Navigate to `http://localhost:8000/admin`. Should redirect to `/admin/login`.

- [ ] **Step 8: Commit lint fixes if any**

```bash
git add -A
git commit -m "style: lint fixes for admin panel"
```
