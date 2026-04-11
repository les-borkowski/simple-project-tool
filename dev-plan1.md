# Development Roadmap: Phase Implementation Order

**Version**: 1.0  
**Last Updated**: 2026-04-11  
**Project**: simple-project-tool

---

## Architecture Overview

The project is built in **five layers with clear separation of concerns**. Each layer is self-contained and depends only on the layers below it:

```
┌─────────────────────────────────────────┐
│  Frontend (React + TypeScript + Vite)   │ Phase 5
└─────────────────────────────────────────┘
              ↓ (HTTP only)
┌─────────────────────────────────────────┐
│  CLI (Typer + Rich + Babel)             │ Phase 4
└─────────────────────────────────────────┘
              ↓ (HTTP only)
┌─────────────────────────────────────────┐
│  API Layer (FastAPI + services)         │ Phase 3
├─────────────────────────────────────────┤
│  Auth Layer (JWT + permissions)         │ Phase 2
├─────────────────────────────────────────┤
│  Database Layer (SQLAlchemy + Alembic)  │ Phase 1
└─────────────────────────────────────────┘
```

**Key principle**: CLI and UI are purely HTTP clients—they never import backend code. They communicate only via the `/api/v1` REST API.

---

## Dependency Matrix

| Phase | Layer | Implements | Depends on | Implementation Plan |
|-------|-------|-----------|------------|------|
| 1 | Database | Models, migrations, session factory | Nothing | `implementation-db.md` |
| 2 | Auth | JWT, password hashing, permissions, dependencies | DB | `implementation-auth.md` |
| 3 | API | Routes, services, schemas, error handling, i18n | DB + Auth | `implementation-api.md` |
| 4 | CLI | Command groups, config, i18n, HTTP client | API running | `implementation-cli.md` |
| 5 | UI | Pages, components, routing, state, i18n | API running | `implementation-ui.md` |

---

## Phase Completion Protocol

After **every phase**, before moving to the next one:

1. **Commit all changes**
   ```bash
   git add <relevant files>
   git commit -m "phase N: <short summary>"
   ```

2. **Run the documentation-keeper agent** to update `docs/readme.md`, `docs/readme_cli.md`, and `docs/changelog.md`:
   ```bash
   claude --agent documentation-keeper
   ```

> **Note**: If you commit via a Git GUI (e.g. Fork), the documentation-keeper hook will **not** fire automatically — run the agent manually after the commit.

---

## Phase 1: Database Layer

**Duration estimate**: 1–2 days  
**Reference**: `implementation-db.md`

### Scope

- Create Python project structure (`backend/`, `app/core/`, `app/db/`)
- Set up Alembic migrations
- Implement 11 SQLAlchemy ORM models:
  - User, UserConfig, Project, ProjectMember, Story, Task, Comment, StatusHistory, Invitation, APIKey
- Define enums: Status, Priority, Role, Theme, Locale, InvitationStatus
- Create base model with TimestampMixin
- Define all indexes and constraints (CHECK constraints for Comment and StatusHistory)
- Create test fixtures (`conftest.py`)

### Key Deliverables

1. **`backend/pyproject.toml`** — Python dependencies (FastAPI, SQLAlchemy, asyncpg, psycopg2, Alembic, pytest, etc.)
2. **`backend/app/core/config.py`** — Settings from `.env` (Neon URL, local test URL, SECRET_KEY, etc.)
3. **`backend/app/db/`** — Models, base classes, database.py, Alembic migrations
4. **`backend/.env.example`** — Template with Neon URLs and test DB URL
5. **`backend/tests/conftest.py`** — Shared test fixtures

### Testing Milestone

All checks in `implementation-db.md` section 8 must pass:
- [ ] All 11 tables created in PostgreSQL with correct column types
- [ ] User.email has UNIQUE constraint
- [ ] ProjectMember composite PK enforced
- [ ] CHECK constraints on Comment and StatusHistory working
- [ ] All enums stored as strings (verified in `pg_enum`)
- [ ] All named indexes present
- [ ] `alembic downgrade -1` then `alembic upgrade head` works
- [ ] `get_db()` session closes after use (no leaks)
- [ ] Neon connection with `sslmode=require` succeeds
- [ ] Tests run against local PostgreSQL, not Neon

