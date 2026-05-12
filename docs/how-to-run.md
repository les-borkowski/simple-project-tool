# How to Run — simple-project-tool

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Python | 3.11+ | |
| Node.js | 18+ | |
| PostgreSQL | 13+ | or Docker |
| [uv](https://docs.astral.sh/uv/) | latest | Python package manager |
| Docker (optional) | any | for local database |

---

## 1. Database

### Option A — Docker Compose (recommended)

```bash
docker compose up -d postgres
```

This starts PostgreSQL on port `5432`. A pgAdmin instance is also available at `http://localhost:5050` (login: `admin@admin.com` / `root`).

### Option B — Local PostgreSQL

Create a database and user manually:

```sql
CREATE USER spt WITH PASSWORD 'password';
CREATE DATABASE simple_project_tool OWNER spt;
CREATE DATABASE spt_test OWNER spt;  -- for tests
```

---

## 2. Backend

```bash
cd backend

# Install dependencies
uv sync

# Create environment config
cp .env.example .env
```

Edit `.env` with your values (see [Environment Variables](#environment-variables) below), then:

```bash
# Apply database migrations
uv run alembic upgrade head

# Start the API server
uv run python -m app.main
```

The API is now running at `http://localhost:8000`.  
Swagger UI: `http://localhost:8000/docs`

---

## 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

The UI is now running at `http://localhost:5173`.

---

## 4. CLI (optional)

```bash
cd backend
uv pip install -e .

# Authenticate
spt auth login

# Try it
spt projects list
```

---

## Environment Variables

All variables live in `backend/.env`. Copy from `backend/.env.example` and fill in the values.

### Database

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Async PostgreSQL URL (asyncpg driver) | `postgresql+asyncpg://spt:pass@localhost:5432/simple_project_tool` |
| `SYNC_DATABASE_URL` | Sync PostgreSQL URL (psycopg2, used by Alembic migrations) | `postgresql+psycopg2://spt:pass@localhost:5432/simple_project_tool` |
| `TEST_DATABASE_URL` | Async URL for the test database | `postgresql+asyncpg://spt:pass@localhost:5432/spt_test` |

For hosted Neon databases, append `?sslmode=require` to each URL.

### Authentication

| Variable | Description | Default |
|----------|-------------|---------|
| `SECRET_KEY` | 32-byte hex key for signing JWTs | — (required, generate with `openssl rand -hex 32`) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token lifetime | `15` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token lifetime | `7` |
| `CORS_ORIGINS` | Comma-separated allowed origins | `http://localhost:5173` |

### Admin Panel

| Variable | Description |
|----------|-------------|
| `ADMIN_USERNAME` | Username for the admin dashboard (`/admin`) |
| `ADMIN_PASSWORD` | Password for the admin dashboard |
| `ADMIN_SECRET` | 32-byte hex key for admin session signing |
| `ADMIN_EMAIL` | Email to notify on new user registration (leave empty to disable) |

### Email (Mailgun)

Email sending is disabled when `MAILGUN_API_KEY` is empty — the app works fully without it.

| Variable | Description | Example |
|----------|-------------|---------|
| `MAILGUN_API_KEY` | Mailgun API key (empty = email disabled) | `key-...` |
| `MAILGUN_DOMAIN` | Mailgun sending domain | `mg.yourdomain.com` |
| `MAILGUN_FROM_EMAIL` | From address | `noreply@yourdomain.com` |
| `MAILGUN_FROM_NAME` | From display name | `Simple Project Tool` |
| `FRONTEND_URL` | Base URL included in email links | `http://localhost:5173` |

---

## Running Tests

```bash
cd backend

# Run all tests
uv run pytest

# With coverage report
uv run pytest --cov=app --cov-report=html
```

Ensure `TEST_DATABASE_URL` is set and the test database exists before running tests.

---

## Linting

```bash
# Backend
cd backend
uv run ruff check .
uv run ruff format .

# Frontend
cd frontend
npm run lint
```

---

## Database Migrations

```bash
cd backend

# Apply all pending migrations
uv run alembic upgrade head

# Create a new migration after editing ORM models
uv run alembic revision --autogenerate -m "describe the change"

# Review the generated file in backend/migrations/versions/ before committing
```

Always use Alembic — never modify database schema by hand.
