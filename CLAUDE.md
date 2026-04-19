# CLAUDE.md

Guidance for Claude Code when working with this repository.

## Quick Overview

**simple-project-tool** — Minimalist project management app (Projects → Stories → Tasks) with API-first architecture. Supports web UI, CLI, and AI agent integrations.

For detailed architecture, tech stack, data models, and API structure, see **[`docs/architecture.md`](../docs/architecture.md)**.

## Key Facts

- **Backend**: Python + FastAPI + PostgreSQL + Alembic
- **Frontend**: React 19 + TypeScript + Vite + Tailwind
- **Auth**: JWT (stateless) + bcrypt, Role-based access control (Manager/Contributor)
- **Features**: Three-level hierarchy, status tracking, comments, member management, API keys for agents
- **i18n**: en-GB, pl (via i18next)

## Essential Commands

### Backend (Python)
```bash
cd backend
uv sync                           # Install
cp .env.example .env              # Create env config
uv run alembic upgrade head       # Migrate DB
uv run python -m app.main         # Start server (localhost:8000)

uv run pytest                     # Tests
uv run ruff check . && ruff format .  # Lint + format
uv run alembic revision --autogenerate -m "message"  # New migration
```

### Frontend (React)
```bash
cd frontend
npm install
npm run dev                       # Dev server (localhost:5173)
npm run build                     # Prod build
npm run lint                      # Lint
```

### API Docs
- **Swagger**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

## Architecture (Quick Reference)

**Four layers:**
1. **Database** (`app/db/`) — ORM models, migrations
2. **Auth** (`app/auth/`) — JWT, RBAC (decoupled from routes)
3. **API** (`app/api/`) — Routes → Services (business logic) → Database
4. **Frontend** (`frontend/src/`) — React pages, hooks, context

**Critical pattern**: Routes call services. Services enforce permissions and query DB. No direct DB queries in routes.

**Data model**:
- Project → Story (optional) → Task
- Task can exist without a story (directly under project)
- Each level has: status, priority, comments, status history
- Status history is immutable (audit trail + time tracking)

## Working with the Code

### Adding an API Endpoint

1. Create schema in `backend/app/api/schemas/`
2. Create service function in `backend/app/api/services/`
3. Add route in `backend/app/api/routes/`
4. Update `frontend/src/services/api.ts` with client method
5. Use in React component via `useEffect` hook or mutation

### Modifying Database

1. Edit `backend/app/db/models/*.py`
2. Run `uv run alembic revision --autogenerate -m "description"`
3. Review migration file
4. Run `uv run alembic upgrade head`

### Adding New Feature

- **Auth-dependent logic**: Service function checks `require_project_access()`, `resolve_role()`, etc.
- **Frontend**: Use `useRole()` hook to check if user is manager (for UI visibility)
- **RBAC**: Enforced at service layer, not in routes

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| PATCH not PUT | Partial updates only; simpler clients |
| Cursor pagination | Stable offsets; efficient for large datasets |
| Service layer | Centralized permission + business logic checking |
| Status history | Immutable append-only audit trail + time tracking |
| `(project_id, story_id, task_id)` FK pattern | DB-level referential integrity; no polymorphic mess |
| Tasks without stories | Board view can show project-level tasks + story-level tasks |
| Project-level task URL | `/projects/:projectId/tasks/:taskId` — no default/phantom story; backend `GET /tasks/{id}` needs no story_id; frontend route added alongside `/stories/:storyId/tasks/:taskId` |

## Important Notes

- **Migrations**: Always use Alembic; never modify models without a migration file
- **Security**: `.env` file with secrets (DB_URL, SECRET_KEY); never commit
- **Async**: FastAPI is async; database calls use async driver (asyncpg)
- **i18n**: Add keys to both `en-GB.json` and `pl.json`
- **Roles**: Manager (create/delete/manage), Contributor (view/update status/comment). Per-project role overrides global role.
- **Type safety**: Use TypeScript frontend types, Pydantic schemas backend (enforce at boundaries)

## References

- **Full Architecture**: [`docs/architecture.md`](../docs/architecture.md)
- **API Spec**: See `requirements.md` or auto-generated Swagger UI at `/docs`
- **Tests**: `backend/tests/` — conftest.py has fixtures
- **Coverage**: `uv run pytest --cov=app --cov-report=html`