### Gate Criteria to Phase 2

✅ **Must be complete**:
- Database running (either Neon or local PostgreSQL)
- `backend/.env` configured with both DATABASE_URL (Neon) and TEST_DATABASE_URL (local)
- Initial Alembic migration applied: `alembic upgrade head`
- `pytest tests/` runs with fixtures, no import errors
- Can instantiate User, Project, Story, Task, Comment objects in tests
- Phase Completion Protocol followed: changes committed + `claude --agent documentation-keeper` run

---

## Phase 2: Authentication Layer

**Duration estimate**: 1–2 days  
**Reference**: `implementation-auth.md`  
**Blocked by**: Phase 1 (needs DB models)

### Scope

- Implement JWT token lifecycle (access, refresh, password reset)
- Implement bcrypt password hashing and verification
- Implement API key generation and bcrypt hashing
- Implement scope hierarchy and scope checking
- Implement role precedence logic (global vs per-project)
- Implement permission guards (require_manager, require_project_access)
- Implement FastAPI dependencies (get_current_user, get_current_user_or_api_key, optional_auth)
- Implement OAuth2PasswordBearer scheme
- Password reset flow (v1: log token to stdout; v2: email service)

### Key Deliverables

1. **`backend/app/auth/security.py`** — All cryptographic operations
   - `hash_password()`, `verify_password()`
   - `create_access_token()`, `create_refresh_token()`, `create_password_reset_token()`
   - `decode_token()`
   - `generate_api_key()` → `(raw_key, key_hash)`
   - `check_scope()` with scope hierarchy

2. **`backend/app/auth/permissions.py`** — RBAC logic
   - `resolve_role(user, project_id, db)` → respects project ownership and ProjectMember overrides
   - `require_manager(role)` → raises 403
   - `require_project_access(user, project_id, db)` → enforces membership

3. **`backend/app/auth/dependencies.py`** — FastAPI Depends factories
   - `oauth2_scheme = OAuth2PasswordBearer(...)`
   - `get_current_user(token, db) → User`
   - `get_current_user_or_api_key(request, token, db) → User`
   - `optional_auth(token, db) → User | None`
   - `require_scope(scope_name)` → returns dependency

### Testing Milestone

All checks in `implementation-auth.md` section 7 must pass:
- [ ] Password hashing round-trip works, wrong password fails
- [ ] JWT creation/decode extracts correct `sub`, `role`, `type`
- [ ] Expired tokens raise 401
- [ ] Token type validation works
- [ ] API key generation produces distinct raw/hash
- [ ] Scope hierarchy: `write:*` implies `read:*`, `admin` implies all
- [ ] Revoked API keys fail scope check
- [ ] Role precedence: owner always manager, ProjectMember role overrides global
- [ ] Password reset token type validation
- [ ] Invalid token type in reset flow → 400

### Gate Criteria to Phase 3

✅ **Must be complete**:
- All auth functions have unit tests with >90% coverage
- FastAPI can boot with auth dependencies registered
- Can call `Depends(get_current_user)` in a test route without errors
- JWT secret key stored in `.env` (never in code)
- API key bcrypt hashing is working and tested
- Phase Completion Protocol followed: changes committed + `claude --agent documentation-keeper` run

---

## Phase 3: API Layer

**Duration estimate**: 3–5 days  
**Reference**: `implementation-api.md`  
**Blocked by**: Phases 1 + 2 (needs DB + Auth)

### Scope

- Implement FastAPI app factory with CORS, Accept-Language middleware, exception handlers
- Implement cursor-based pagination helper
- Implement 8 service modules with full business logic
- Implement 8 route modules with thin HTTP handlers
- Implement 10 schema modules (Pydantic request/response models)
- Load locale JSON files and implement error message localization
- Implement status change tracking (StatusHistory records on every status update)
- Implement time tracking queries (time per status, elapsed time)
- Implement API key scope enforcement
- Handle password reset flow (token → confirm)

### Key Deliverables

