# Requirements

## Project Overview

**simple-project-tool** is a minimalist project management application designed to help teams organize work across multiple projects. It supports two user types with different levels of control, organizes work using a three-level hierarchy (projects → stories → tasks), and provides both a web UI and a CLI for full accessibility. The tool is API-first, meaning all functionality is driven through a REST API, enabling both human users and AI agents to interact with the system.

---

## User Roles & Permissions

Two user roles: **Manager** and **Contributor**.

| Feature                  | Manager     | Contributor |
|--------------------------|:-----------:|:-----------:|
| Create/delete projects   | yes         | no          |
| Manage project members   | yes         | no          |
| Create/edit stories      | yes         | yes         |
| Create/edit tasks        | yes         | yes         |
| Delete stories/tasks     | yes         | no          |
| Comment on items         | yes         | yes         |
| Invite contributors      | yes         | no          |
| View project data        | yes         | yes         |
| Manage API keys          | yes         | own only    |

**Manager**: Can create and remove projects, invite others, and fully manage content.

**Contributor**: Can create and edit stories/tasks within assigned projects, cannot create projects or delete items.

### Role Precedence

Users have a **global role** (set on registration) and an optional **per-project role** (set via `ProjectMember`).

- Per-project role **overrides** global role for that project.
- A global Contributor can be promoted to Manager on a single project.
- A global Manager can be scoped down to Contributor on a specific project.
- The **project owner** always has Manager access to their project, regardless of `ProjectMember.role`.
- If no `ProjectMember` record exists, the global role applies.

---

## Core Data Model

### Hierarchy

Projects contain stories, which contain tasks. All three item types share common properties.

### Shared Item Properties

- **Status**: one of `to_do`, `in_progress`, `in_review`, `in_testing`, `done`
- **Priority**: one of `low`, `medium`, `high`
- **Comments**: items can have multiple comments from different users
- **Status History**: every status change is recorded with a timestamp and who made the change
- **Timestamps**: `created_at`, `updated_at`
- **Audit**: `created_by`, `updated_by`

### Entities

#### User

- `id` (UUID, primary key)
- `email` (string, unique)
- `name` (string) — display name for UI and comments
- `password_hash` (string, bcrypt)
- `role` (enum: `manager`, `contributor`) — global role
- `created_at` (timestamp)
- `updated_at` (timestamp)

#### Project

- `id` (UUID, primary key)
- `name` (string)
- `description` (text, optional)
- `owner_id` (UUID, FK → User) — always has Manager access
- `status` (enum: `to_do`, `in_progress`, `in_review`, `in_testing`, `done`)
- `priority` (enum: `low`, `medium`, `high`)
- `archived_at` (timestamp, nullable) — null means active, set on archive
- `created_by` (UUID, FK → User)
- `updated_by` (UUID, FK → User, nullable)
- `created_at` (timestamp)
- `updated_at` (timestamp)

#### Story

- `id` (UUID, primary key)
- `project_id` (UUID, FK → Project)
- `title` (string)
- `description` (text, optional)
- `status` (enum: `to_do`, `in_progress`, `in_review`, `in_testing`, `done`)
- `priority` (enum: `low`, `medium`, `high`)
- `created_by` (UUID, FK → User)
- `updated_by` (UUID, FK → User, nullable)
- `created_at` (timestamp)
- `updated_at` (timestamp)

#### Task

- `id` (UUID, primary key)
- `story_id` (UUID, FK → Story)
- `title` (string)
- `description` (text, optional)
- `status` (enum: `to_do`, `in_progress`, `in_review`, `in_testing`, `done`)
- `priority` (enum: `low`, `medium`, `high`)
- `assignee_id` (UUID, FK → User, nullable)
- `created_by` (UUID, FK → User)
- `updated_by` (UUID, FK → User, nullable)
- `created_at` (timestamp)
- `updated_at` (timestamp)

#### Comment

Uses separate nullable foreign keys with a CHECK constraint ensuring exactly one is set. This allows database-level referential integrity.

- `id` (UUID, primary key)
- `project_id` (UUID, FK → Project, nullable)
- `story_id` (UUID, FK → Story, nullable)
- `task_id` (UUID, FK → Task, nullable)
- `author_id` (UUID, FK → User)
- `body` (text)
- `created_at` (timestamp)
- `updated_at` (timestamp)

