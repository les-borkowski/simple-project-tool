# Architecture Overview

**simple-project-tool** is a minimalist project management application with an API-first architecture. It supports web UI, CLI, and AI agent access via API keys.

## Project Purpose & Features

A three-level work hierarchy (Project → Story → Task) with:
- Status tracking: `to_do`, `in_progress`, `in_review`, `in_testing`, `done`
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

The codebase follows **four clearly separated layers**, each with distinct responsibilities:

### 1. Database Layer — `backend/app/db/`

Schema, ORM models, migrations. No business logic.

- **models/** — SQLAlchemy ORM definitions
  - `user.py` — Users, roles, API keys
  - `project.py` — Projects, members, metadata
  - `story.py` — Stories (medium-level work items)
  - `task.py` — Tasks (smallest work items; optional story binding; direct project binding)
  - `comment.py` — Comments on projects, stories, tasks
  - `status_history.py` — Immutable append-only status changes
  - `invitation.py` — Project member invitations
  - `user_config.py` — User preferences (theme, locale, etc.)
  - `project_member.py` — Project membership + per-project roles
  - `api_key.py` — API keys with scopes

- **migrations/** — Alembic version control (one reversible migration per schema change)
- **database.py** — Connection pooling, session management
- **base.py** — Base model, enums (Status, Priority), mixins (TimestampMixin)

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

## Data Model

### Three-Level Hierarchy

```
Project
├── Story (optional, medium-level work)
│   └── Task (smallest unit)
└── Task (direct, no story binding)
```

Each level has:
- **Status** (enum): `to_do`, `in_progress`, `in_review`, `in_testing`, `done`
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
  story_id UUID FK → stories (NULLABLE)
  title VARCHAR(500) NOT NULL
  description TEXT NULLABLE
  status StatusEnum (DEFAULT 'to_do')
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

Tasks can exist **with or without a story**:
- **With story**: `story_id` set, task is nested under story, shown in story detail view → URL `/stories/:storyId/tasks/:taskId`
- **Without story** (project-level): `story_id` IS NULL, task is directly under project, shown on board → URL `/projects/:projectId/tasks/:taskId`

> **Decision:** project-level tasks get their own frontend route rather than being assigned to a phantom "backlog" story. The backend `GET /tasks/{id}` already requires no `story_id`; `TaskDetailPage` already handles the null case. A default-story approach was rejected because it pollutes story lists and obscures the data model.

### Key Patterns

**Status History Tracking** — Immutable append-only table. Records every status change with timestamp, actor, and from/to values.

```sql
status_history:
  id UUID PK
  project_id UUID FK (NULLABLE)
  story_id UUID FK (NULLABLE)
  task_id UUID FK (NULLABLE)
  from_status StatusEnum (NULLABLE)
  to_status StatusEnum
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
- **API Key Scopes**: `read:projects`, `write:projects`, `read:stories`, `write:stories`, `read:tasks`, `write:tasks`, `read:comments`, `write:comments`, `admin`

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
