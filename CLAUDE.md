# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Scope

**Project name**: simple-project-tool

**Purpose**: A minimalist project management application for organizing work across multiple projects with API-first architecture. Supports both web UI and CLI access, human users and AI agents as contributors.

**Key features**:
- Three-level hierarchy: Projects → Stories → Tasks
- Two user roles: Manager and Contributor with different permissions (global + per-project override)
- Status tracking (to_do, in_progress, in_review, in_testing, done) and priority levels (low, medium, high)
- Comments on any item
- Project member management with invitations
- API key support for AI agents and integrations
- Full REST API with OpenAPI docs
- CLI tool for terminal-based workflows

See `requirements.md` for complete specification including data model, API routes, and CLI commands.

## Tech Stack

**Backend**: Python + FastAPI, SQLAlchemy ORM, PostgreSQL, Alembic migrations
**Frontend**: React + TypeScript + Vite, Tailwind CSS
**CLI**: Typer (built on Click)
**Auth**: PyJWT + bcrypt
**Testing**: pytest + pytest-asyncio
**Linting/Formatting**: ruff (check + format)
**Package Manager**: uv

## Development Setup

### Prerequisites
- Python 3.11+
- PostgreSQL 13+
- Node.js 18+ (for frontend)
- uv (Python package manager)

### Backend Setup
```bash
cd backend
uv sync                    # Install Python dependencies
cp .env.example .env       # Create env config (update DB_URL, SECRET_KEY)
uv run alembic upgrade head  # Run migrations
uv run python -m app.main  # Start server (localhost:8000)
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev                # Start dev server (localhost:5173)
```

### CLI Setup
```bash
cd backend
uv pip install -e .       # Install CLI in editable mode
spt --help               # Verify installation
```

## Commands

### Backend (Python)
```bash
uv run pytest                    # Run all tests
uv run pytest tests/test_auth.py -v  # Run single test file
uv run pytest -k "test_login"    # Run tests matching pattern
uv run ruff check .              # Lint code
uv run ruff format .             # Format code
uv run alembic revision --autogenerate -m "message"  # Create migration
uv run alembic upgrade head      # Apply migrations
```

### Frontend (React)
```bash
npm run dev       # Dev server
npm run build     # Production build
npm run lint      # Lint with ESLint
```

### CLI
```bash
spt auth login
spt projects list
spt projects create --name "My Project"
```

## Modular Architecture

The project is **organized into four clearly separated layers**, each with distinct responsibilities:

### 1. Database Layer (`backend/app/db/`)
Models, migrations, schema, and data access. No business logic.
- `models/`: SQLAlchemy ORM definitions (`user.py`, `project.py`, `task.py`, `status_history.py`, `invitation.py`, `user_config.py`, etc.)
- `migrations/`: Alembic version control (one per schema change, reversible)
- `database.py`: Connection pooling, session management

### 2. Authentication Layer (`backend/app/auth/`)
User auth, permissions, credential management. Not tied to any specific API.
- `security.py`: JWT generation/validation (PyJWT), password hashing (bcrypt)
- `permissions.py`: RBAC logic, permission checking, role precedence (global vs per-project)
- `dependencies.py`: FastAPI Depends() for token extraction, validation, and API key auth

### 3. API Layer (`backend/app/api/`)
HTTP request/response handling, orchestration, business logic.
- `schemas/`: Pydantic request/response models
- `services/`: Business logic (create, update, delete); calls DB and auth
- `routes/`: FastAPI endpoints; calls services

**Key principle**: Routes only handle HTTP. Services enforce permissions via the auth layer and contain business logic. No route should query the DB directly.

### 4. UI Layer (`frontend/`)
React frontend, separate deployment. Communicates only via REST API.
- `src/components/`, `src/pages/`: React components
- `src/services/api.ts`: HTTP client wrapper
- `src/context/`: Global state (auth, user)