**Constraint**: `CHECK (num_nonnulls(project_id, story_id, task_id) = 1)`

#### ProjectMember

- `project_id` (UUID, FK → Project, part of composite PK)
- `user_id` (UUID, FK → User, part of composite PK)
- `role` (enum: `manager`, `contributor`) — per-project role override
- `joined_at` (timestamp)

#### Invitation

- `id` (UUID, primary key)
- `project_id` (UUID, FK → Project)
- `inviter_id` (UUID, FK → User)
- `invitee_email` (string)
- `role` (enum: `manager`, `contributor`) — proposed role on the project
- `status` (enum: `pending`, `accepted`, `declined`, `expired`)
- `created_at` (timestamp)
- `expires_at` (timestamp)

#### StatusHistory

Uses separate nullable foreign keys with a CHECK constraint (same pattern as Comment).

- `id` (UUID, primary key)
- `project_id` (UUID, FK → Project, nullable)
- `story_id` (UUID, FK → Story, nullable)
- `task_id` (UUID, FK → Task, nullable)
- `from_status` (enum, nullable — null on initial creation)
- `to_status` (enum)
- `changed_by` (UUID, FK → User)
- `changed_at` (timestamp)

**Constraint**: `CHECK (num_nonnulls(project_id, story_id, task_id) = 1)`

This table is append-only and never updated. It enables:
- Full audit trail of all status transitions
- Elapsed time per status (difference between consecutive `changed_at` values)
- Total item lifetime (first record → latest record)
- Time-in-status reporting per user, project, or team

**Indexes**: `(project_id, changed_at)`, `(story_id, changed_at)`, `(task_id, changed_at)` for efficient time-range queries.

#### APIKey

- `id` (UUID, primary key)
- `user_id` (UUID, FK → User)
- `key_hash` (string, bcrypt)
- `label` (string)
- `scopes` (JSON array of permission strings)
- `last_used_at` (timestamp, nullable)
- `created_at` (timestamp)
- `revoked_at` (timestamp, nullable)

**Defined scopes**:
- `read:projects`, `write:projects`
- `read:stories`, `write:stories`
- `read:tasks`, `write:tasks`
- `read:comments`, `write:comments`
- `admin` — full access (Managers only)

A `write:*` scope implies the corresponding `read:*` scope.

#### UserConfig

- `user_id` (UUID, FK → User, primary key)
- `theme` (enum: `light`, `dark`, `system`, default `system`)
- `locale` (enum: `en-GB`, `pl`, default `en-GB`) — controls UI language and date/number formatting
- `display_preferences` (JSON, default `{}`)
- `updated_at` (timestamp)

**Supported locales** (v1):

| Code    | Language   | Date format  | Number format |
|---------|------------|--------------|---------------|
| `en-GB` | English UK | DD/MM/YYYY   | 1,000.00      |
| `pl`    | Polish     | DD.MM.YYYY   | 1 000,00      |

### Key Database Indexes

Beyond primary keys and foreign keys (which are indexed by default), these indexes are critical for performance:

- `StatusHistory`: `(project_id, changed_at)`, `(story_id, changed_at)`, `(task_id, changed_at)`
- `Comment`: `(project_id)`, `(story_id)`, `(task_id)` — filtered for non-null
- `Task`: `(assignee_id)`, `(story_id, status)`
- `Story`: `(project_id, status)`
- `Invitation`: `(invitee_email, status)`, `(project_id)`
- `APIKey`: `(user_id, revoked_at)` — find active keys for a user

---

## Functional Requirements

### Authentication

- User registration with email, name, and password
- Login returning a JWT access token (15-minute expiry) and refresh token (7-day expiry)
- JWT token-based authentication for API requests
- Token refresh endpoint to get a new access token without re-login
- Password reset flow:
  1. User requests reset via email address
  2. Server sends email with a time-limited token (1 hour expiry)
  3. User submits token + new password
  4. Server verifies token, updates password, invalidates all existing sessions
- Support for API key authentication (for AI agents and integrations)
  - API key sent via `X-API-Key` header
  - Scoped permissions (see APIKey entity above)

### Projects

- Create new projects (Managers only)
- View all projects (filtered by ownership/membership)
- Update project details
- Delete projects (Managers only)
- Archive/restore projects (sets/clears `archived_at`)
- Add/remove members from projects
- Manage member roles at project level

