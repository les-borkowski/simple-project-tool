# Requirements

## Project Overview

**simple-project-tool** is a minimalist project management application designed to help teams organize work across multiple projects. It supports two user types with different levels of control, organizes work using a three-level hierarchy (projects → stories → tasks), and provides both a web UI and a CLI for full accessibility. The tool is API-first, meaning all functionality is driven through a REST API, enabling both human users and AI agents to interact with the system.

---

## User Roles & Permissions

Two user roles with clearly defined permissions:

| Feature                  | Manager/Contributor | Contributor |
|--------------------------|:-------------------:|:-----------:|
| Create/delete projects   | ✅                  | ❌          |
| Manage project members   | ✅                  | ❌          |
| Create/edit stories      | ✅                  | ✅          |
| Create/edit tasks        | ✅                  | ✅          |
| Delete stories/tasks     | ✅                  | ❌          |
| Comment on items         | ✅                  | ✅          |
| Invite contributors      | ✅                  | ❌          |
| View project data        | ✅                  | ✅          |

**Manager/Contributor**: Can create and remove projects, invite others, and fully manage content.

**Contributor**: Limited to creating and editing stories/tasks within assigned projects, cannot create projects or delete items.

---

## Core Data Model

### Hierarchy
Projects contain stories, which contain tasks. All three item types share common properties.

### Shared Item Properties
- **Status**: one of `to_do`, `in_progress`, `in_review`, `in_testing`, `done`
- **Priority**: one of `low`, `medium`, `high`
- **Comments**: items can have multiple comments from different users
- **Status History**: every status change is recorded with a timestamp and who made the change
- **Timestamps**: created_at, updated_at

### Entities

#### User
- `id` (UUID)
- `email` (unique)
- `password_hash` (bcrypt)
- `role` (enum: manager_contributor, contributor)
- `created_at`
- `updated_at`

#### Project
- `id` (UUID)
- `name` (string)
- `description` (text, optional)
- `owner_id` (UUID, foreign key to User)
- `status` (enum: to_do, in_progress, in_review, in_testing, done)
- `priority` (enum: low, medium, high)
- `created_at`
- `updated_at`

#### Story
- `id` (UUID)
- `project_id` (UUID, foreign key to Project)
- `title` (string)
- `description` (text, optional)
- `status` (enum: to_do, in_progress, in_review, in_testing, done)
- `priority` (enum: low, medium, high)
- `created_at`
- `updated_at`

#### Task
- `id` (UUID)
- `story_id` (UUID, foreign key to Story)
- `title` (string)
- `description` (text, optional)
- `status` (enum: to_do, in_progress, in_review, in_testing, done)
- `priority` (enum: low, medium, high)
- `assignee_id` (UUID, foreign key to User, nullable)
- `created_at`
- `updated_at`

#### Comment
- `id` (UUID)
- `item_type` (enum: project, story, task)
- `item_id` (UUID)
- `author_id` (UUID, foreign key to User)
- `body` (text)
- `created_at`
- `updated_at`

#### ProjectMember
- `project_id` (UUID, foreign key to Project)
- `user_id` (UUID, foreign key to User)
- `role` (enum: manager_contributor, contributor) — allows per-project role override

#### StatusHistory
- `id` (UUID)
- `item_type` (enum: project, story, task)
- `item_id` (UUID)
- `from_status` (enum, nullable — null on initial creation)
- `to_status` (enum)
- `changed_by` (UUID, foreign key to User)
- `changed_at` (timestamp)

This table is append-only and never updated. It enables:
- Full audit trail of all status transitions
- Elapsed time per status (difference between consecutive `changed_at` values)
- Total item lifetime (first record → latest record)
- Time-in-status reporting per user, project, or team

#### APIKey
- `id` (UUID)
- `user_id` (UUID, foreign key to User)
- `key_hash` (bcrypt)
- `label` (string)
- `scopes` (JSON array of permission strings)
- `last_used_at` (timestamp, nullable)
- `created_at`
- `revoked_at` (nullable)