1. **`backend/app/api/main.py`** — FastAPI app factory
   - CORS middleware
   - Accept-Language → request.state.locale
   - Exception handlers (422, 401, 403, 404, 500)
   - Load locale JSON files on startup
   - Startup event: `check_db_connection()`
   - Mount all routers under `/api/v1`

2. **`backend/app/api/schemas/`** — 10 Pydantic model files
   - `common.py` — PaginatedResponse, ErrorResponse
   - `user.py`, `project.py`, `story.py`, `task.py`, `comment.py`
   - `invitation.py`, `status_history.py`, `api_key.py`, `config.py`
   - Each has Create, Update, Response variants (where applicable)

3. **`backend/app/api/services/`** — 8 service modules
   - `auth_service.py` — register, login, refresh, password reset
   - `project_service.py` — CRUD, archive/restore, members, permissions
   - `story_service.py` — CRUD, move between projects
   - `task_service.py` — CRUD, assign/unassign
   - `comment_service.py` — create, update (own only), delete (own or manager)
   - `invitation_service.py` — invite, accept, decline, expire
   - `time_tracking_service.py` — record status changes, compute metrics
   - `config_service.py` — get/update user config, manage API keys

4. **`backend/app/api/routes/`** — 8 route modules
   - One router per domain (auth, projects, stories, tasks, comments, invitations, time_tracking, config)
   - Routes call services; never query DB directly
   - All routes return standard error shape: `{"error": {"code": "...", "message": "...", "details": [...]}}`
   - Cursor pagination on list endpoints

5. **`backend/app/locales/`** — Locale JSON files
   - `en-GB.json` — English error messages, status/priority strings
   - `pl.json` — Polish translations (full i18n)

### Testing Milestone

All checks in `implementation-api.md` section 8 must pass:
- [ ] POST /auth/register with duplicate email → 409
- [ ] POST /auth/login with wrong password → 401
- [ ] Login returns both access + refresh tokens
- [ ] GET /projects without auth → 401
- [ ] POST /projects as Contributor → 403
- [ ] PATCH /projects/{id} status change → StatusHistory record created
- [ ] PATCH semantics: only non-null fields modified
- [ ] Cursor pagination: limit=2 → next_cursor present, next page correct
- [ ] Accept-Language: pl header → Polish error messages
- [ ] API key with read:tasks → GET succeeds, PATCH → 403
- [ ] GET /docs returns Swagger UI
- [ ] CORS preflight returns correct headers
- [ ] Time metrics return correct elapsed seconds
- [ ] Invitations have expires_at = now + 7 days
- [ ] Accept invitation after expiry → 400
- [ ] All errors: `{"error": {"code": ..., "message": ..., "details": [...]}}`

### Gate Criteria to Phase 4

✅ **Must be complete**:
- `uv run python -m app.main` starts server on localhost:8000
- `GET /api/v1/docs` shows Swagger UI with all routes
- Test suite runs: `uv run pytest tests/test_api/ -v` (all API tests pass)
- Can register user → login → get access token
- Can create project as Manager, fails as Contributor
- Can list projects with pagination
- Database migrations applied: `alembic upgrade head`
- Neon connection (if using cloud) verified with sslmode=require
- Error responses all follow standard shape
- Phase Completion Protocol followed: changes committed + `claude --agent documentation-keeper` run

---

## Phase 4: CLI Tool

**Duration estimate**: 2–3 days  
**Reference**: `implementation-cli.md`  
**Blocked by**: Phase 3 (API must be running)

### Scope

- Implement Typer command structure with 8 command groups
- Implement token storage in `~/.config/spt/config.json` (600 permissions)
- Implement httpx HTTP client with Bearer token + API key support
- Implement i18n with JSON translation files (en-GB, pl)
- Implement token refresh on 401
- Implement date/duration formatting with Babel (locale-aware)
- Implement Rich tables, panels, and output helpers
- Implement cursor pagination for CLI (`--all` flag fetches all pages)
- Implement 40+ CLI commands mirroring the API surface

### Key Deliverables