### Stories

- Create stories within a project (all project members)
- View stories within a project
- Update story title, description, status, and priority
- Delete stories (Managers only)
- Move stories between projects
- Filter stories by status and priority

### Tasks

- Create tasks within a story (all project members)
- View tasks within a story
- Update task title, description, status, priority, and assignee
- Delete tasks (Managers only)
- Assign/unassign tasks to project members
- Filter tasks by status, priority, and assignee

### Time Tracking

- Every status change on a project, story, or task is automatically recorded in `StatusHistory`
- Each record stores: item reference, previous status, new status, who changed it, and when
- API provides computed time metrics per item:
  - Time spent in each status (e.g. 4h in `in_review`)
  - Total elapsed time from creation to current status
  - Full status transition history
- No manual time entry required — tracking is derived from status transitions
- Time data can be queried per item, per project, or per user

### Comments

- Add comments to any item (project, story, or task)
- Edit own comments
- Delete own comments (Managers can delete any comment)
- Comment threading (nested replies, optional for v1)

### Invitations & Collaboration

- Invite users to projects by email (project-level invites)
- Invitation includes proposed role (Manager or Contributor)
- Accept/decline invitations
- Manage invitations (view pending, resend, cancel)
- Invitations expire after 7 days
- Support for AI agents as project members (via API keys with scopes)

### Internationalisation (i18n)

- UI rendered in the user's chosen locale (`en-GB` or `pl`)
- Locale stored in `UserConfig.locale`, settable from the config page and CLI
- All user-visible strings are translated — no hardcoded English in UI or CLI output
- Date and time displayed in locale-appropriate format:
  - `en-GB`: `25/04/2026`, `14:30`
  - `pl`: `25.04.2026`, `14:30`
- Numbers and durations formatted per locale (time tracking output, priority labels, etc.)
- API accepts `Accept-Language: en-GB` or `Accept-Language: pl` header to localise error messages and system responses
  - Falls back to `en-GB` when the requested locale is unsupported
  - Authenticated requests use the user's stored locale if no header is provided
- Polish plural rules handled correctly (e.g. 1 zadanie, 2 zadania, 5 zadań)
- Translation files are JSON, one file per locale per layer:
  - Frontend: `frontend/src/locales/en-GB.json`, `frontend/src/locales/pl.json`
  - CLI: `backend/app/cli/locales/en-GB.json`, `backend/app/cli/locales/pl.json`
  - Backend error messages: `backend/app/locales/en-GB.json`, `backend/app/locales/pl.json`
- Adding a new locale requires only new translation files and adding the code to the supported locale enum — no structural code changes

### Configuration

- User settings: theme, locale, display preferences
- API key management: create (with scope selection), list, revoke
- Project settings: archived status, member list
- Global admin settings (future: rate limits, feature flags)

### REST API

- All routes prefixed with `/api/v1/`
- Full CRUD operations for all entities
- OpenAPI/Swagger documentation (auto-generated by FastAPI)
- Cursor-based pagination on list endpoints (`?cursor=<id>&limit=25`, default limit 25, max 100)
- Filtering via query parameters (see API Overview below)
- Sorting via `?sort=field` and `?sort=-field` (descending)
- Text search via `?q=search+term` on list endpoints
- PATCH for partial updates, PUT only when replacing entire resource
- Standard error response format:
  ```json
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Human-readable description",
      "details": [{"field": "name", "issue": "required"}]
    }
  }
  ```
- HTTP status codes: 200 (OK), 201 (Created), 204 (No Content), 400 (Bad Request), 401 (Unauthorized), 403 (Forbidden), 404 (Not Found), 409 (Conflict), 422 (Validation Error), 429 (Rate Limited), 500 (Internal Error)

### CLI

- Command-line interface using Typer
- Mirror all major API operations
- Authentication: `spt auth login`, `spt auth logout`, `spt auth whoami`
- Projects: `spt projects list`, `spt projects create`, `spt projects delete`
- Stories: `spt stories list`, `spt stories create`, `spt stories update`
- Tasks: `spt tasks list`, `spt tasks create`, `spt tasks update`
- Comments: `spt comments add`
- Time tracking: `spt time-metrics <item>`, `spt time-history <item>`, `spt time-report <project>`
- Configuration: `spt config set`, `spt config get`

