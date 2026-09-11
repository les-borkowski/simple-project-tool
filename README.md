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

- **Status**: per-project configurable workflow; each project starts with `to_do`, `in_progress`, `in_review`, `done` and can add, rename, recolour, or reorder its own statuses
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

### Natural-Language Task Capture

Type a sentence describing one or more tasks — "ask Anna to review the checkout flow by Friday" — and the system extracts structured candidates (title, due date, assignee, story, priority) using an LLM (Large Language Model). You review and edit the candidates; nothing is ever created without an explicit confirm step.

**Preview → confirm, guaranteed.** `POST /projects/{id}/tasks/capture` is read-only — it never writes to the database, so it's safe to call speculatively (e.g. on every keystroke pause). `POST /projects/{id}/tasks/capture/confirm` is the only endpoint that creates tasks, and it does so all-or-nothing across the batch. This is exposed today via:

- the **"Quick capture"** action on the project board (web UI)
- `spt tasks capture <project_id> "<text>"` (CLI — supports a scoped API key via `--api-key`/`SPT_API_KEY` for headless/agent use instead of a login)
- the two REST endpoints directly, for custom agent integrations — both require a `write:tasks`-scoped API key or a logged-in session

Each user can also configure their own personal LLM API key (currently only Google Gemini) instead of relying solely on the server-wide key — via Settings → "AI Providers" in the web UI, or `spt config llm set google` on the CLI (prompts for the key with hidden input, so it never lands in shell history as a plain argument).

**Resolution order**: user's default credential → server key (only if `LLM_ALLOW_SERVER_KEY_FALLBACK=true`) → `503 LLM_NOT_CONFIGURED`.

**Configuration** (backend `.env`):

| Variable | Default | Notes |
|---|---|---|
| `LLM_PROVIDER` | `google` | only `google` is implemented today |
| `LLM_MODEL` | `gemini-3.1-flash-lite` | pin — see model selection note below |
| `GOOGLE_API_KEY` | *(empty)* | the server-wide fallback key; leave empty to disable server-key fallback entirely |
| `LLM_TIMEOUT_SECONDS` | `30` | |
| `LLM_CAPTURE_MIN_CONFIDENCE` | `0.5` | extracted tasks below this confidence are flagged `low_confidence` in the API/UI/CLI, not dropped |
| `CREDENTIAL_ENCRYPTION_KEY` | *(empty)* | required before any user can save a personal credential — an empty value means `503 CREDENTIAL_STORAGE_UNAVAILABLE` on save. Generate one with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. A dedicated key, deliberately not derived from `SECRET_KEY`, so rotating one never invalidates the other |
| `LLM_ALLOW_SERVER_KEY_FALLBACK` | `True` | when `false`, a user with no personal credential gets a clean `503 LLM_NOT_CONFIGURED` instead of silently falling back to `GOOGLE_API_KEY` — how a public/multi-tenant deployment stops involuntarily funding everyone's LLM usage off one shared key |
| `LLM_MAX_RPM` | `20` | server-wide default requests-per-minute ceiling per user; an admin can override it per user, and a user's own credential-level RPM limit can only clamp below this ceiling, never above it |
| `LLM_MAX_TPM` | `100000` | same shape, tokens-per-minute |
| `CAPTURE_REFERENCE_DATE` | *(empty)* | demo/replay only — pins the "today" the extractor reasons from so recorded fixtures keep matching. Overrides the date the client sends; leave empty in production |

Demo accounts (`is_demo`) are additionally capped at **one capture per 2 hours**, regardless of the ceilings above. They can never hold a personal credential, so every demo capture spends the server's own key; the allowance is claimed *before* the provider call, so an attempt that times out still counts.

An empty `GOOGLE_API_KEY` with `LLM_ALLOW_SERVER_KEY_FALLBACK=true` (the default) still disables capture for users with no personal credential — they get `503 LLM_NOT_CONFIGURED` rather than a crash. Capture is an optional, additive feature.

This feature adds three user-facing surfaces:

- **CLI**: `spt config llm list` / `spt config llm providers` / `spt config llm set <provider>` / `spt config llm delete <provider>` — manage your own credential from the terminal.
- **Web UI**: Settings → "AI Providers" tab — save/clear your key, see status ("Not configured" / "Configured (…xxxx)"), set a model override and RPM/TPM limits (shown clamped to your effective ceiling).
- **Admin**: the admin users list page has an "LLM limits" column per user — an admin can view last-60-second usage and set/clear a per-user RPM/TPM ceiling that overrides the server default.