---

## Functional Requirements

### Authentication
- User registration with email and password
- Login returning a JWT token
- JWT token-based authentication for API requests
- Password reset via email
- Support for API key authentication (for AI agents and integrations)
- Session/token expiration

### Projects
- Create new projects (managers only)
- View all projects (with filtering by ownership/membership)
- Update project details
- Delete projects (managers only)
- Archive/restore projects
- Add/remove members from projects
- Manage member roles at project level

### Stories
- Create stories within a project (all team members)
- View stories within a project
- Update story title, description, status, and priority
- Delete stories (managers only)
- Move stories between projects
- Filter stories by status and priority

### Tasks
- Create tasks within a story (all team members)
- View tasks within a story
- Update task title, description, status, priority, and assignee
- Delete tasks (managers only)
- Assign/unassign tasks to users
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
- Delete own comments (managers can delete any comment)
- Comment threading (nested replies, optional for v1)

### Invitations & Collaboration
- Invite users to projects by email (project-level invites)
- Invite users globally to contribute (global invites for managers)
- Accept/decline invitations
- Manage invitations (view pending, resend, cancel)
- Support for AI agents as project members (via API keys with scopes)

### Configuration
- User settings: display preferences, language, theme
- API key management: create, list, revoke keys
- Project settings: archived status, member list
- Global admin settings (future: rate limits, feature flags)

### REST API
- Full CRUD operations for all entities
- OpenAPI/Swagger documentation (auto-generated by FastAPI)
- Pagination and filtering on list endpoints
- Proper HTTP status codes and error responses
- JSON request/response format

### CLI
- Command-line interface using Typer
- Mirror all major API operations
- Authentication: `spt auth login`, `spt auth logout`, `spt auth whoami`
- Projects: `spt projects list`, `spt projects create`, `spt projects delete`
- Stories: `spt stories list`, `spt stories create`, `spt stories update`
- Tasks: `spt tasks list`, `spt tasks create`, `spt tasks update`
- Comments: `spt comments add`
- Configuration: `spt config set`, `spt config get`

---

## Non-Functional Requirements

- **Minimalist Design**: Simple, clean UI without unnecessary complexity
- **API-First Architecture**: All functionality accessible through the REST API
- **Secure Credential Storage**: bcrypt for passwords, JWT for tokens, API key hashing
- **Multi-User Support**: Support human users and AI agents as contributors
- **Scalability**: Designed to handle multiple projects and users
- **Reliability**: Data persistence in a relational database with proper backups
- **Performance**: Fast response times, efficient queries, pagination for large datasets
- **Maintainability**: Clean code, clear separation of concerns, comprehensive error handling

---

## Recommended Tech Stack

| Layer              | Technology                  | Rationale                                               |
|--------------------|-----------------------------|----------------------------------------------------------|
| Backend API        | Python + FastAPI            | Modern, fast, automatic OpenAPI docs, async support     |
| ORM & Migrations   | SQLAlchemy + Alembic        | Pythonic ORM, robust migrations, wide DB support        |
| Database           | PostgreSQL                  | Relational structure fits the hierarchy perfectly       |
| Authentication     | python-jose (JWT) + bcrypt  | Industry-standard JWT, secure password hashing          |
| Frontend           | React + TypeScript + Vite   | Modern, lightweight, fast dev experience                |
| Styling            | Tailwind CSS                | Utility-first, quick to build minimalist designs        |
| CLI Tool           | Typer (built on Click)      | Clean, modern Python CLI, shares models with backend    |
| Package Manager    | uv                          | Fast, modern Python package management                  |
| Testing            | pytest + pytest-asyncio     | Comprehensive testing for async code                    |
| Linting/Formatting | ruff + black                | Fast linting and formatting                             |

---

## Modular Architecture

The project is organized into **four clearly separated layers**, each with distinct responsibilities:

### 1. Database Layer (`backend/app/db/`)
**Responsibility**: Database schema, models, and data access