### Data Flow
```
UI → [API routes] → [Services + Auth] → [DB models] → [Auth] → [API response] → UI
```

**Critical Design Pattern**: Routes should not query DB directly; they call services. Services check permissions and query the DB. This keeps auth logic centralized.

### Three-Level Work Hierarchy
**Project** → **Story** → **Task**

Each level has: status (to_do, in_progress, in_review, in_testing, done), priority (low, medium, high), comments, timestamps.

**Status History Tracking**: Every status change is recorded in `StatusHistory` table with timestamp and who changed it. Enables time tracking (elapsed time per status, total item lifetime).

### Module Organization (Backend)
```
backend/
├── app/
│   ├── db/
│   │   ├── models/          # SQLAlchemy ORM (user, project, task, etc.)
│   │   ├── database.py      # Session management
│   │   └── base.py          # Base model
│   ├── auth/
│   │   ├── security.py      # JWT, bcrypt
│   │   ├── permissions.py   # RBAC
│   │   └── dependencies.py  # FastAPI Depends
│   ├── api/
│   │   ├── schemas/         # Pydantic models
│   │   ├── services/        # Business logic
│   │   ├── routes/          # API endpoints
│   │   └── main.py          # App init, route registration
│   └── cli/                 # Typer CLI (mirrors API routes)
├── migrations/              # Alembic
└── tests/                   # Per-layer tests
```

### Frontend Organization
```
frontend/
├── src/
│   ├── components/          # Reusable UI components
│   ├── pages/               # Full-page views
│   ├── services/api.ts      # HTTP client (fetch/axios wrapper)
│   ├── context/             # Global state (auth, user, theme)
│   ├── hooks/               # Custom React hooks
│   └── App.tsx              # Root
└── tailwind.config.js       # Styling config
```

## Key Design Patterns

- **JWT Authentication**: Stateless, token-based. Tokens expire; refresh endpoint provided.
- **Role-Based Access Control (RBAC)**: Enforced at service layer; FastAPI dependencies check permissions.
- **Role Precedence**: Per-project role overrides global role. Project owner always has Manager access.
- **Status History Tracking**: Every status change is recorded in `StatusHistory` (immutable append-only). Uses separate nullable FKs with CHECK constraint for referential integrity.
- **Comment/StatusHistory FK Pattern**: Both use `(project_id, story_id, task_id)` with `CHECK (num_nonnulls(...) = 1)` instead of polymorphic `item_type + item_id`. Allows DB-level foreign key enforcement.
- **API Versioning**: All routes prefixed with `/api/v1/`.
- **PATCH for partial updates**: Use PATCH (not PUT) when updating individual fields.
- **Cursor-based Pagination**: List endpoints use `?cursor=<id>&limit=25` (max 100).
- **Error Responses**: Standard JSON format: `{"error": {"code": "...", "message": "...", "details": [...]}}`.
- **API Key Scopes**: `read:projects`, `write:projects`, `read:stories`, `write:stories`, `read:tasks`, `write:tasks`, `read:comments`, `write:comments`, `admin`.

## Testing Strategy

- **Unit Tests**: Service layer logic (auth, permissions, business rules)
- **Integration Tests**: Full request/response cycles via FastAPI TestClient
- **Database Tests**: Use transactions and rollback to keep tests isolated
- **Fixtures**: Shared test users, projects, and data in `tests/conftest.py`

Run coverage: `uv run pytest --cov=app --cov-report=html`

## Important Notes

- **Database Migrations**: Always use Alembic for schema changes; never modify models without a migration.
- **Security**: API keys and JWT secrets must be in environment variables (`.env`), never committed.
- **CORS**: Configure for frontend origin during development/production.
- **Async**: FastAPI uses async; database calls should use `async with` or sync_to_async wrappers.
- **API Documentation**: Auto-generated at `/docs` (Swagger UI) and `/redoc` (ReDoc); keep docstrings updated.
