# Deployment Guide

**Target**: Production deployment for portfolio use  
**Stack**: Railway (backend) + Neon (database) + Vercel (frontend)  
**Estimated cost**: $0–5/month

---

## Architecture

```
GitHub (main branch)
        │
        ▼
GitHub Actions CI
  ├─ pytest + ruff
  ├─ eslint + vite build
  └─ Docker image build
        │
   ┌────┴────┐
   ▼         ▼
Railway    Vercel
(Backend)  (Frontend)
   │
   ▼
Neon PostgreSQL
```

**Services:**

| Service | Component | Free Tier | Cost |
|---------|-----------|-----------|------|
| [Railway](https://railway.app) | FastAPI backend | $5 credit/month | $0–2/month |
| [Neon](https://neon.tech) | PostgreSQL | 3 GB | $0 |
| [Vercel](https://vercel.com) | React frontend | Unlimited bandwidth | $0 |
| [GitHub Actions](https://github.com/features/actions) | CI/CD | 2,000 min/month | $0 |
| [Sentry](https://sentry.io) | Error tracking | 5,000 errors/month | $0 |

---

## Step 1 — Set Up External Services

### 1.1 Neon (Database)

1. Sign up at [neon.tech](https://neon.tech)
2. Create project: `simple-project-tool`
3. Create two databases: `production` and `staging`
4. Copy the connection strings for each:
   - **Async URL** (asyncpg): `postgresql+asyncpg://user:pass@ep-xxx.region.aws.neon.tech/production?sslmode=require`
   - **Sync URL** (psycopg2, for migrations): `postgresql+psycopg2://user:pass@ep-xxx.region.aws.neon.tech/production?sslmode=require`

### 1.2 Railway (Backend)

1. Sign up at [railway.app](https://railway.app)
2. Create new project: `simple-project-tool`
3. Link your GitHub repository
4. Set environment variables (see [Production Environment Variables](#production-environment-variables))

### 1.3 Vercel (Frontend)

1. Sign up at [vercel.com](https://vercel.com)
2. Import the GitHub repository
3. Configure:
   - **Framework**: Vite
   - **Build command**: `cd frontend && npm run build`
   - **Output directory**: `frontend/dist`
   - **Root directory**: `.`
4. Add environment variable: `VITE_API_URL` → your Railway backend URL (set after Railway deploy)

### 1.4 Sentry (Error Tracking)

1. Sign up at [sentry.io](https://sentry.io)
2. Create a Python project: `spt-backend`
3. Copy the DSN — add it to Railway as `SENTRY_DSN`

---

## Step 2 — Create Deployment Files

### `backend/Dockerfile`

```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN pip install uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY . .

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s CMD curl -f http://localhost:8000/health || exit 1

CMD ["uv", "run", "uvicorn", "app.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### `backend/Procfile`

```
web: alembic upgrade head && uvicorn app.api.main:app --host 0.0.0.0 --port $PORT
```

Railway runs this command on every deploy. Migrations run before the server starts.

### `backend/.dockerignore`

```
__pycache__
.git
.env
.pytest_cache
*.pyc
.venv
tests/
```

### `.github/workflows/deploy.yml`

```yaml
name: CI/CD

on:
  push:
    branches: [main]

jobs:
  test-backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: spt
          POSTGRES_PASSWORD: password
          POSTGRES_DB: spt_test
        ports: ["5432:5432"]
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
      - run: cd backend && uv sync
      - run: cd backend && uv run pytest
        env:
          TEST_DATABASE_URL: postgresql+asyncpg://spt:password@localhost:5432/spt_test
          SECRET_KEY: test-secret-key-32-bytes-hex-here

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
      - run: cd backend && uv sync && uv run ruff check .
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: cd frontend && npm ci && npm run lint

  deploy:
    needs: [test-backend, lint]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master  # or railway deploy action
      # Add your deployment step here (Railway CLI or webhook)
```

---

## Step 3 — Production Environment Variables

Set these in the Railway dashboard under **Variables**:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Neon production async URL |
| `SYNC_DATABASE_URL` | Neon production sync URL |
| `SECRET_KEY` | `openssl rand -hex 32` |
| `CORS_ORIGINS` | `https://your-app.vercel.app` |
| `SENTRY_DSN` | From Sentry project |
| `DEBUG` | `false` |
| `ADMIN_USERNAME` | Choose a secure username |
| `ADMIN_PASSWORD` | Choose a secure password |
| `ADMIN_SECRET` | `openssl rand -hex 32` |
| `MAILGUN_API_KEY` | From Mailgun (optional) |
| `MAILGUN_DOMAIN` | Your Mailgun domain |
| `MAILGUN_FROM_EMAIL` | Sending address |
| `MAILGUN_FROM_NAME` | Display name |
| `FRONTEND_URL` | `https://your-app.vercel.app` |
| `ADMIN_EMAIL` | Email for new-user notifications (optional) |

---

## Step 4 — First Deploy

1. Commit all new deployment files to `main`
2. GitHub Actions runs tests and lint
3. Railway auto-detects the push and redeploys:
   - Runs `alembic upgrade head`
   - Starts the API server
4. Vercel auto-deploys the frontend
5. Set `VITE_API_URL` in Vercel to the Railway URL, redeploy frontend

---

## Verification Checklist

### Backend
- [ ] `GET /health` returns `{"status": "ok"}`
- [ ] Swagger UI accessible at `/docs`
- [ ] Migrations applied (check Railway logs)
- [ ] CORS allows Vercel domain

### Frontend
- [ ] Page loads without blank screen
- [ ] Can register and log in
- [ ] Can create a project and add tasks
- [ ] Comments and status updates work

### Database
- [ ] Data persists across redeployments
- [ ] Connection from Railway is healthy (Neon dashboard)

### CI/CD
- [ ] Push to `main` triggers GitHub Actions
- [ ] Tests pass before deploy
- [ ] Railway redeployes on successful build

---

## Ongoing Operations

| Task | Frequency | Tool |
|------|-----------|------|
| Check for errors | As needed | Sentry dashboard |
| View backend logs | As needed | Railway dashboard |
| Monitor DB storage | Monthly | Neon dashboard (3 GB free) |
| Check Railway costs | Monthly | Railway dashboard ($5 credit) |