The model pin went through two corrections during development: the originally-planned model had already been retired for new API keys, and a second candidate's free tier was rate-limited to 20 requests/day, too low for practical use. `gemini-3.1-flash-lite` is the model actually verified live and is the current pin.

**Privacy.** When a user submits capture text, that text plus the **display names** (never emails, never internal IDs) of project members and the **names** of a project's stories are sent to Google's Gemini API, so the model can resolve references like "assign it to Anna" and match stories by name. Free-tier API terms may permit the provider to use submitted prompts to improve their products — don't point this feature at real or sensitive project data without checking the current terms for whichever tier is in use. Users should be aware that capture text leaves the local server whenever the feature is enabled.

#### Demoing offline

`LLM_PROVIDER=replay` swaps the Gemini client for one that serves recorded fixtures from `backend/evals/fixtures/responses/`, so capture works with no API key and no network. Fixtures are keyed by a hash of the full prompt — which embeds the project name, member names, story titles, and the reference date — so a fixture only replays against the exact project it was recorded for.

`backend/scripts/demo_capture.py` sets that up:

```bash
uv run python -m scripts.demo_capture seed                          # idempotent demo project + members + stories
uv run python -m scripts.demo_capture record --as-user <email>      # one live call per phrase, writes fixtures
LLM_PROVIDER=replay CAPTURE_REFERENCE_DATE=2026-09-04 uv run python -m app.main
```

The demo phrases and project shape live in `backend/evals/fixtures/demo_script.json` — edit that and re-run `record` to change the script. Recording needs a real key: `GOOGLE_API_KEY` if set, otherwise `--as-user` names an account whose stored credential to borrow. Anything typed during the demo that isn't a recorded phrase raises `FixtureMissError` → `503`, so it's a scripted demo, not a sandbox.

#### Eval harness

Extraction quality is tracked with an eval harness in `backend/evals/`. Latest run: model `gemini-3.1-flash-lite`, prompt version `capture/v1`, run on 2026-09-04, 35 cases.

**Overall**

| field | rate | hits/total |
| --- | --- | --- |
| count | 96.6% |  |
| title | 91.7% | 33/36 |
| title_mean_f1 | 0.940 | - |
| due_date | 100.0% | 36/36 |
| assignee | 91.7% | 33/36 |
| story | 80.6% | 29/36 |
| priority | 91.7% | 33/36 |
| not_a_task | 100.0% |  |

**Per-tag**

| tag | count | title | due_date | assignee | story | priority | not_a_task |
| --- | --- | --- | --- | --- | --- | --- | --- |
| assignee | 100.0% | 83.3% | 100.0% | 83.3% | 66.7% | 100.0% | N/A |
| injection | 50.0% | 100.0% | 100.0% | 0.0% | 100.0% | 100.0% | N/A |
| long-messy | 100.0% | 80.0% | 100.0% | 80.0% | 60.0% | 80.0% | 100.0% |
| multi-task | 100.0% | 100.0% | 100.0% | 100.0% | 90.9% | 81.8% | N/A |
| not-a-task | N/A | N/A | N/A | N/A | N/A | N/A | 100.0% |
| pl | 100.0% | 100.0% | 100.0% | 100.0% | 40.0% | 100.0% | 100.0% |
| relative-date | 100.0% | 100.0% | 100.0% | 100.0% | 75.0% | 83.3% | N/A |
| story-association | 100.0% | 66.7% | 100.0% | 100.0% | 100.0% | 100.0% | N/A |