1. **`backend/app/cli/main.py`** — Typer app root, command group registration
   - `spt auth login/logout/whoami`
   - `spt projects list/create/view/update/delete/archive/restore/members/invite`
   - `spt stories list/create/update/delete/move/status/priority`
   - `spt tasks list/create/update/delete/assign/unassign`
   - `spt comments add/list`
   - `spt invitations list/accept/decline`
   - `spt time metrics/history/report`
   - `spt config set/get/locales api-keys list/create/revoke`

2. **`backend/app/cli/config.py`** — Credential storage
   - `CLIConfig` dataclass with access_token, refresh_token, api_base_url, locale
   - `load_config()` / `save_config()` with `0o600` file permissions

3. **`backend/app/cli/http.py`** — HTTP client with auth
   - `get_client(authenticated=True) → httpx.Client`
   - Bearer token + Accept-Language header
   - `handle_response()` with automatic 401 → token refresh retry
   - Proper error messages from API

4. **`backend/app/cli/i18n.py`** — Localization
   - `t(key, locale, **kwargs) → str`
   - JSON translation files (en-GB, pl)

5. **`backend/app/cli/utils/format.py`** — Date/duration/table formatting
   - `format_date(iso_str, locale) → "09/04/2026"` (en-GB) or `"09.04.2026"` (pl)
   - `format_duration(seconds, locale) → "2h 30m"`
   - Babel for locale-aware formatting

6. **`backend/app/cli/utils/output.py`** — Rich output helpers
   - `print_table()` for list commands
   - `print_panel()` for detail commands
   - `short_id()` for compact UUID display (first 8 chars)

7. **`backend/app/cli/locales/`** — Locale JSON
   - `en-GB.json` — English command strings
   - `pl.json` — Polish translations

8. **`backend/app/cli/commands/`** — 8 command modules
   - One module per domain (auth, projects, stories, tasks, comments, invitations, time_tracking, config_cmd)
   - Each implements CRUD commands
   - Output via Rich tables and panels

### Testing Milestone

All checks in `implementation-cli.md` section 10 must pass:
- [ ] `spt --help` lists all command groups
- [ ] `spt auth login` with wrong credentials exits 1 with error
- [ ] `spt auth login` success saves tokens to `~/.config/spt/config.json` with `0o600`
- [ ] `spt auth whoami` prints name, email, role
- [ ] `spt auth logout` clears tokens
- [ ] `spt projects list` outputs table with headers
- [ ] `spt projects list --all` fetches multiple pages and combines
- [ ] `spt projects create` and `delete` work with confirmation
- [ ] `spt config set locale pl` → subsequent commands in Polish
- [ ] Polish dates in DD.MM.YYYY format
- [ ] `spt time metrics task:<id>` shows table with time per status
- [ ] `spt config api-keys create` shows raw key once (warns it is hidden)
- [ ] 401 response triggers silent refresh + retry
- [ ] `spt invitations list/accept/decline` work

### Gate Criteria to Phase 5

✅ **Must be complete**:
- `uv pip install -e .` installs CLI successfully
- `spt --help` shows all commands
- `spt auth login` → authenticate against running API
- `spt projects list` → lists projects from API
- All 40+ commands have happy-path tests passing
- Tokens stored securely in `~/.config/spt/config.json` (mode 600)
- Locale setting persists and affects all output
- Phase Completion Protocol followed: changes committed + `claude --agent documentation-keeper` run

---

## Phase 5: Frontend (UI)

**Duration estimate**: 4–6 days  
**Reference**: `implementation-ui.md`  
**Blocked by**: Phase 3 (API must be running)

### Scope

- Create React + TypeScript + Vite project
- Implement i18next for locale switching (en-GB, pl with Polish plural rules)
- Implement Tailwind CSS with dark mode support
- Implement React Router for SPA routing
- Implement Axios HTTP client with auth interceptors
- Implement Context API for global state (AuthContext, LocaleContext)
- Implement 8+ pages (Login, Register, Projects, Stories, Tasks, Invitations, Config, etc.)
- Implement 10+ shared components (StatusBadge, PriorityBadge, CommentList, etc.)
- Implement cursor pagination with "Load more" button
- Implement role-based UI visibility (client-side UX only; security enforced by API)
- Implement status history timeline with elapsed time per status
- Implement API key management (create, list, revoke)
- Implement dark mode toggle
- Implement date/number formatting with `Intl` API

