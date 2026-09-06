# Architecture Overview

**simple-project-tool** is a minimalist project management application with an API-first architecture. It supports web UI, CLI, and AI agent access via API keys.

## Project Purpose & Features

A three-level work hierarchy (Project → Story → Task) with:
- Status tracking: each project owns its own ordered status set (stored in the `project_statuses` table); new projects are seeded with `to_do`, `in_progress`, `in_review`, `done`
- Priority levels: `low`, `medium`, `high`
- Role-based access control: Manager (create/delete/manage) vs Contributor (view/update status/comment)
- Global + per-project role overrides
- Comments on any item
- Status history with elapsed-time tracking
- Project member management with invitations
- API key support for integrations and AI agents
- Full REST API with OpenAPI documentation
- CLI tool for terminal workflows

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Python 3.11+ · FastAPI · SQLAlchemy ORM · PostgreSQL · Alembic |
| **Frontend** | React 19 · TypeScript · Vite · Tailwind CSS |
| **CLI** | Typer (Click-based) |
| **Auth** | PyJWT (tokens) · bcrypt (password hashing) |
| **i18n** | i18next (en-GB · pl) |
| **Testing** | pytest · pytest-asyncio |
| **Linting** | ruff (check + format) |
| **Package Mgr** | uv (Python) · npm (Node) |

## Architecture Layers

The codebase follows **clearly separated layers**, each with distinct responsibilities:

### 1. Database Layer — `backend/app/db/`

Schema, ORM models, migrations. No business logic.