---

## Non-Functional Requirements

- **Minimalist Design**: Simple, clean UI without unnecessary complexity
- **API-First Architecture**: All functionality accessible through the REST API, versioned at `/api/v1/`
- **Internationalisation**: Full i18n support; initial locales `en-GB` and `pl`; adding new locales requires only translation files
- **Secure Credential Storage**: bcrypt for passwords, JWT for tokens, API key hashing
- **Multi-User Support**: Support human users and AI agents as contributors
- **Scalability**: Designed to handle multiple projects and users
- **Reliability**: Data persistence in a relational database with proper backups
- **Performance**: Fast response times, efficient queries, cursor-based pagination for large datasets, indexed hot paths
- **Maintainability**: Clean code, clear separation of concerns, comprehensive error handling
- **Real-time Updates (future)**: WebSocket or SSE support for live status changes, comment notifications, and assignment alerts — deferred post-v1

---

## Recommended Tech Stack

| Layer              | Technology                  | Rationale                                               |
|--------------------|-----------------------------|----------------------------------------------------------|
| Backend API        | Python + FastAPI            | Modern, fast, automatic OpenAPI docs, async support     |
| ORM & Migrations   | SQLAlchemy + Alembic        | Pythonic ORM, robust migrations, wide DB support        |
| Database           | PostgreSQL via Neon          | Relational structure fits the hierarchy; Neon provides serverless branching, autoscaling, and a generous free tier |
| Testing DB         | Local PostgreSQL             | Full-fidelity local instance for test runs; matches Neon's PostgreSQL version |
| Authentication     | PyJWT + bcrypt              | Actively maintained JWT library, secure password hashing|
| Frontend           | React + TypeScript + Vite   | Modern, lightweight, fast dev experience                |
| Styling            | Tailwind CSS                | Utility-first, quick to build minimalist designs        |
| CLI Tool           | Typer (built on Click)      | Clean, modern Python CLI, shares models with backend    |
| Package Manager    | uv                          | Fast, modern Python package management                  |
| Testing            | pytest + pytest-asyncio     | Comprehensive testing for async code                    |
| Linting/Formatting | ruff                        | Fast linting and formatting in one tool (`ruff check` + `ruff format`) |
| i18n (Frontend)    | i18next + react-i18next     | Mature i18n library, handles Polish plural rules, lazy-loads locale files |
| i18n (CLI)         | babel (Python)              | Locale-aware date/number formatting; translation strings loaded from JSON |

---

## Modular Architecture

The project is organized into **four clearly separated layers**, each with distinct responsibilities:

### 1. Database Layer (`backend/app/db/`)

**Responsibility**: Database schema, models, and data access

- **Models** (`models/`): SQLAlchemy ORM definitions
  - `user.py`, `project.py`, `story.py`, `task.py`, `comment.py`, `project_member.py`, `invitation.py`, `api_key.py`, `status_history.py`, `user_config.py`
  - Each entity in its own module
  - No business logic, pure data definitions

- **Migrations** (`migrations/`): Alembic version control for schema changes
  - One migration per schema change
  - Reversible and reproducible

- **Database Connection** (`database.py`):
  - SQLAlchemy engine and session management
  - Connection pooling configuration
  - Transaction handling

**Isolation**: Models only depend on SQLAlchemy; no FastAPI or external dependencies.

### 2. Authentication Layer (`backend/app/auth/`)

**Responsibility**: User authentication, authorization, credential management

- **Security** (`security.py`):
  - JWT token generation and validation
  - Password hashing (bcrypt)
  - Token expiration and refresh

- **Permissions** (`permissions.py`):
  - Role-Based Access Control (RBAC) logic
  - Permission checking functions
  - Resource ownership validation
  - Role precedence resolution (global vs per-project)

- **Dependencies** (`dependencies.py`):
  - FastAPI Depends() functions to extract and validate tokens
  - Current user injection
  - API key authentication

**Isolation**: Auth layer depends on database models but NOT on API routes. Routes use auth as a dependency.

### 3. API Layer (`backend/app/api/`)

**Responsibility**: HTTP request/response handling and orchestration

- **Schemas** (`schemas/`):
  - Request models (Pydantic)
  - Response models (Pydantic)
  - Validation rules