### Key Deliverables

1. **`frontend/`** — React Vite project
   - `npm create vite@latest frontend -- --template react-ts`
   - Install: Tailwind, react-router-dom, axios, i18next, rich (for components)

2. **`frontend/src/i18n.ts`** — i18next initialization
   - Load `locales/en-GB.json` and `locales/pl.json`
   - Default locale: en-GB
   - Fallback: en-GB
   - Allow runtime language change via `i18n.changeLanguage()`

3. **`frontend/src/context/`** — Global state management
   - `AuthContext.tsx` — user, isAuthenticated, login(), logout(), refreshToken()
   - `LocaleContext.tsx` — current locale, setLocale()

4. **`frontend/src/services/api.ts`** — Axios instance
   - Base URL: `/api/v1`
   - Request interceptor: attach Bearer token, Accept-Language header
   - Response interceptor: on 401, silent refresh, retry once
   - Grouped API functions: authApi, projectsApi, storiesApi, tasksApi, commentsApi, invitationsApi, timeTrackingApi, configApi

5. **`frontend/src/pages/`** — 8+ page components
   - LoginPage, RegisterPage
   - ProjectsPage (list with filters, pagination, new project button)
   - ProjectDetailPage (stories + members tabs)
   - StoryDetailPage (tasks + comments + status history)
   - TaskDetailPage (status, assignee, comments, timeline)
   - InvitationsPage (pending invites, accept/decline)
   - ConfigPage (locale, theme, API keys)
   - NotFoundPage

6. **`frontend/src/components/`** — Reusable components
   - `layout/NavBar.tsx` — nav links, user menu, logout
   - `layout/ProtectedRoute.tsx` — auth guard, redirect to /login
   - `common/StatusBadge.tsx` — status → color badge
   - `common/PriorityBadge.tsx` — priority → color badge
   - `common/ConfirmDialog.tsx` — delete/archive confirmation modal
   - `common/LoadMoreButton.tsx` — cursor pagination
   - `common/EmptyState.tsx` — "no items" placeholder
   - `comments/CommentList.tsx` — list with edit/delete per user
   - `comments/CommentForm.tsx` — textarea + submit
   - `status-history/StatusHistoryTimeline.tsx` — vertical timeline with elapsed time
   - `config/LocaleSwitcher.tsx` — dropdown: en-GB / pl
   - `config/ThemeSwitcher.tsx` — light / dark / system
   - `config/ApiKeyList.tsx` — list, create (show raw key once), revoke

7. **`frontend/src/hooks/`** — Custom hooks
   - `useProjects()` — fetch, pagination state
   - `useStories(projectId)` — fetch, filters
   - `useTasks(storyId)` — fetch, filters
   - `usePagination()` — next_cursor management
   - `useRole(projectId?)` → { isManager, canDelete, canInvite }

8. **`frontend/src/utils/format.ts`** — Date/number/duration formatting
   - `formatDate(iso, locale)` → "09/04/2026" (en-GB) or "09.04.2026" (pl)
   - `formatDuration(seconds, t)` → "2h 30m" with i18n plurals
   - Uses browser `Intl` API (not i18next for dates/numbers)

9. **`frontend/src/locales/`** — Locale JSON
   - `en-GB.json` — UI strings (nav, status, priority, actions, plural rules)
   - `pl.json` — Polish translations with plural forms (one, few, many, other)

10. **`frontend/vite.config.ts`** — Dev proxy
    - `/api` proxies to `http://localhost:8000`

11. **`frontend/tailwind.config.js`** — Tailwind setup
    - Dark mode: class-based (controlled by theme setting)
    - Content: `./index.html`, `./src/**/*.{ts,tsx}`

### Testing Milestone