- **models/** — SQLAlchemy ORM definitions
  - `user.py` — Users, roles, API keys
  - `project.py` — Projects, members, metadata
  - `story.py` — Stories (medium-level work items)
  - `task.py` — Tasks (smallest work items; always bound to a story — project-level tasks use the project's default Backlog story)
  - `project_status.py` — Per-project status definitions (slug, name, colour, order)
  - `comment.py` — Comments on projects, stories, tasks
  - `status_history.py` — Immutable append-only status changes
  - `invitation.py` — Project member invitations
  - `user_config.py` — User preferences (theme, locale, etc.)
  - `project_member.py` — Project membership + per-project roles
  - `api_key.py` — API keys with scopes

- **migrations/** — Alembic version control (one reversible migration per schema change)
- **database.py** — Connection pooling, session management
- **base.py** — Base model, enums (Priority, Role, Theme, Locale, InvitationStatus), mixins (TimestampMixin). Task/story status is a free string slug, not an enum — see `project_status.py`.

### 2. Authentication Layer — `backend/app/auth/`

User auth, permissions, credential management. Decoupled from API routes.

- **security.py** — JWT generation/validation (PyJWT), password hashing (bcrypt)
- **permissions.py** — RBAC logic (role checking, permission inference)
  - Role precedence: per-project role > global role
  - Project owner always has Manager access
  - Permission checks: `require_project_access()`, `require_manager()`
- **dependencies.py** — FastAPI `Depends()` for token extraction, validation, API key auth

**Key Pattern:** Authentication is **not** tied to specific endpoints. The auth layer is reusable and tested independently. Routes use `Depends()` to inject authenticated users.

### 3. API Layer — `backend/app/api/`

HTTP request/response handling, business logic orchestration.

- **routes/** — FastAPI endpoints
  - `/api/v1/auth/` — Login, register, token refresh
  - `/api/v1/users/` — User profile, settings
  - `/api/v1/projects/` — Project CRUD, members, invitations
  - `/api/v1/stories/` — Story CRUD
  - `/api/v1/tasks/` — Task CRUD (under stories OR directly under projects)
  - `/api/v1/comments/` — Comments on projects, stories, tasks
  - All routes return OpenAPI-documented responses

- **services/** — Business logic (create, update, delete workflows)
  - Enforce permissions via auth layer
  - Query the database via ORM
  - Return responses to routes (no HTTP details)

- **schemas/** — Pydantic request/response models
  - Type safety, validation, serialization
  - Separate `Create`, `Update`, `Response` schemas per entity

**Critical Pattern:** Routes handle HTTP only. They call services. Services call auth and DB. Routes do **not** query the DB directly.

### 4. UI Layer — `frontend/src/`

React frontend. Communicates only via REST API (no direct DB access).

- **pages/** — Full-page views
  - `ProjectsPage.tsx` — Project list, create
  - `ProjectDetailPage.tsx` — Project board (Kanban by status), stories, members
  - `StoryDetailPage.tsx` — Story detail, comments, tasks list
  - `TaskDetailPage.tsx` — Task detail, status/priority/assignee, comments
  - `SettingsPage.tsx` — User profile, API keys, preferences
  - `InvitationsPage.tsx` — Pending project invitations

- **components/** — Reusable UI components
  - `common/` — StatusPill, PriorityBars, Avatar, ConfirmDialog, MarkdownEditor, etc.
  - `comments/` — CommentList, CommentForm
  - `status-history/` — StatusHistoryTimeline

- **hooks/** — Custom React hooks
  - `useProjects()` — Fetch projects with pagination
  - `useStories()` — Fetch stories with filtering
  - `useTasks()` — Fetch tasks with filtering
  - `useRole()` — Check user role in project

- **services/api.ts** — HTTP client wrapper
  - Axios configured with base URL, error handling
  - Type-safe API methods
  - `projectsApi`, `storiesApi`, `tasksApi`, `commentsApi`, etc.

- **context/** — Global state
  - `AuthContext` — Current user, token, login/logout
  - `ThemeContext` — Dark mode, accent color, density settings
  - `ToastContext` — Notification queue

- **locales/** — i18n message files
  - `en-GB.json` — English
  - `pl.json` — Polish

### 5. LLM / Task-Capture Layer — `backend/app/core/llm/` + `backend/app/api/services/capture*.py`

Backs the natural-language task capture feature: turning a free-text sentence into structured task candidates.

- **`app/core/llm/`** — provider-agnostic LLM access
  - `base.py` defines the `LLMClient` Protocol (`complete(system, user, json_schema, max_tokens, temperature, api_key=None, model=None) -> LLMResponse`); `api_key`/`model` let a call override the server-configured credential/model, backing per-user resolution
  - `GeminiClient` — real HTTP calls to Google's Gemini API. Raw `httpx`, no vendor SDK, matching the existing pattern in `app/core/email.py`. Uses constrained decoding: the response schema is passed as Gemini's `responseSchema` generation-config field so the model is forced to return matching JSON
  - `ReplayClient` — fixture-based, offline; reads from `backend/evals/fixtures/responses/`. Used by tests and by the eval harness's default (`replay`) mode
  - `providers.py` — the declarative `ProviderSpec`/`PROVIDERS` catalogue (`id`, `label`, `default_model`, `available`, `key_hint`, `docs_url`, `default_rpm`, `default_tpm`). `google` is `available=True`; `anthropic`/`openai` are declared (visible in the catalogue) but `available=False` — deliberately no stub adapter classes for either, since dead code that must be maintained buys nothing
  - `__init__.py`'s `_ADAPTERS` dict maps a provider id to its adapter factory; `get_llm_client()` (resolves the server-configured `LLM_PROVIDER`) and `get_llm_client_for(provider_id)` (per-user resolution) both resolve through this one registry

- **`app/api/services/capture_service.py`** — pure extraction logic: builds the prompt, calls the LLM client, validates/repairs the response JSON against a Pydantic schema (`ExtractionResult`). Deliberately has no database access — its own docstring states this, and `backend/tests/test_capture_service.py::test_no_asyncsession_import` scans the module's source to assert `AsyncSession` never appears in it.

- **`app/api/services/capture_resolution_service.py`** — the DB-touching layer built on top: resolves the LLM's assignee/story name hints against actual project members and stories, assembles the preview response, and performs the all-or-nothing confirm-and-create.

- **`app/api/services/llm_credential_service.py`** — per-user credential CRUD (`list_providers`/`upsert_provider`/`delete_provider`/`resolve_credential`), backing the `/config/llm-providers*` routes. The raw API key is Fernet-encrypted at rest (`app/core/crypto.py`) and never appears in any API response — only an `api_key_hint` (last 4 chars).

- **`app/api/services/llm_usage_service.py`** — Postgres-backed rolling 60-second RPM/TPM (requests/tokens per minute) rate limiting (`check_rate_limit`/`record_usage`/`prune_usage_events`), enforced per user+provider, deliberately not in-process (the deployment runs multiple workers).

The split exists so extraction can be tested and evaluated in complete isolation from the database: the eval harness (`app/evals/run.py`) runs `capture_service.extract()` directly against fixtures with no DB, no auth, and no running server, and a passing test suite is proof the boundary hasn't eroded.

#### Adding an LLM provider

No database migration is required — `user_llm_providers.provider` is a plain string column (not a DB enum), validated against the `PROVIDERS` registry at the service layer, specifically so this stays a code-only change. Three touch points:

1. A new adapter module in `app/core/llm/` implementing the `LLMClient` Protocol's `complete()` signature (see `gemini_client.py` for the shape).
2. One entry in the `_ADAPTERS` dict (`app/core/llm/__init__.py`) mapping the provider id to that adapter's factory.
3. One entry in the `PROVIDERS` dict (`app/core/llm/providers.py`), a `ProviderSpec` with `available=True`.

### 6. MCP Server Layer — `backend/app/mcp/`

Exposes the REST API as an MCP (Model Context Protocol) server (`spt-mcp` console script) so an LLM host can call the tool directly.

- **`config.py`** — `MCPConfig.load()` reads `SPT_API_URL`, `SPT_API_KEY` (required), `SPT_LOCALE`, `SPT_TIMEOUT_SECONDS` from the environment
- **`client.py`** — `SPTClient`, an async `httpx` wrapper that sends `X-API-Key` and paginates cursor responses via `fetch_all()`
- **`server.py`** — the FastMCP app and its 13 `@mcp.tool()` functions (`whoami`, `list_projects`, `get_project`, `list_stories`, `list_tasks`, `get_task`, `search`, `update_task`, `add_comment`, `create_task`, `create_story`, `capture_tasks`, `confirm_capture`) — no delete or member-management tools by design
- **`errors.py`** — maps a failed REST call into a clean MCP tool error instead of a fake success result

**Key pattern:** this layer imports no services, models, or DB session — it only speaks HTTP to the same API layer everything else uses. That's deliberate: every existing permission check (`require_project_access`, `require_manager`, `require_scope`, per-project RBAC) still runs on every MCP tool call, because the call is a normal HTTP request. The tool list enforces nothing by itself; the API key's scopes are the actual security boundary. A read-only agent is a differently-scoped API key, not a different server build.

> **Dependency note:** the `mcp` package is pinned `>=1.2,<2` in `backend/pyproject.toml`. `mcp` 2.x replaces `FastMCP` with an incompatible `MCPServer` API — do not relax this pin without rewriting `server.py`.

## Data Model

### Three-Level Hierarchy

```
Project
└── Story (medium-level work; every project has a default "Backlog" story)
    └── Task (smallest unit; project-level tasks live in the Backlog story)
```

Each level has:
- **Status**: a string slug (`VARCHAR(100)`), not an enum. Valid values come from the owning project's `project_statuses` rows and are checked by `validate_status_slug` (HTTP 422 on an unknown slug). New projects are seeded with `to_do`, `in_progress`, `in_review`, `done`; managers can add, rename, recolour, or reorder them.
- **Priority** (enum): `low`, `medium`, `high`
- **Timestamps**: `created_at`, `updated_at`
- **Author tracking**: `created_by`, `updated_by`
- **Comments**: append-only, stored in `comments` table
- **Status history**: immutable, stored in `status_history` table

### Task Model Details

```sql
tasks:
  id UUID PK
  project_id UUID FK → projects (NOT NULL)
  story_id UUID FK → stories (NULLABLE in schema, but always set in practice — see below)
  title VARCHAR(500) NOT NULL
  description TEXT NULLABLE
  status VARCHAR(100) NOT NULL (DEFAULT 'to_do'; slug validated against project_statuses)
  priority PriorityEnum (DEFAULT 'medium')
  assignee_id UUID FK → users (NULLABLE)
  created_by UUID FK → users (NOT NULL)
  updated_by UUID FK → users (NULLABLE)
  created_at TIMESTAMP
  updated_at TIMESTAMP

  Indexes:
  - (project_id, status) — for board view filtering
  - (assignee_id) — for filtering by assignee
```

Every task belongs to a story. There are two ways a task is created:
- **Under an explicit story**: `story_id` is that story; shown in the story detail view → URL `/stories/:storyId/tasks/:taskId`
- **Under a project** (project-level task): `create_task_for_project()` calls `get_default_story()` and assigns the project's default "Backlog" story (`Story.is_default = True`); shown on the board → URL `/projects/:projectId/tasks/:taskId`

The `story_id` column is nullable in the schema, but the service layer always sets it. Every project has exactly one default Backlog story; `get_default_story()` raises HTTP 500 if one is missing.

> **Decision:** project-level tasks keep their own frontend route (`/projects/:projectId/tasks/:taskId`) so the board can address them without a story in the URL. Backend `GET /tasks/{id}` needs no `story_id`. Data-model-wise they still hang off the default Backlog story rather than being storyless.

### Key Patterns

**Status History Tracking** — Immutable append-only table. Records every status change with timestamp, actor, and from/to values.

```sql
status_history:
  id UUID PK
  project_id UUID FK (NULLABLE)
  story_id UUID FK (NULLABLE)
  task_id UUID FK (NULLABLE)
  from_status VARCHAR(100) (NULLABLE)   -- status slug, not an enum
  to_status VARCHAR(100) NOT NULL       -- status slug, not an enum
  changed_by UUID FK → users
  created_at TIMESTAMP
  
  Constraint: CHECK(num_nonnulls(project_id, story_id, task_id) = 1)
```

Enables:
- Time tracking: elapsed time in each status
- Audit trail: who changed what when
- Reporting: status change patterns

**Comment FK Pattern** — Similar to status history, uses `(project_id, story_id, task_id)` with CHECK constraint instead of polymorphic `item_type + item_id`. Enforces referential integrity at DB level.

## REST API Structure

All routes prefixed with `/api/v1/`.

### Authentication Endpoints

```
POST   /auth/register           — Create account
POST   /auth/login              — Get JWT token
POST   /auth/refresh            — Refresh expired token
POST   /auth/logout             — Invalidate token
```

### Project Endpoints

```
GET    /projects                — List projects (cursor-paginated)
POST   /projects                — Create project (manager only)
GET    /projects/{id}           — Get project detail
PATCH  /projects/{id}           — Update project (manager only)
DELETE /projects/{id}           — Delete project (manager only)

GET    /projects/{id}/members   — List project members
POST   /projects/{id}/members   — Add member (manager only)
PATCH  /projects/{id}/members/{user_id}  — Change role (manager only)
DELETE /projects/{id}/members/{user_id}  — Remove member (manager only)

GET    /projects/{id}/invitations    — List pending invites
POST   /projects/{id}/invitations    — Send invite (manager only)
DELETE /invitations/{id}             — Cancel invite (manager only)
POST   /invitations/{id}/accept      — Accept invite
POST   /invitations/{id}/decline     — Decline invite

GET    /projects/{id}/stories   — List stories
POST   /projects/{id}/stories   — Create story (manager only)

GET    /projects/{id}/tasks     — List project-level tasks
POST   /projects/{id}/tasks     — Create project-level task (manager only)
```

### Story Endpoints

```
GET    /stories/{id}            — Get story detail
PATCH  /stories/{id}            — Update story (manager only)
DELETE /stories/{id}            — Delete story (manager only)

GET    /stories/{id}/tasks      — List story's tasks
POST   /stories/{id}/tasks      — Create task (manager only)
```

### Task Endpoints

```
GET    /tasks/{id}              — Get task detail
PATCH  /tasks/{id}              — Update task (manager only)
DELETE /tasks/{id}              — Delete task (manager only)
```

### Comment Endpoints

```
GET    /projects/{id}/comments  — List project comments
POST   /projects/{id}/comments  — Add comment to project
GET    /stories/{id}/comments   — List story comments
POST   /stories/{id}/comments   — Add comment to story
GET    /tasks/{id}/comments     — List task comments
POST   /tasks/{id}/comments     — Add comment to task
PATCH  /comments/{id}           — Edit comment (author only)
DELETE /comments/{id}           — Delete comment (author only)
```

### API Conventions

- **Versioning**: `/api/v1/` prefix
- **Methods**: Standard REST (GET, POST, PATCH, DELETE; no PUT)
- **Pagination**: Cursor-based `?cursor=<id>&limit=25` (max 100)
- **Filtering**: `?status=in_progress&priority=high&q=search`
- **Error Format**: `{"error": {"code": "...", "message": "...", "details": [...]}}`
- **Authentication**: Bearer token in `Authorization: Bearer <token>` or `X-API-Key: <key>`
- **API Key Scopes**: `read:projects`, `write:projects`, `read:stories`, `write:stories`, `read:tasks`, `write:tasks`, `read:comments`, `write:comments`, `admin` (a `write:X` scope implies `read:X`). `write:projects` is defined but currently unused by any route — it's aspirational, only appearing as an example scope string in CLI help text. Actual scoped-key coverage per resource: GET only on projects (list, get, list members); GET/POST/PATCH on stories and tasks; GET/POST on comments (create and list — no PATCH, so an API key can't edit a comment, matching the MCP server's `add_comment`-only tool). Project create/update/archive/restore, all member management, deletes, admin/config endpoints, and most of `/auth` remain JWT-only (`GET /auth/me` is the exception: an API key can call it too, and the response includes the key's label and scopes)

### Documentation

Auto-generated at:
- `/docs` — Swagger UI (interactive)
- `/redoc` — ReDoc (read-only)

## Key Design Patterns

### 1. JWT Authentication

Stateless, token-based. Tokens expire; refresh endpoint provided.

- **Issue**: `/auth/login` returns `access_token` (15 min expiry) + `refresh_token` (7 day expiry)
- **Validate**: FastAPI `Depends(get_current_user)` decodes JWT, checks expiry
- **Refresh**: POST `/auth/refresh` with expired access token, get new one

### 2. Role-Based Access Control (RBAC)

Enforced at service layer. Two roles:

| Role | Scope | Permissions |
|------|-------|-------------|
| **Manager** | Per-project | Create, update, delete items; manage members; manage invitations |
| **Contributor** | Per-project | View items; update status; add comments |

**Precedence**: Per-project role > global role. Project owner always has Manager access.

Example:
```python
# Service layer
role = await resolve_role(user, project_id, db)
if role != 'manager':
    raise PermissionDenied("Only managers can delete")
```

### 3. Data Flow

```
User Input
    ↓
Frontend (React) API call
    ↓
Route (FastAPI) — HTTP
    ↓
Depends(get_current_user) — Auth check
    ↓
Service function — Business logic + permission check
    ↓
Database (SQLAlchemy) — ORM query
    ↓
Response → Frontend → UI update
```

### 4. Service Layer Pattern

Services are **business logic functions**, not classes. They:
- Accept user context
- Check permissions
- Query/modify database
- Return domain objects (ready for serialization)
- Raise `HTTPException` for errors (caught by FastAPI)

```python
async def create_task(story_id: UUID, data: TaskCreate, user: User, db: AsyncSession) -> TaskResponse:
    story = await db.get(Story, story_id)
    if not story:
        raise HTTPException(404, "Story not found")
    
    await require_project_access(user, story.project_id, db)  # Permission check
    
    task = Task(...)
    db.add(task)
    await db.commit()
    return TaskResponse.model_validate(task)
```

### 5. Migrations

All schema changes go through Alembic. Never modify models without a migration.

```bash
uv run alembic revision --autogenerate -m "add_field_to_table"
uv run alembic upgrade head
```

### 6. Status History Tracking

Every status change appends to `status_history` (immutable). Enables:
- Time tracking: "Time spent in 'in progress': 2h 15m"
- Audit trail: Who changed what when
- Reporting: Status flow patterns

### 7. Comment/StatusHistory FK Pattern

Both use `(project_id, story_id, task_id)` with `CHECK(num_nonnulls(...) = 1)` instead of `item_type + item_id`. Benefits:
- Database enforces referential integrity at the schema level
- No orphaned records (deleting a project cascades to all comments/history)
- Simpler query logic (no string matching)

## File Organization

### Backend

```
backend/
├── app/
│   ├── db/
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── project.py
│   │   │   ├── story.py
│   │   │   ├── task.py
│   │   │   ├── comment.py
│   │   │   ├── status_history.py
│   │   │   ├── invitation.py
│   │   │   ├── user_config.py
│   │   │   ├── project_member.py
│   │   │   └── api_key.py
│   │   ├── database.py
│   │   └── base.py
│   ├── auth/
│   │   ├── security.py
│   │   ├── permissions.py
│   │   └── dependencies.py
│   ├── api/
│   │   ├── schemas/
│   │   │   ├── user.py
│   │   │   ├── project.py
│   │   │   ├── story.py
│   │   │   ├── task.py
│   │   │   ├── comment.py
│   │   │   ├── api_key.py
│   │   │   └── common.py
│   │   ├── services/
│   │   │   ├── user_service.py
│   │   │   ├── project_service.py
│   │   │   ├── story_service.py
│   │   │   ├── task_service.py
│   │   │   ├── comment_service.py
│   │   │   └── api_key_service.py
│   │   ├── routes/
│   │   │   ├── auth.py
│   │   │   ├── users.py
│   │   │   ├── projects.py
│   │   │   ├── stories.py
│   │   │   ├── tasks.py
│   │   │   └── comments.py
│   │   └── main.py
│   ├── cli/
│   │   └── ... (Typer CLI mirrors API)
│   └── main.py
├── migrations/
│   └── versions/
│       ├── c393321d07db_initial_schema.py
│       └── ...
├── tests/
│   ├── conftest.py
│   ├── test_auth.py
│   ├── test_projects.py
│   ├── test_tasks.py
│   └── ...
├── pyproject.toml
├── alembic.ini
└── .env.example
```

### Frontend

```
frontend/
├── src/
│   ├── pages/
│   │   ├── ProjectsPage.tsx
│   │   ├── ProjectDetailPage.tsx
│   │   ├── StoryDetailPage.tsx
│   │   ├── TaskDetailPage.tsx
│   │   ├── SettingsPage.tsx
│   │   └── InvitationsPage.tsx
│   ├── components/
│   │   ├── common/
│   │   │   ├── StatusPill.tsx
│   │   │   ├── PriorityBars.tsx
│   │   │   ├── Avatar.tsx
│   │   │   ├── ConfirmDialog.tsx
│   │   │   ├── MarkdownEditor.tsx
│   │   │   ├── LoadMoreButton.tsx
│   │   │   └── ...
│   │   ├── comments/
│   │   └── status-history/
│   ├── hooks/
│   │   ├── useProjects.ts
│   │   ├── useStories.ts
│   │   ├── useTasks.ts
│   │   └── useRole.ts
│   ├── services/
│   │   └── api.ts
│   ├── context/
│   │   ├── AuthContext.tsx
│   │   ├── ThemeContext.tsx
│   │   └── ToastContext.tsx
│   ├── locales/
│   │   ├── en-GB.json
│   │   └── pl.json
│   ├── App.tsx
│   └── main.tsx
├── public/
├── package.json
├── vite.config.ts
├── tsconfig.json
└── tailwind.config.js
```

## Development Workflow

### Setup

```bash
# Backend
cd backend
uv sync
cp .env.example .env      # Update DB_URL, SECRET_KEY
uv run alembic upgrade head
uv run python -m app.main

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

### Common Tasks

**Modify database schema:**
```bash
cd backend
# Edit app/db/models/*.py
uv run alembic revision --autogenerate -m "description"
uv run alembic upgrade head
```

**Add new API endpoint:**
1. Add schema in `app/api/schemas/`
2. Add service function in `app/api/services/`
3. Add route in `app/api/routes/`
4. Update frontend `services/api.ts`
5. Update frontend page to call API

**Run tests:**
```bash
cd backend
uv run pytest                  # All tests
uv run pytest -k "test_task"  # Filter
uv run pytest -x              # Stop on first failure
uv run pytest --cov=app       # With coverage
```

**Code quality:**
```bash
cd backend
uv run ruff check .
uv run ruff format .
```

## Internationalization (i18n)

Frontend uses **i18next** with two languages: `en-GB` (English), `pl` (Polish).

Message files: `frontend/src/locales/*.json`

**Adding a new key:**
1. Add to both `en-GB.json` and `pl.json`
2. Use in component: `const { t } = useTranslation(); t('namespace.key')`
3. Plurals: Use `{{count}}` and `_one`, `_other` suffixes (or `_few`, `_many` for Polish)

## Deployment Considerations

- **Backend**: Async Python app (FastAPI) with async PostgreSQL driver (asyncpg)
- **Frontend**: Static SPA (React + Vite), served by any static host or reverse proxy
- **Database**: PostgreSQL 13+, Alembic handles migrations
- **Auth**: Tokens stored in browser localStorage (frontend) and memory (backend per-request)
- **CORS**: Configure based on frontend origin
- **Environment**: DB connection string, JWT secret, API base URL all via environment variables
- **Secrets**: Never commit `.env`, API keys, or secrets to version control

## Resources

- **API Reference**: Auto-generated at `http://localhost:8000/docs` (Swagger UI)
- **Database**: Schema defined in `backend/app/db/models/*.py`
- **Tests**: `backend/tests/` (pytest)
- **Requirements**: See `requirements.md` for detailed specification
