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

Neon uses a **branching model**: each branch has its own compute endpoint and connection URL. Use the `main` branch for production and create a separate `staging` branch — don't just create two databases on the same branch.

#### Create the Neon project

1. Sign up at [neon.tech](https://neon.tech) and click **New project**
2. Name it `simple-project-tool`, choose the region closest to your Railway deployment (e.g. `US East` for `us-east` Railway)
3. Neon creates a default `main` branch automatically — this is your **production** branch

#### Set up the production database (main branch)

1. In the dashboard sidebar, select the `main` branch → **Databases**
2. The default database is `neondb` — you can rename it to `production` or leave it as-is
3. Click **Connection Details** (top of the branch view)
4. Select **"Node.js"** from the driver dropdown to reveal the raw connection string
5. Copy the string and build two variants by changing the URL prefix:

   | Variable | Prefix | Used by |
   |----------|--------|---------|
   | `DATABASE_URL` | `postgresql+asyncpg://` | FastAPI app (async) |
   | `SYNC_DATABASE_URL` | `postgresql+psycopg2://` | Alembic migrations |

   Both must end with `?sslmode=require`. Example:
   ```
   postgresql+asyncpg://user:pass@ep-abc123.us-east-2.aws.neon.tech/neondb?sslmode=require
   postgresql+psycopg2://user:pass@ep-abc123.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

#### Create the staging branch

1. In the dashboard sidebar, click **Branches → New branch**
2. Name: `staging` — leave **Branch from** as `main` (copies the current schema)
3. Click **Create branch** — Neon provisions a new compute endpoint with a different host (e.g. `ep-xyz789...`)
4. Select the `staging` branch → **Connection Details**, copy the string, and build the same two URL variants as above using the staging host

   ```
   postgresql+asyncpg://user:pass@ep-xyz789.us-east-2.aws.neon.tech/neondb?sslmode=require
   postgresql+psycopg2://user:pass@ep-xyz789.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

#### Run migrations on staging (first time)

The Procfile runs `alembic upgrade head` automatically on each Railway deploy, but you may want to migrate staging manually before the first deploy:

```bash
cd backend
SYNC_DATABASE_URL="postgresql+psycopg2://user:pass@ep-xyz789.us-east-2.aws.neon.tech/neondb?sslmode=require" \
  uv run alembic upgrade head
```

#### Two Railway services (production + staging)

Create two services in the same Railway project, both pointing to the same GitHub repo. Give each service its own set of environment variables — the production service uses the `main` branch URLs, and the staging service uses the `staging` branch URLs.

### 1.2 Railway (Backend)

Railway runs the FastAPI backend as a containerised service. It reads the `Procfile` on every deploy, runs migrations, then starts the server.

#### Create account and project

1. Sign up at [railway.app](https://railway.app) (GitHub login is easiest — it will be used for repo access)
2. Click **New Project → Deploy from GitHub repo**
3. Authorise Railway to access your repositories if prompted
4. Select the `simple-project-tool` repo and click **Deploy Now**
5. Railway creates a project with one service named after the repo — rename it to `backend` via **Settings → Service Name**

#### Configure the service

Railway auto-detects the `Procfile` in `backend/` and uses it as the start command. You need to tell it where the app root is:

1. Open the service → **Settings → Source**
2. Set **Root Directory** to `backend` — this makes Railway run the Procfile from the right folder
3. Under **Deploy**, confirm the **Start Command** shows the Procfile contents:
   ```
   alembic upgrade head && uvicorn app.api.main:app --host 0.0.0.0 --port $PORT
   ```
   If it doesn't, paste it in manually.
4. Railway injects `$PORT` automatically — do not hardcode a port number

#### Set environment variables

1. Open the service → **Variables** tab → **Raw Editor**
2. Paste all variables at once (one `KEY=value` per line):

   ```
   DATABASE_URL=postgresql+asyncpg://user:pass@ep-abc123.us-east-2.aws.neon.tech/neondb?sslmode=require
   SYNC_DATABASE_URL=postgresql+psycopg2://user:pass@ep-abc123.us-east-2.aws.neon.tech/neondb?sslmode=require
   SECRET_KEY=<output of: openssl rand -hex 32>
   CORS_ORIGINS=https://your-app.vercel.app
   SENTRY_DSN=<from Sentry>
   DEBUG=false
   ADMIN_USERNAME=<choose>
   ADMIN_PASSWORD=<choose>
   ADMIN_SECRET=<output of: openssl rand -hex 32>
   FRONTEND_URL=https://your-app.vercel.app
   ADMIN_EMAIL=your@email.com
   ```

   See [Production Environment Variables](#production-environment-variables) for the full list including optional Mailgun keys. Railway redeploys automatically when you save.

3. Generate the two secrets locally before pasting:
   ```bash
   openssl rand -hex 32   # run twice: once for SECRET_KEY, once for ADMIN_SECRET
   ```

#### Find your public URL

1. After the first successful deploy, open the service → **Settings → Networking**
2. Click **Generate Domain** — Railway assigns a URL like `simple-project-tool-production.up.railway.app`
3. Copy this URL — you'll need it for:
   - `CORS_ORIGINS` and `FRONTEND_URL` (set in Railway itself, update if the domain changes)
   - `VITE_API_URL` in Vercel (see Section 1.3)

#### Set up a staging service

1. In the same Railway project, click **+ New → GitHub Repo** and select the same repo again
2. Name this service `backend-staging`
3. Configure identically (same Root Directory = `backend`, same Start Command)
4. In **Variables**, use the Neon `staging` branch URLs instead of production ones, and generate fresh `SECRET_KEY` / `ADMIN_SECRET` values
5. Generate a second domain for staging under **Settings → Networking**

Railway will now deploy both services on every push to `main`. If you want staging to deploy from a different branch (e.g. `develop`), change the branch under **Settings → Source → Branch**.

#### Check deploy logs

- **Build logs**: service → **Deployments** tab → click any deployment → **Build Logs**
- **Runtime logs**: service → **Logs** tab (live-streaming, searchable)
- Look for `INFO: Application startup complete` to confirm a healthy deploy
- If migrations fail, the error appears in the build log before the server starts

### 1.3 Vercel (Frontend)

1. Sign up at [vercel.com](https://vercel.com)
2. Import the GitHub repository
3. Configure:
   - **Framework**: Vite
   - **Root directory**: `frontend` ← this is the critical one
   - **Build command**: `npm run build`
   - **Output directory**: `dist`

   > **Why `frontend` as root?** The repo has no `package.json` at its root (backend is Python). With root set to `.`, Vercel's install step runs `npm install` where there's nothing to install, so `node_modules` is never created and `tsc` / `vite` are missing at build time. Setting root to `frontend` makes Vercel run `npm ci` there automatically.
4. Add environment variable: `VITE_API_URL` → your Railway backend URL (set after Railway deploy)

### 1.4 Sentry (Error Tracking)

> **Note:** `SENTRY_DSN` appears in the Railway environment variables but the backend SDK is not yet wired in. Complete both steps below — service setup and the one-time code change — to get error reporting working.

#### Create the Sentry project

1. Sign up at [sentry.io](https://sentry.io)
2. Click **Create Project** → choose platform **FastAPI** (under Python)
3. Name it `spt-backend`, select your team
4. On the next screen, copy the **DSN** (looks like `https://abc123@o123456.ingest.sentry.io/789`)
5. Add it to Railway as `SENTRY_DSN`

#### Wire the SDK into the backend

The SDK is not yet installed. Add it once:

1. Add the dependency:
   ```bash
   cd backend && uv add "sentry-sdk[fastapi]"
   ```

2. Initialise Sentry at the top of `app/api/main.py`, before the FastAPI app is created:
   ```python
   import sentry_sdk
   from app.core.config import settings

   if settings.SENTRY_DSN:
       sentry_sdk.init(
           dsn=settings.SENTRY_DSN,
           traces_sample_rate=0.2,   # 20% of requests for performance tracing
           send_default_pii=False,
       )
   ```

3. Add `SENTRY_DSN: str = ""` to the `Settings` class in `app/core/config.py` if it isn't there already

4. Commit and push — Railway redeploys and starts capturing unhandled exceptions automatically

#### Verify

Trigger a test error via the Sentry SDK:
```bash
curl https://your-app.up.railway.app/docs   # normal request — no error
```
Or add a temporary `/debug-sentry` route that calls `1/0`, hit it once, then remove it. The error should appear in the Sentry dashboard within a few seconds.

---

### 1.5 Mailgun (Email)

Mailgun is already fully integrated — the backend sends email via Mailgun's REST API using `httpx`. If `MAILGUN_API_KEY` is empty, all email sending is silently skipped (logged as a warning), so this is **optional** for initial deploys.

Four email types are sent:
- **Confirmation** — on registration, with a verify-email link
- **Password reset** — with a one-time reset link
- **Admin new-user notification** — to `ADMIN_EMAIL` when someone registers (only if set)
- **Project invitation** — when a manager invites someone to a project

#### Option A — Sandbox domain (fastest, testing only)

Mailgun provides a sandbox domain (`sandboxXXX.mailgun.org`) immediately on signup, but it can only deliver to **verified recipient addresses** you add manually.

1. Sign up at [mailgun.com](https://mailgun.com) → your sandbox domain is shown on the dashboard
2. Go to **Sending → Domains → sandbox… → Authorized Recipients** → add your own email address and verify it
3. Copy the sandbox domain name and your **Sending API key** (API Keys → Private API key)
4. Set in Railway:
   ```
   MAILGUN_API_KEY=key-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   MAILGUN_DOMAIN=sandboxXXXXXXXXXXXXXXXXXXXXXXXXXXXX.mailgun.org
   MAILGUN_FROM_EMAIL=noreply@sandboxXXX.mailgun.org
   MAILGUN_FROM_NAME=Simple Project Tool
   ```

#### Option B — Custom domain (production)

1. Sign up at [mailgun.com](https://mailgun.com) and go to **Sending → Domains → Add Domain**
2. Enter a subdomain of your own domain, e.g. `mail.yourdomain.com`
3. Add the DNS records Mailgun shows you (two TXT records + one MX record) in your DNS provider
4. Click **Verify DNS** — takes 15 minutes to a few hours
5. Once verified, copy the domain name and **Sending API key**
6. Set in Railway (same four vars as above, using your real domain)

#### Additional env vars used by email links

These must also be set in Railway or the links inside emails will point to localhost:

| Variable | Value |
|----------|-------|
| `FRONTEND_URL` | `https://your-app.vercel.app` (used in confirmation and reset links) |
| `ADMIN_EMAIL` | Your email address (optional — enables new-user registration alerts) |

#### Test email delivery

After setting the vars and redeploying, register a new account via the UI. You should receive a confirmation email. If you don't:
1. Check Railway logs for `WARNING: MAILGUN_API_KEY not configured` — means the var wasn't picked up
2. Check Railway logs for a non-200 HTTP response from Mailgun — usually a wrong domain or API key
3. Check the Mailgun dashboard → **Logs** for delivery status and any bounce/rejection details

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