All checks in `implementation-ui.md` section 9 must pass:
- [ ] Login form submits, redirects to /projects
- [ ] Wrong credentials show error (no crash)
- [ ] Page refresh restores session via silent token refresh
- [ ] /projects shows paginated list; "Load more" appends (not replaces)
- [ ] Status/priority filters reduce list correctly
- [ ] Locale switcher: change to Polish → page re-renders in Polish immediately
- [ ] Polish locale: dates DD.MM.YYYY; numbers use space as separator
- [ ] Polish plural: "1 zadanie", "2 zadania", "5 zadań"
- [ ] Manager sees delete buttons; Contributor does not
- [ ] StatusHistoryTimeline shows chronological list with elapsed time
- [ ] CommentForm submits, comment appears without reload
- [ ] Invite flow: Manager can invite, Contributor cannot see button
- [ ] API key creation: raw key shown once in modal; not shown on list
- [ ] 401 from any request triggers silent refresh + retry
- [ ] Dark mode toggle applies `dark` class to `<html>`
- [ ] Unknown routes render NotFoundPage

### Gate Criteria to Phase 5 Complete

✅ **Must be complete**:
- `npm run dev` starts Vite dev server on localhost:5173
- API is running on localhost:8000
- Can log in → see projects → navigate to project → see stories
- Dark mode toggles properly
- Locale changes → page updates immediately
- All 15 testing checks pass
- No console errors or warnings (warnings OK for dev)
- **Final Phase Completion Protocol**: changes committed + `claude --agent documentation-keeper` run

---

## Cross-Cutting Concerns

These concerns apply across all phases:

### 1. Database Configuration

**Neon (Cloud)**:
- Use for staging/production
- Connection string: `postgresql+asyncpg://user:pass@ep-xxx.region.aws.neon.tech/dbname?sslmode=require`
- Alembic migrations: `postgresql+psycopg2://...?sslmode=require`

**Local Testing**:
- Use local PostgreSQL for development and testing
- Create test DB: `createdb spt_test`
- Connection string: `postgresql+asyncpg://spt:password@localhost:5432/spt_test`
- No SSL required for localhost

**Environment variables** (`.env`):
```
DATABASE_URL=postgresql+asyncpg://...@neon.tech/...?sslmode=require
SYNC_DATABASE_URL=postgresql+psycopg2://...@neon.tech/...?sslmode=require
TEST_DATABASE_URL=postgresql+asyncpg://spt:password@localhost:5432/spt_test
SECRET_KEY=<32-byte hex string>
```

### 2. Localization (i18n)

**Supported locales** (v1):
- `en-GB` — English, dates DD/MM/YYYY, numbers 1,000.00
- `pl` — Polish, dates DD.MM.YYYY, numbers 1 000,00

**Backend** (`backend/app/locales/`):
- Error messages, status/priority strings (JSON)
- Loaded on API startup
- Used by both API error responses and CLI output

**Frontend** (`frontend/src/locales/`):
- UI strings, navigation, forms (JSON)
- i18next handles Polish plural rules automatically

**CLI** (`backend/app/cli/locales/`):
- Command strings, output labels (JSON)
- Babel for date formatting
- Token stored in `~/.config/spt/config.json`

**No hardcoded strings** in code. All user-visible text is in JSON files.

### 3. Authentication & Token Lifecycle

**Flow**:
1. User registers → email + name + password
2. User logs in → POST /auth/login → access token (15 min) + refresh token (7 days)
3. API requests: `Authorization: Bearer <access_token>`
4. On 401: client calls POST /auth/refresh with refresh token → new access token
5. On logout: client discards both tokens (stateless v1)

**Refresh tokens**:
- Stored in browser localStorage (frontend) or `~/.config/spt/config.json` (CLI)
- v2: add token revocation table + check on refresh

**Password reset** (v1):
- User requests reset: POST /auth/password-reset {email}
- Server logs token to stdout: `[PASSWORD RESET] Token for user@example.com: <token>`
- User submits token + new password: POST /auth/password-reset/confirm {token, new_password}
- Server validates token, updates password

### 4. Error Responses