- **Services** (`services/`):
  - Business logic (create, update, delete operations)
  - Permission enforcement via auth layer
  - Database queries via models
  - Example: `project_service.py`, `task_service.py`, `time_tracking_service.py`, `invitation_service.py`

- **Routes** (`routes/`):
  - FastAPI router definitions
  - HTTP method handlers
  - Request/response parsing via schemas
  - Example: `projects.py`, `tasks.py`, `status_history.py`, `invitations.py`

- **Main** (`main.py`):
  - FastAPI app initialization
  - Route registration under `/api/v1/`
  - Global middleware (CORS, error handling, rate limiting)

**Isolation**: API routes depend on services and auth; services depend on models and auth. No route logic directly touches the database.

### 4. UI Layer (`frontend/`)

**Responsibility**: User interface and client-side logic

- **Components** (`src/components/`): Reusable React components
- **Pages** (`src/pages/`): Full-page views
- **Services** (`src/services/api.ts`): HTTP client for API calls
- **Context** (`src/context/`): Global state (auth, user, theme)
- **Hooks** (`src/hooks/`): Custom React hooks

**Isolation**: UI is completely separate from backend. Communicates only via REST API using HTTP client (e.g., fetch, axios).

### Communication Flow

```
User → [UI Layer]
         ↓ HTTP Request
       [API Layer]
         ↓ Service call
       [Auth Layer] (permission check)
         ↓ Query
       [DB Layer]
         ↓ Return data
       [Auth Layer] (response filtering)
         ↓ JSON response
       [API Layer]
         ↓ HTTP Response
       [UI Layer] → Display
```

### Benefits of This Structure

1. **Testability**: Each layer can be tested independently
   - DB layer: Test models and migrations
   - Auth layer: Test JWT, permissions
   - API layer: Test routes with mocked services
   - UI layer: Test components with mocked API calls

2. **Reusability**: Auth and DB layers can be used by multiple clients (web, CLI, API integrations)

3. **Maintainability**: Changes to one layer don't ripple through others
   - Modify DB schema → update migrations and models → minimal API changes
   - Add auth rule → update permissions module → routes automatically enforced

4. **Scalability**: Layers can be deployed separately
   - Frontend on CDN, backend on servers
   - CLI shares backend code without UI dependencies

5. **Clarity**: Clear responsibility boundaries make onboarding easier

### File Structure Overview

```
backend/
├── app/
│   ├── db/
│   │   ├── database.py         # Engine, session management
│   │   ├── models/
│   │   │   ├── user.py
│   │   │   ├── project.py
│   │   │   ├── story.py
│   │   │   ├── task.py
│   │   │   ├── comment.py
│   │   │   ├── invitation.py
│   │   │   ├── status_history.py
│   │   │   ├── user_config.py
│   │   │   └── ...
│   │   └── base.py             # Base model class
│   ├── auth/
│   │   ├── security.py         # JWT (PyJWT), password hashing
│   │   ├── permissions.py      # RBAC logic, role precedence
│   │   └── dependencies.py     # FastAPI dependencies, API key auth
│   ├── api/
│   │   ├── schemas/            # Pydantic models
│   │   ├── services/           # Business logic
│   │   ├── routes/             # API endpoints
│   │   └── main.py
│   └── cli/                    # Typer CLI (mirrors API)
├── migrations/                 # Alembic versions
└── tests/                      # Layer-specific tests

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   ├── services/api.ts         # HTTP client
│   ├── context/
│   ├── hooks/
│   └── App.tsx
└── package.json
```

---

## API Overview

All routes are prefixed with `/api/v1`.

### Authentication Routes

```
POST   /auth/register              Register new user
POST   /auth/login                 Login → access token + refresh token
POST   /auth/refresh               Refresh access token
GET    /auth/me                    Get current user info
POST   /auth/logout                Invalidate refresh token
POST   /auth/password-reset        Request password reset email
POST   /auth/password-reset/confirm  Verify token + set new password
```

### Project Routes

```
GET    /projects                   List projects (?status=&priority=&archived=false&q=&sort=-created_at&cursor=&limit=25)
POST   /projects                   Create new project
GET    /projects/{id}              Get project details
PATCH  /projects/{id}              Update project fields
DELETE /projects/{id}              Delete project
POST   /projects/{id}/archive      Archive project
POST   /projects/{id}/restore      Restore archived project
GET    /projects/{id}/members      List project members
POST   /projects/{id}/members      Add member to project
PATCH  /projects/{id}/members/{user_id}  Update member role
DELETE /projects/{id}/members/{user_id}  Remove member
```

