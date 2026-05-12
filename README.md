# simple-project-tool

A minimalist project management app with an API-first design. Organise work into a three-level hierarchy — Projects, Stories, and Tasks — accessible via a web UI, a command-line interface, or directly through the REST API (ideal for AI agent integrations).

---

## Features

### Work Hierarchy

```
Project
└── Story (optional grouping)
    └── Task
```

Tasks can belong directly to a project or be nested inside a story. Every level supports:

- **Status**: `to_do` → `in_progress` → `in_review` → `in_testing` → `done`
- **Priority**: `low` · `medium` · `high`
- **Comments** with markdown support
- **Status history** — immutable audit trail with elapsed-time tracking

### Roles & Access Control

| Role | Capabilities |
|------|-------------|
| **Manager** | Create/delete/archive items, invite members, manage roles |
| **Contributor** | View items, update status, add comments |

Per-project roles override the user's global role. Project owners always have Manager access.

### Sprints

Group tasks into time-boxed sprints with start/end dates. View sprint progress and task assignments per sprint.

### Time Tracking

Every status transition is recorded. Query time-in-status metrics at the project, story, or task level. Generate aggregate time reports per project or per user.

### Email Notifications (via Mailgun)

- Email confirmation on registration
- Password reset emails
- Project invitation emails
- Admin notification on new user sign-up

### API Keys for AI Agents

Generate scoped API keys from the config page to give AI agents or automation tools read/write access to your projects without sharing user credentials.

### CLI

Full command-line interface mirroring the web UI — authenticate, manage projects/stories/tasks, add comments, handle invitations, and query time metrics.

### Internationalisation

UI available in **English (en-GB)** and **Polish (pl)**.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | Python · FastAPI · SQLAlchemy (async) · PostgreSQL · Alembic |
| Auth | PyJWT · bcrypt |
| Frontend | React 19 · TypeScript · Vite · Tailwind CSS |
| CLI | Typer |
| Email | Mailgun |
| Testing | pytest · pytest-asyncio |
| Linting | ruff (Python) · ESLint (TypeScript) |
| Package manager | uv |

---

## Quick Start

```bash
# 1. Start the database (Docker)
docker compose up -d postgres

# 2. Backend
cd backend
uv sync
cp .env.example .env   # edit with your DB credentials
uv run alembic upgrade head
uv run python -m app.main   # → http://localhost:8000

# 3. Frontend (separate terminal)
cd frontend
npm install
npm run dev   # → http://localhost:5173

# 4. CLI (optional)
cd backend
uv pip install -e .
spt auth login
```

For full setup instructions (Docker, local PostgreSQL, environment variables, tests) see [**docs/how-to-run.md**](docs/how-to-run.md).

---

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/how-to-run.md](docs/how-to-run.md) | Full local development setup |
| [docs/architecture.md](docs/architecture.md) | System architecture, data model, API conventions |
| [docs/deployment.md](docs/deployment.md) | Production deployment guide (Railway + Neon + Vercel) |
| [docs/changelog.md](docs/changelog.md) | Release history |

**API reference**: Swagger UI at `http://localhost:8000/docs` when running locally.