All API errors follow this shape:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable, localised message",
    "details": [{"field": "email", "issue": "already exists"}]
  }
}
```

Status codes:
- 200 OK, 201 Created, 204 No Content
- 400 Bad Request, 401 Unauthorized, 403 Forbidden
- 404 Not Found, 409 Conflict
- 422 Validation Error, 429 Rate Limited
- 500 Internal Error

### 5. Role-Based Access Control (RBAC)

**Enforcement**: 100% server-side in services layer
- Global role: set on user registration
- Per-project role: set via ProjectMember record (overrides global)
- Project owner: always has Manager access
- Rules:
  - Managers: create/delete projects, invite members, manage roles
  - Contributors: create/edit stories & tasks within assigned projects
  - Non-members: no access (Contributors must be explicit ProjectMembers)

**Client-side**:
- Hide buttons for non-managers (UX only)
- Never trust client role for security decisions

### 6. Time Tracking (Status History)

Every status change (on any item) records a StatusHistory row:
- project/story/task ID (one FK set)
- from_status → to_status
- changed_by (user ID)
- changed_at (timestamp)

Used to compute:
- Time spent in each status (consecutive row differences)
- Total item lifetime (first record → last record)
- Time-in-status per user/project/team

Queries: `/projects/{id}/time-metrics`, `/stories/{id}/time-metrics`, `/tasks/{id}/time-metrics`

### 7. Testing Strategy

**Unit tests**: Auth layer (passwords, tokens), permission logic  
**Integration tests**: API routes via FastAPI TestClient  
**Database tests**: Use transactions + rollback for isolation  
**Fixtures**: Shared test users, projects, stories in `tests/conftest.py`

**Run locally**:
```bash
# Backend tests against local PostgreSQL
TEST_DATABASE_URL=postgresql+asyncpg://spt:password@localhost:5432/spt_test \
  uv run pytest tests/ -v --cov=app

# Frontend tests (future)
npm run test -- --coverage

# CLI tests (future)
uv run pytest tests/test_cli/ -v
```

---

## Success Metrics

| Phase | Success Criteria |
|-------|------------------|
| 1 (DB) | `alembic upgrade head` succeeds; `pytest tests/` runs with fixtures |
| 2 (Auth) | All crypto tests pass; FastAPI can boot with Depends(get_current_user) |
| 3 (API) | `python -m app.main` starts; GET /docs shows full Swagger UI; all route tests pass |
| 4 (CLI) | `spt --help` shows commands; `spt auth login` + `spt projects list` work end-to-end |
| 5 (UI) | `npm run dev`; login + navigate projects → stories → tasks; dark mode + locale switching work |

---

## Known Constraints

- **v1 scope**: Single-user password reset (logged to stdout, not emailed)
- **v1 scope**: Stateless logout (no token revocation table)
- **v1 scope**: No real-time updates (WebSocket/SSE deferred to v2)
- **v1 scope**: Comment threading deferred (flat comments only)
- **Neon SSL**: All production connections use `sslmode=require`
- **Token storage frontend**: Refresh token in localStorage (v2: httpOnly cookie)
- **Token storage CLI**: Refresh token in `~/.config/spt/config.json` (600 permissions)

---

## Timeline

| Phase | Duration | Cumulative | Status |
|-------|----------|-----------|--------|
| 1 (DB) | 1–2 days | 1–2 days | 🔴 Ready to start |
| 2 (Auth) | 1–2 days | 2–4 days | 🔴 Blocked by Phase 1 |
| 3 (API) | 3–5 days | 5–9 days | 🔴 Blocked by Phase 2 |
| 4 (CLI) | 2–3 days | 7–12 days | 🔴 Blocked by Phase 3 |
| 5 (UI) | 4–6 days | 11–18 days | 🔴 Blocked by Phase 3 |

**Total estimated**: 11–18 days (assuming 1 person, 8h/day, no interruptions)

---

## Next Steps

1. **Phase 1**: Begin with `implementation-db.md`
   - Set up Python project structure
   - Create models and migrations
   - Verify database connectivity (Neon + local test DB)

2. After Phase 1 gates pass → **Phase 2** (Auth)
3. After Phase 2 gates pass → **Phase 3** (API)
4. After Phase 3 gates pass → **Phase 4 and/or 5** (CLI and UI in parallel, if desired)