- **Models** (`models/`): SQLAlchemy ORM definitions
  - `user.py`, `project.py`, `story.py`, `task.py`, `comment.py`, `project_member.py`, `api_key.py`, `status_history.py`
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

- **Dependencies** (`dependencies.py`):
  - FastAPI Depends() functions to extract and validate tokens
  - Current user injection

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
  - Example: `project_service.py`, `task_service.py`, `time_tracking_service.py`

- **Routes** (`routes/`):
  - FastAPI router definitions
  - HTTP method handlers
  - Request/response parsing via schemas
  - Example: `projects.py`, `tasks.py`, `status_history.py`

- **Main** (`main.py`):
  - FastAPI app initialization
  - Route registration
  - Global middleware (CORS, error handling)

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
│   │   │   ├── task.py
│   │   │   ├── status_history.py
│   │   │   └── ...
│   │   └── base.py             # Base model class
│   ├── auth/
│   │   ├── security.py         # JWT, password hashing
│   │   ├── permissions.py      # RBAC logic
│   │   └── dependencies.py     # FastAPI dependencies
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

### Authentication Routes
```
POST   /auth/register          Register new user
POST   /auth/login             Login with email/password
POST   /auth/refresh           Refresh JWT token
GET    /auth/me                Get current user info
POST   /auth/logout            Invalidate token
POST   /auth/password-reset    Request password reset
```

### Project Routes
```
GET    /projects               List all projects (filtered by access)
POST   /projects               Create new project
GET    /projects/{id}          Get project details
PUT    /projects/{id}          Update project
DELETE /projects/{id}          Delete project
POST   /projects/{id}/archive  Archive project
POST   /projects/{id}/restore  Restore archived project
GET    /projects/{id}/members  List project members
POST   /projects/{id}/members  Add member to project
DELETE /projects/{id}/members/{user_id} Remove member
```

### Story Routes
```
GET    /projects/{project_id}/stories     List stories in project
POST   /projects/{project_id}/stories     Create story
GET    /stories/{id}                      Get story details
PUT    /stories/{id}                      Update story
DELETE /stories/{id}                      Delete story
```

### Task Routes
```
GET    /stories/{story_id}/tasks     List tasks in story
POST   /stories/{story_id}/tasks     Create task
GET    /tasks/{id}                   Get task details
PUT    /tasks/{id}                   Update task
DELETE /tasks/{id}                   Delete task
```

### Comment Routes
```
POST   /items/{item_type}/{item_id}/comments       Add comment
GET    /items/{item_type}/{item_id}/comments       List comments
PUT    /comments/{id}                              Update comment
DELETE /comments/{id}                              Delete comment
```

### Time Tracking Routes
```
GET    /items/{item_type}/{item_id}/status-history       Get full status change history
GET    /items/{item_type}/{item_id}/time-metrics         Get computed time metrics
                                                          (time per status, total elapsed)
GET    /projects/{project_id}/time-report                Project-level time metrics
GET    /users/{user_id}/time-report                      User-level time metrics
```

### Configuration Routes
```
GET    /config                   Get user configuration
PUT    /config                   Update user configuration
GET    /config/api-keys          List API keys
POST   /config/api-keys          Create new API key
DELETE /config/api-keys/{id}     Revoke API key
```

---

## CLI Commands Overview

```
spt auth login              Log in to the system
spt auth logout             Log out
spt auth whoami             Show current user

spt projects list           List all accessible projects
spt projects create         Create new project
spt projects view <id>      View project details
spt projects delete <id>    Delete a project

spt stories list <project>  List stories in a project
spt stories create <project> Create a new story
spt stories update <id>     Update story
spt stories delete <id>     Delete story

spt tasks list <story>      List tasks in a story
spt tasks create <story>    Create a new task
spt tasks update <id>       Update task
spt tasks delete <id>       Delete task
spt tasks assign <id> <user> Assign task to user

spt comments add <item> <text>  Add comment to an item

spt config set <key> <value>    Set configuration value
spt config get <key>            Get configuration value
```
