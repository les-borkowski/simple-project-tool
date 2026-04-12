# Quick Start Guide

Get the app running locally in 3 steps: backend, CLI, and frontend.

## Prerequisites

- Python 3.11+
- Docker & Docker Compose (for PostgreSQL)
- Node.js 18+
- `uv` (Python package manager)

## Database Setup (Docker)

Start a PostgreSQL container:

```bash
docker run --name spt-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=simple_project_tool \
  -p 5432:5432 \
  -d postgres:15
```

**Verify**: Check the container is running:
```bash
docker ps | grep spt-postgres
```

**Stop/Remove** (when done developing):
```bash
docker stop spt-postgres
docker rm spt-postgres
```

### Database URL

For your `.env` file (Backend Setup section below):
```
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/simple_project_tool
SYNC_DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/simple_project_tool
TEST_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/simple_project_tool
```

## Backend Setup

**Ensure PostgreSQL container is running** (see Database Setup above).

```bash
cd backend
uv sync                      # Install dependencies
cp .env.example .env         # Create config (update DATABASE_URL, SYNC_DATABASE_URL, SECRET_KEY)
uv run alembic upgrade head  # Run migrations
uv run python -m app.main    # Start server (http://localhost:8000)
```

**Verify**: Visit http://localhost:8000/docs for API documentation.

## CLI Setup

From the `backend` directory (while Python dependencies are installed):

```bash
uv pip install -e .          # Install CLI in editable mode
spt --help                    # Verify installation
```

**Try it**:
```bash
spt auth login               # Login with credentials
spt projects list            # List all projects
spt projects create --name "My Project"  # Create a project
```

## Frontend Setup

```bash
cd frontend
npm install
npm run dev                  # Start dev server (http://localhost:5173)
```

**Verify**: Open http://localhost:5173 in your browser.

## Common Commands

### Backend
```bash
uv run pytest                # Run all tests
uv run ruff check .          # Lint
uv run ruff format .         # Format code
```

### Frontend
```bash
npm run build                # Production build
npm run lint                 # Lint
```

## That's it!

The three services are now running:
- **API**: http://localhost:8000 (with docs at `/docs`)
- **CLI**: `spt` command (try `spt --help`)
- **UI**: http://localhost:5173