**Story resolution is the weakest field (80.6% overall).** The model sometimes infers a story from thematic content — e.g. assigning a "login" task to an "Auth Refactor" story that was never mentioned in the input — rather than only matching an explicit story name. Several `pl` and `long-messy` cases fail solely on `story` for exactly this reason (see `backend/evals/results/latest.md`'s "Failing cases" section).

**Polish relative-date resolution is strong, not weak.** The `pl` tag scores `due_date: 100.0%` — phrases like "do piątku" (by Friday) and "jutro" (tomorrow) both resolve to the correct date. The Polish weak spot is the same story-resolution issue above (`pl` tag: `story: 40.0%`), not date handling.

The `injection` tag's `assignee: 0.0%` comes from a single case out of two (`count: 50.0%`, i.e. 1/2) — too small a sample to call a systemic assignee-resolution problem for adversarial inputs. Both `injection`-tagged cases are prompt-injection attempts ("ignore previous instructions...") that the model correctly treated as ordinary text to extract tasks from, rather than obeying as instructions — a meaningful positive result in its own right.

Title extraction (91.7%) sometimes paraphrases or expands the literal wording (e.g. "look into the login bug" → "Investigate login bug") — a match a human reviewer would accept, but scored as a miss by the token-F1 metric. This is a known characteristic of the scoring method, not a capability gap.

**Scoring method.** Predicted tasks are aligned to expected tasks by greedy best-first pairwise title-token-F1 matching before any field is scored, since an LLM's task ordering and wording aren't guaranteed to match a hand-written expected case. Each field (`title`, `due_date`, `assignee`, `story`, `priority`) is then scored independently and null-aware (correctly predicting "no due date" counts as a hit). Results are micro-averaged — sum of hits over sum of totals — both overall and per tag. Title scoring uses token-set F1 rather than an LLM-as-judge: an LLM judge would add cost, nondeterminism, and a second model's own failure modes to a component whose whole job is measuring the first model's failures, whereas token-F1 is deterministic, free, and explainable in a README.

Scoring is enforced automatically: `backend/tests/test_evals.py::test_replay_gate_reads_thresholds` runs the eval in replay mode and asserts every field's score meets the floor recorded in `backend/evals/thresholds.json`, so a change that regresses extraction quality fails the normal test suite rather than only a manual report.

Run it yourself:

```bash
cd backend
uv run python -m app.evals.run                     # replay mode (default) — offline, uses committed fixtures, no API key needed
uv run python -m app.evals.run --live --delay 2     # against the live API — needs GOOGLE_API_KEY
uv run python -m app.evals.run --record --delay 2   # record new/changed fixtures against the live API
```

`--filter TAG` restricts a run to cases with that tag; `--format json` gives machine-readable output. A GitHub Actions workflow (`.github/workflows/evals.yml`) can also run the live variant on demand via `workflow_dispatch`; it's `continue-on-error: true` and only uploads `backend/evals/results/latest.md` as an artifact for manual review — it does not block merges. The merge-blocking gate is the pytest threshold test above.

### API Keys for AI Agents

Generate scoped API keys from the config page to give AI agents or automation tools read/write access to your projects without sharing user credentials.

### MCP Server

`spt-mcp` exposes the tool as an MCP (Model Context Protocol) server, so an LLM host such as Claude Code or Claude Desktop can browse and edit projects directly. It's a thin async HTTP client over the same REST API everything else uses — no direct DB or service access — so every call still goes through the normal route → service → RBAC path.

16 tools: `whoami`, `list_projects`, `get_project`, `list_stories`, `get_story`, `list_tasks`, `get_task`, `search`, `list_comments`, `update_task`, `update_story`, `add_comment`, `create_task`, `create_story`, `capture_tasks`, `confirm_capture`. There are no delete tools and no member-management tools — an agent should never destroy work or change project membership.

```bash
# 1. Create a scoped API key
cd backend
spt config api-keys create --label "claude-code" --scopes read:projects,read:stories,read:tasks,read:comments,write:tasks,write:comments

# 2. Register the server with Claude Code
claude mcp add spt -e SPT_API_KEY=<key> -e SPT_API_URL=http://localhost:8000 -- spt-mcp
```

**Scopes are the security boundary**, not the tool list — the server enforces nothing itself. A read-only agent is one whose API key was created with only `read:*` scopes, not a different build or configuration. See [docs/how-to-run.md](docs/how-to-run.md) for the Claude Desktop config equivalent.

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

# 4. CLI and MCP server (optional) — both are entry points on the backend package
cd backend
uv pip install -e .
uv run spt auth login
```

`uv pip install -e .` puts `spt` and `spt-mcp` in `backend/.venv`, which is not on your PATH — hence the `uv run` prefix. For bare `spt`, either activate the environment (`source .venv/bin/activate`) or install it as a standalone tool with `uv tool install --editable .`. The latter also puts `spt-mcp` where an LLM host can find it, which `claude mcp add ... -- spt-mcp` needs.

The CLI talks to `http://localhost:8000` by default. Point it elsewhere with `spt auth login --api-url https://…` (saved for later commands) or the `SPT_API_URL` environment variable (per-invocation, and what the MCP server already reads).

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
