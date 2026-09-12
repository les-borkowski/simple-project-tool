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

## 5. MCP Server (optional)

`spt-mcp` exposes the API as an MCP (Model Context Protocol) server for LLM hosts like Claude Code or Claude Desktop. It authenticates with a scoped API key — an agent's permissions are exactly what that key's scopes allow, same as any other API key user.

**1. Create a scoped API key:**

```bash
cd backend
spt config api-keys create --label "claude-code" --scopes read:projects,read:stories,read:tasks,read:comments,write:tasks,write:comments
```

The key is printed once — save it.

**2. Register with Claude Code:**

```bash
claude mcp add spt -e SPT_API_KEY=<key> -e SPT_API_URL=http://localhost:8000 -- spt-mcp
```

**3. Or register with Claude Desktop**, by adding this to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "spt": {
      "command": "spt-mcp",
      "env": {
        "SPT_API_KEY": "<key>",
        "SPT_API_URL": "http://localhost:8000"
      }
    }
  }
}
```

`spt-mcp` also reads `SPT_LOCALE` (defaults to `en-GB`) and `SPT_TIMEOUT_SECONDS` (defaults to `30`). If `SPT_API_URL` is omitted it falls back to the CLI's configured API URL, then to `http://localhost:8000`.

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

### LLM / AI capture

All optional. With `GOOGLE_API_KEY` empty and no user supplying their own key, the capture
endpoints return `503 LLM_NOT_CONFIGURED` and every other feature works normally.

| Variable | Description | Default |
|----------|-------------|---------|
| `LLM_PROVIDER` | Active provider adapter. `replay` serves recorded fixtures for an offline demo | `google` |
| `LLM_MODEL` | Model id used when a user has not overridden it | `gemini-3.1-flash-lite` |
| `GOOGLE_API_KEY` | Server-wide Gemini key (empty = no server key) | empty |
| `LLM_TIMEOUT_SECONDS` | Deadline for one complete LLM call, retries and backoff included | `30` |
| `LLM_CAPTURE_MIN_CONFIDENCE` | Below this, an extracted task is marked low-confidence and starts unticked | `0.5` |
| `LLM_ALLOW_SERVER_KEY_FALLBACK` | Let users with no key of their own spend `GOOGLE_API_KEY`. Off by default: on a multi-tenant deployment this is the operator's own bill | `False` |
| `LLM_MAX_RPM` | Requests per minute ceiling per user | `20` |
| `LLM_MAX_TPM` | Tokens per minute ceiling per user | `100000` |
| `CAPTURE_REFERENCE_DATE` | Demo only — pins the "today" the extractor reasons from. **Must be empty in production** | empty |
| `DEMO_SEED_PASSWORD` | Password for accounts created by `scripts.demo_capture seed`. Never set on a real deployment | empty |

### Credential encryption

| Variable | Description | Default |
|----------|-------------|---------|
| `CREDENTIAL_ENCRYPTION_KEY` | Comma-separated Fernet keys, **newest first**. Empty disables user-supplied LLM keys | empty |

Generate one with:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Rotating it is a three-step job, and skipping the middle step strands every stored
credential — the capture path reads an undecryptable credential as "no credential", so
users silently fall back to the server key instead of seeing an error:

```bash
# 1. prepend the new key, keeping the old one
CREDENTIAL_ENCRYPTION_KEY=<new>,<old>

# 2. re-encrypt everything under the new key
uv run python -m scripts.rotate_credentials    # --dry-run to preview

# 3. drop the old key
CREDENTIAL_ENCRYPTION_KEY=<new>
```

### API keys

| Variable | Description | Default |
|----------|-------------|---------|
| `API_KEY_LEGACY_PREFIX_FALLBACK` | Keep matching API keys issued before `key_prefix` existed. Those rows can only be rotated, not backfilled; set to `False` once they are gone | `True` |

Check whether any remain:

```sql
SELECT count(*) FROM api_keys WHERE key_prefix = '' AND revoked_at IS NULL;
```

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