### Story Routes

```
GET    /projects/{project_id}/stories    List stories (?status=&priority=&q=&sort=-created_at&cursor=&limit=25)
POST   /projects/{project_id}/stories    Create story
GET    /stories/{id}                     Get story details
PATCH  /stories/{id}                     Update story fields
DELETE /stories/{id}                     Delete story
POST   /stories/{id}/move                Move story to another project
```

### Task Routes

```
GET    /stories/{story_id}/tasks    List tasks (?status=&priority=&assignee_id=&q=&sort=-created_at&cursor=&limit=25)
POST   /stories/{story_id}/tasks    Create task
GET    /tasks/{id}                  Get task details
PATCH  /tasks/{id}                  Update task fields (including assignee)
DELETE /tasks/{id}                  Delete task
```

### Comment Routes

```
GET    /projects/{id}/comments             List comments on project
GET    /stories/{id}/comments              List comments on story
GET    /tasks/{id}/comments                List comments on task
POST   /projects/{id}/comments             Add comment to project
POST   /stories/{id}/comments              Add comment to story
POST   /tasks/{id}/comments                Add comment to task
PATCH  /comments/{id}                      Update comment
DELETE /comments/{id}                      Delete comment
```

### Invitation Routes

```
GET    /projects/{id}/invitations          List invitations for project
POST   /projects/{id}/invitations          Invite user by email
DELETE /invitations/{id}                   Cancel invitation
POST   /invitations/{id}/accept            Accept invitation
POST   /invitations/{id}/decline           Decline invitation
GET    /invitations/mine                   List my pending invitations
```

### Time Tracking Routes

```
GET    /projects/{id}/status-history       Project status change history
GET    /stories/{id}/status-history        Story status change history
GET    /tasks/{id}/status-history          Task status change history
GET    /projects/{id}/time-metrics         Computed time metrics for project
GET    /stories/{id}/time-metrics          Computed time metrics for story
GET    /tasks/{id}/time-metrics            Computed time metrics for task
GET    /projects/{id}/time-report          Aggregate time report across all project items
GET    /users/{user_id}/time-report        Time report for a user's assigned work
```

### Configuration Routes

```
GET    /config                   Get current user's configuration (includes locale, theme)
PATCH  /config                   Update user configuration (locale, theme, display_preferences)
GET    /config/api-keys          List API keys (shows label, scopes, last_used_at — never the key itself)
POST   /config/api-keys          Create new API key (returns key once, then only hash is stored)
DELETE /config/api-keys/{id}     Revoke API key

GET    /config/locales           List supported locales (code, name, date format, number format)
```

---

## CLI Commands Overview

```
spt auth login                  Log in to the system
spt auth logout                 Log out
spt auth whoami                 Show current user

spt projects list               List all accessible projects
spt projects create             Create new project
spt projects view <id>          View project details
spt projects delete <id>        Delete a project
spt projects archive <id>       Archive a project
spt projects restore <id>       Restore an archived project
spt projects members <id>       List project members

spt stories list <project>      List stories in a project
spt stories create <project>    Create a new story
spt stories update <id>         Update story
spt stories delete <id>         Delete story
spt stories move <id> <project> Move story to another project

spt tasks list <story>          List tasks in a story
spt tasks create <story>        Create a new task
spt tasks update <id>           Update task
spt tasks delete <id>           Delete task
spt tasks assign <id> <user>    Assign task to user

spt comments add <item> <text>  Add comment to an item
spt comments list <item>        List comments on an item

spt invitations list            List my pending invitations
spt invitations accept <id>     Accept an invitation
spt invitations decline <id>    Decline an invitation

spt time-metrics <item>         Get time metrics for an item
spt time-history <item>         Get full status change history
spt time-report <project>       Get project-level time report

spt config set <key> <value>    Set configuration value (e.g. spt config set locale pl)
spt config get <key>            Get configuration value
spt config locales              List supported locales
spt config api-keys list        List API keys
spt config api-keys create      Create a new API key
spt config api-keys revoke <id> Revoke an API key
```
