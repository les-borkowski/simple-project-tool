# API Expansion, MCP Server, and Per-User LLM Keys

> Status: approved 2026-09-05 — not started.
> Written to be executed by an implementation agent (Sonnet 5) ticket by ticket.
> Each ticket names its files, the exact signature changes, and its acceptance criteria.
> Target branch: `feature/mcp-server`, off `feature/nl-task-capture`.

## Context

The natural-language capture feature is complete on `feature/nl-task-capture` (T0–T9: Gemini client, capture service, eval harness, both REST endpoints, CLI command, UI modal, docs). It lets a human turn a sentence into tickets.

The next step is the other direction: let an **agent** pick up tickets that already exist and act on them — read a task, understand its project's workflow, move it through statuses, comment progress, file follow-ups.

Three things stand in the way:

1. **There is no MCP server.** Neither `mcp` nor `fastmcp` is a dependency.
2. **API keys authenticate almost nothing.** `feature/nl-task-capture` made the two capture endpoints (`backend/app/api/routes/tasks.py:84,105`) the *first and only* routes in the app to accept `X-API-Key`, via `Depends(require_scope("write:tasks"))`. Every other route uses `Depends(get_current_user)` — bearer JWT only. An agent holding a scoped API key can capture tasks and nothing else.
3. **The Gemini key is a single server-wide secret.** `settings.GOOGLE_API_KEY` is read straight out of the environment inside `GeminiClient.complete()`, so the deployment pays for every user's extraction, with no per-user throttle and no way to add a second provider. Users should bring their own key, under enforced rate limits.

**Decisions taken:** local **stdio** MCP transport; tool surface is **read + progress + create** (no deletes, no member management); code lives in **`backend/app/mcp/`** shipping as a `spt-mcp` console script alongside `spt`; branch **`feature/mcp-server` off `feature/nl-task-capture`**.

**Parts 1 and 2 are a chain** (MCP needs the scope wiring). **Part 3 is independent** and can land before, after, or alongside — it touches only the LLM/capture layer. The single coupling point is noted in M5.

---

## How MCP works (the brief explanation)

The Model Context Protocol is a JSON-RPC 2.0 protocol that lets an LLM host (Claude Code, Claude Desktop, an SDK agent) talk to an external capability provider — the **server**. The host runs a **client** per server and mediates everything; the model never speaks to the server directly.

**Transport.** For a local server, the host *spawns your process* and speaks JSON-RPC over its stdin/stdout. That is stdio transport, and it is what we're building. (The alternative, streamable HTTP, is for remote servers and drags in OAuth expectations — deferred.) Because stdout is the wire, **anything printed to stdout corrupts the protocol**: all logging must go to stderr. This is the single most common way a first MCP server fails.

**What a server exposes.** Three kinds of thing:

- **Tools** — functions the model can call, each with a name, a description, and a JSON Schema for its arguments. This is the part that matters here; the model chooses when to call them, so the *description is prompt text*, not documentation.
- **Resources** — read-only data addressed by URI (`spt://projects/{id}`), pulled in as context. Client support is uneven; deferred to the optional ticket M9.
- **Prompts** — canned, parameterised message templates a user picks deliberately (e.g. a `/work_on_task` slash command). Also M9.

**Lifecycle.** Host starts the process → `initialize` handshake (capability negotiation) → `tools/list` so the host knows what exists → the model emits `tools/call` requests, results come back as content blocks. Errors returned as `isError: true` are handed to the model as text it can read and recover from; an exception that kills the process just breaks the connection. So tools should *return* clear failures, not crash.

**Where auth lives.** The protocol has no notion of our users. Our server authenticates to the REST API on its own, using an `SPT_API_KEY` from its environment. It acts as exactly one user, and the API key's scopes plus the existing per-project RBAC are the real security boundary — not the tool list. A read-only agent is one created with `read:*` scopes, not a different server.

**Practically**, with the Python SDK (`mcp`, which bundles FastMCP), a tool is a decorated function whose signature and docstring become the schema and description:

```python
@mcp.tool()
async def update_task(task_id: str, status: str | None = None) -> dict:
    """Move a task to a new status. Valid slugs come from get_project."""
```

---

## Architecture

```
Claude Code / Desktop
  └─ spawns:  spt-mcp            (stdio JSON-RPC)
                └─ app/mcp/server.py    tool definitions
                     └─ app/mcp/client.py   async httpx, X-API-Key
                          └─ HTTPS ──▶ FastAPI  /api/v1/...
                                          └─ require_scope(...) ──▶ services ──▶ RBAC ──▶ DB
```

The MCP server is a **thin HTTP client over the public REST API**. It imports no services, no models, no DB session. That keeps every existing permission check on the path (`require_project_access`, `require_manager`, `require_not_demo` all still run in the service layer) and means the server can point at localhost or at production with one env var.

**Why a second HTTP client.** `backend/app/cli/http.py::APIClient` is not reusable as-is: it is synchronous, and on any non-2xx it calls `typer.echo(...); raise typer.Exit(1)` — it cannot report a failure to a caller. It also carries JWT refresh logic the MCP server must never run. `app/mcp/client.py` is a separate async client raising a typed error. The ~40 lines of overlap are deliberate. **Do not refactor `app/cli/http.py` in this branch.**

---

# Part 1 — API expansion

## M0 · Harden the API-key auth path

**File:** `backend/app/auth/dependencies.py` (all three changes are in `get_current_user_or_api_key` and `require_scope`).

Prerequisite because MCP turns one API-key call per minute into a dozen per agent turn.

**1. Stop the bcrypt fan-out.** Current code selects `WHERE (key_prefix = :prefix OR key_prefix = '') AND revoked_at IS NULL` then bcrypt-checks *every* row. At 12 rounds that is ~250 ms per candidate on every request.

Restructure into two passes:
- Pass 1: `SELECT ... WHERE key_prefix = :prefix AND revoked_at IS NULL`. Loop, bcrypt-check, return on match.
- Pass 2 (only if pass 1 matched nothing): `SELECT ... WHERE key_prefix = '' AND revoked_at IS NULL`. Same loop.

Keep pass 2 — the existing comment says the legacy fallback stays until keys are rotated. The point is to stop paying for it on the happy path.

**2. Stop writing on every read.** Current code does `key_record.last_used_at = ...` then `await db.commit()` unconditionally, so every GET opens a write transaction.

Add a module constant `LAST_USED_THROTTLE = timedelta(minutes=5)`. Only assign and commit when `key_record.last_used_at is None or key_record.last_used_at < datetime.now(UTC).replace(tzinfo=None) - LAST_USED_THROTTLE`. Note the column is naive datetime — the existing `.replace(tzinfo=None)` is load-bearing, keep it and compare naive-to-naive.

**3. Make the scope error translatable.** `require_scope` currently raises `HTTPException(403, f"API key missing scope: {scope}")`. The `detail` string becomes the machine-readable `error.code` and is looked up in `backend/app/locales/{en-GB,pl}.json`, so an interpolated string can never translate.

Replace with `HTTPException(403, "INSUFFICIENT_SCOPE")`. Add `"INSUFFICIENT_SCOPE"` to both `backend/app/locales/en-GB.json` and `pl.json` (English: "API key is missing a required permission"; Polish equivalent).

**Tests** — extend `backend/tests/test_auth_dependencies.py`:
- `test_known_prefix_key_does_one_bcrypt` — seed a legacy (`key_prefix=''`) row *and* a normal row; monkeypatch/spy `bcrypt.checkpw`; assert exactly one call.
- `test_legacy_prefix_key_still_authenticates` — a `key_prefix=''` row authenticates.
- `test_last_used_at_throttled` — two requests in a row; assert `last_used_at` unchanged on the second.
- `test_last_used_at_updates_after_window` — set `last_used_at` to 10 minutes ago; assert it advances.
- `test_insufficient_scope_error_code` — assert the body is `{"error": {"code": "INSUFFICIENT_SCOPE", ...}}`.

**Acceptance:** full existing suite still passes; no route behaviour changes.

## M1 · Wire `require_scope` across agent-facing endpoints

Mechanical and repeated. In each route function, replace the parameter

```
user: User = Depends(get_current_user)
```

with

```
user: User = Depends(require_scope("<scope>"))
```

and add `require_scope` to the `from app.auth.dependencies import ...` line. Leave `get_current_user` imported where other routes in the same file still use it.

**This is backward-compatible and that must stay true.** `require_scope` delegates to `get_current_user_or_api_key`, which tries the bearer JWT first and returns `get_current_user(...)` unchanged; the scope check only fires when `request.state.api_key` is set. Frontend and CLI behaviour is untouched.

| File | Endpoints to change | Scope |
|---|---|---|
| `routes/projects.py` | `GET ""`, `GET /{project_id}`, `GET /{project_id}/members` | `read:projects` |
| `routes/project_statuses.py` | `GET /{project_id}/statuses` | `read:projects` |
| `routes/search.py` | `GET /search` | `read:projects` |
| `routes/stories.py` | `GET /projects/{project_id}/stories`, `GET /stories/{story_id}` | `read:stories` |
| `routes/stories.py` | `POST /projects/{project_id}/stories`, `PATCH /stories/{story_id}` | `write:stories` |
| `routes/tasks.py` | `GET /projects/{project_id}/tasks`, `GET /stories/{story_id}/tasks`, `GET /tasks/{task_id}` | `read:tasks` |
| `routes/tasks.py` | `POST /projects/{project_id}/tasks`, `POST /stories/{story_id}/tasks`, `PATCH /tasks/{task_id}` | `write:tasks` |
| `routes/comments.py` | `GET /projects/{id}/comments`, `GET /stories/{id}/comments`, `GET /tasks/{id}/comments` | `read:comments` |
| `routes/comments.py` | `POST /projects/{id}/comments`, `POST /stories/{id}/comments`, `POST /tasks/{id}/comments` | `write:comments` |

**Deliberately left JWT-only** (do not change): project create/delete/archive/restore, member add/update/remove, `my-preferences`, invitations, sprints, timeline, status CRUD (POST/PATCH/DELETE), `/config` and API-key management, time-tracking reports, `/admin`, all of `/auth` except `/auth/me`. Deletes are excluded per the chosen tool surface — an agent must not be able to destroy work.

**`GET /auth/me`** (`routes/auth.py`) needs its own treatment so an agent can discover its identity and permissions:
- Change its dependency to `Depends(get_current_user_or_api_key)` (no scope requirement) and add `request: Request` to the signature.
- Add to `backend/app/api/schemas/user.py` a `class APIKeyIdentity(BaseModel): label: str; scopes: list[str]` and an optional field `api_key: APIKeyIdentity | None = None` on the response model used by `/auth/me`. Default `None` so JWT responses are byte-identical to today.
- In the route, populate it from `request.state.api_key` when set.

**New test file** `backend/tests/test_api_key_scopes.py`. Make it table-driven over a list of `(method, path_template, required_scope)` covering every row above. For each entry assert:
- key with the exact scope → 2xx
- key with an unrelated scope (e.g. `read:comments` against a `write:tasks` route) → 403 and `error.code == "INSUFFICIENT_SCOPE"`
- revoked key → 401
- no credentials at all → 401
- a normal JWT → same status as before (guards the backward-compatibility claim)

Add one explicit test that `write:tasks` alone can call the `read:tasks` routes, since `SCOPE_HIERARCHY` (`backend/app/auth/security.py:128`) makes write imply read.

Reuse the existing conftest fixtures for user/project/story/task creation; create keys through `config_service.create_api_key` so the hashing path is the real one.

**Acceptance:** new file passes; the whole pre-existing suite passes unchanged.

---

# Part 2 — the MCP server

## M2 · Scaffold and the first tool

**`backend/pyproject.toml`:** add `"mcp>=1.2"` to `[project.dependencies]` and `spt-mcp = "app.mcp.server:main"` to `[project.scripts]`. Run `uv sync` and commit the lockfile change.

**New package `backend/app/mcp/`:**

**`config.py`** — a frozen dataclass `MCPConfig` with a `load()` classmethod:
- `api_url`: env `SPT_API_URL`, else `CLIConfig.load().api_base_url` (from `app/cli/config.py`, so `spt` and `spt-mcp` agree), else `http://localhost:8000`.
- `api_key`: env `SPT_API_KEY`. **Required** — `load()` raises `MCPConfigError` if empty.
- `locale`: env `SPT_LOCALE`, default `en-GB`. Sent as `Accept-Language` so API errors come back translated.
- `timeout`: env `SPT_TIMEOUT_SECONDS`, default `30.0`.

**`errors.py`** — `class SPTAPIError(Exception)` carrying `status: int`, `code: str`, `message: str`, `details: list | None`, with a `__str__` of `"{code}: {message}"`. Also `MCPConfigError`.

**`client.py`** — `class SPTClient`:
- `__init__(self, config: MCPConfig, transport: httpx.AsyncBaseTransport | None = None)`. The `transport` hook exists so tests can point it at the ASGI app (M6) — do not skip it.
- Holds an `httpx.AsyncClient` with `base_url = f"{config.api_url.rstrip('/')}/api/v1"`, headers `{"X-API-Key": ..., "Accept-Language": ...}`, and the timeout.
- `async def request(self, method, path, **kwargs) -> Any` — on 2xx return parsed JSON (or `None` for 204); on non-2xx parse the app's envelope `{"error": {"code", "message", "details"}}` and raise `SPTAPIError`. If the body isn't that shape (proxy error, HTML), raise `SPTAPIError(status, "HTTP_ERROR", <first 200 chars of body>)`.
- Thin `get`/`post`/`patch` wrappers.
- `async def fetch_all(self, path, params=None) -> list` — walks `items` + `next_cursor` exactly like `APIClient.fetch_all` in `app/cli/http.py`. Cap at 20 pages and stop, to bound a runaway agent.
- `async def aclose(self)`.

**`server.py`**:
- `mcp = FastMCP("simple-project-tool")`.
- An async `lifespan` context manager that builds one `SPTClient` for the process and yields it; register it via `FastMCP(..., lifespan=...)`. One connection pool, not one per call. Tools reach it through the request context.
- `def main() -> None`: configure logging to **stderr** explicitly (`logging.basicConfig(stream=sys.stderr, ...)`), catch `MCPConfigError` and exit(1) with a readable stderr message naming `SPT_API_KEY`, then `mcp.run()`.
- Every tool wrapped so `SPTAPIError` becomes a returned error string, not a traceback. Put that in a small `@tool_errors` decorator in `errors.py` and apply it under `@mcp.tool()`.

**First tool, to prove the loop end to end:**

```
whoami() -> dict
```
`GET /auth/me`. Returns `{id, name, email, role, api_key: {label, scopes}}`. Description should tell the model to call this first if it is unsure what it is allowed to do.

**Tests:**
- `backend/tests/test_mcp_config.py` — env precedence over `CLIConfig`, default fallbacks, `MCPConfigError` when `SPT_API_KEY` is unset.
- `backend/tests/test_mcp_client.py` — using `httpx.MockTransport`: `X-API-Key` and `Accept-Language` headers present; error envelope → `SPTAPIError` with the right `code`; non-JSON error body → `HTTP_ERROR`; `fetch_all` walks two pages and concatenates; `fetch_all` stops at the 20-page cap.

**Acceptance:** `uv run spt-mcp` with `SPT_API_KEY` set starts and answers an `initialize` + `tools/list` exchange on stdin (see Verification step 3). With the var unset it exits 1 with a clear message.

## M3 · Read tools

All in `server.py`. Return **full UUIDs as strings** — do *not* reuse `short_id` from `app/cli/output.py`, it truncates to 8 chars and the agent needs the ids back. Return plain dicts/lists; FastMCP serialises them.

| Tool | Signature | Calls |
|---|---|---|
| `list_projects` | `(include_archived: bool = False)` | `fetch_all("/projects", {"archived": ...})` |
| `get_project` | `(project_id: str)` | composes 3 calls, see below |
| `list_stories` | `(project_id: str)` | `fetch_all(f"/projects/{id}/stories")` |
| `list_tasks` | `(project_id: str, status: str \| None = None, assignee_id: str \| None = None, story_id: str \| None = None, q: str \| None = None, unassigned: bool = False)` | `/stories/{story_id}/tasks` when `story_id` given, else `/projects/{project_id}/tasks` |
| `get_task` | `(task_id: str, include_comments: bool = True)` | `GET /tasks/{id}` + `GET /tasks/{id}/comments` |
| `search` | `(q: str)` | `GET /search` |

**`get_project` is the orienting tool and deserves care.** It fans out to `GET /projects/{id}`, `GET /projects/{id}/members`, and `GET /projects/{id}/statuses` (run them concurrently with `asyncio.gather`) and returns one object:

```
{project: {...}, statuses: [{slug, name, order}], members: [{user_id, name, role}]}
```

Its description must say: *"Call this before creating or updating anything in a project. Statuses are per-project — the slugs returned here are the only values `update_task` will accept. Member `user_id`s here are the only valid `assignee_id`s."* Without that the model guesses `in_testing` (removed from the default set in the project-statuses rework) and gets a 422.

Only pass query params that are not `None`, so the API's own defaults apply.

## M4 · Write tools

| Tool | Signature | Calls |
|---|---|---|
| `update_task` | `(task_id: str, status=None, priority=None, title=None, description=None, assignee_id=None)` | `PATCH /tasks/{id}` |
| `add_comment` | `(target: str, text: str)` | `POST /{kind}s/{id}/comments` |
| `create_task` | `(project_id: str, title: str, description=None, story_id=None, assignee_id=None, priority=None, due_date=None)` | `POST /stories/{story_id}/tasks` if `story_id` else `POST /projects/{project_id}/tasks` |
| `create_story` | `(project_id: str, title: str, description=None, priority=None)` | `POST /projects/{id}/stories` |

**`update_task`** must build its JSON body from only the non-`None` arguments — the API is PATCH-only by design, and sending `null`s would blank fields. If every argument is `None`, return an error telling the model to supply at least one field rather than making a no-op call. Its description states that `status` must be a slug from `get_project` and that a 422 means the slug is unknown to that project.

**`add_comment`**'s `target` is `project:<uuid>` / `story:<uuid>` / `task:<uuid>`, matching the existing CLI ref convention in `app/cli/commands/comments.py` — parse and validate the prefix, returning a clear error for a malformed ref rather than a 404.

`priority` is `low|medium|high`; `due_date` is `YYYY-MM-DD`. State both in the descriptions.

## M5 · Capture tools

| Tool | Signature | Calls |
|---|---|---|
| `capture_tasks` | `(project_id: str, text: str, reference_date: str \| None = None, story_id: str \| None = None)` | `POST /projects/{id}/tasks/capture` |
| `confirm_capture` | `(project_id: str, tasks: list[dict])` | `POST /projects/{id}/tasks/capture/confirm` |

When `reference_date` is omitted, default it to today's ISO date client-side, mirroring `spt tasks capture`.

`capture_tasks`' description must state that it **writes nothing** and that its output requires an explicit `confirm_capture` call. `confirm_capture` takes 1–20 items with keys `title, description, story_id, assignee_id, due_date, priority` and is all-or-nothing.

These are worth keeping even though the agent is itself an LLM: extraction runs server-side against the project's real members and stories, which the agent doesn't otherwise have in context.

> **Coupling with Part 3:** if the per-user LLM key work has landed, add one line to `capture_tasks`' description — *"Requires the API key owner to have configured a personal LLM key; a `LLM_NOT_CONFIGURED` error means they have not."*

## M6 · Integration tests

**`backend/tests/test_mcp_tools.py`** — the ticket that actually proves M1.

Build an `SPTClient` whose `transport` is `httpx.ASGITransport(app=<the FastAPI app>)` and whose `api_url` is `http://test`, using an API key created through the existing conftest fixtures. Then call the tool functions directly (import the undecorated implementations, or call through FastMCP's tool registry — whichever the SDK version makes clean; prefer keeping each tool body in a plain `async def _impl` that the decorated tool delegates to, so tests import the impl).

Cover:
- happy path for every tool in M3–M5
- `update_task` with an invalid status slug → the 422 surfaces as a readable error mentioning the slug
- a `read:tasks`-only key calling `update_task` → `INSUFFICIENT_SCOPE`
- a project the key's owner is not a member of → `FORBIDDEN`
- a demo account (`is_demo=True`) blocked on a write — proves `require_not_demo` still runs in the service layer through the HTTP path
- `get_project` returns statuses and members together
- `list_tasks` with `story_id` hits the story route, without it hits the project route

**Registration test** — assert the exact set of tool names, and that every registered tool has a non-empty description. Descriptions are prompt surface; a missing one degrades the model silently and no other test would catch it.

## M7 · Docs

- **`README.md`** — an "MCP Server" section directly under the existing "API Keys for AI Agents": what it is in two sentences, the tool list, the setup block, and an explicit note that the API key's scopes are the security boundary.
- **`docs/architecture.md`** — a sixth layer entry for `backend/app/mcp/`, stating the thin-HTTP-client rule and *why* (RBAC stays on the path because every call goes through the public API).
- **`docs/how-to-run.md`** — setup:

  ```bash
  spt config api-keys create --label agent --scopes "write:tasks,write:comments,write:stories"
  ```
  ```bash
  claude mcp add spt --env SPT_API_KEY=<key> --env SPT_API_URL=https://<host> -- spt-mcp
  ```

  plus the equivalent `claude_desktop_config.json` block.
- **`CLAUDE.md`** — one line in Key Facts, and under "Adding an API Endpoint" a step 6: *if the endpoint is agent-facing, wire `require_scope` and add the MCP tool.*
- **`docs/changelog.md`** — an entry, matching the existing format.

## M8 · Optional — resources and a prompt

Only if M0–M7 land cleanly. Both are convenience over existing tools; nothing may depend on them.

- Resource `spt://projects` and template `spt://projects/{project_id}` returning the `get_project` brief.
- Prompt `work_on_task(task_id)` producing a framed "here is the ticket, its comments, and the project's valid statuses — pick it up" message.

---

# Part 3 — per-user LLM credentials, provider registry, and rate limits

Today `GeminiClient.complete()` reads `settings.GOOGLE_API_KEY` from module-level config, so one server-wide key funds every user's extraction, throttled by nothing and extensible to no other provider.

Goal: each user stores their own credential per provider, under rate limits they can tighten but not loosen past an admin ceiling; the server key becomes an optional fallback a public deployment turns off; adding a second provider later costs one adapter class and one registry entry, with no migration.

**Design shape:** the credential is *data threaded through the call*, never global config. That preserves the tested architectural boundary — `capture_service.py` must stay DB-free (`backend/tests/test_capture_service.py::test_no_asyncsession_import` scans its source for `AsyncSession`), so the key arrives as a parameter exactly like `ProjectContext` does.

## B1 · Encryption primitives

**Dependency:** add `"cryptography>=44"` to `[project.dependencies]` in `backend/pyproject.toml`. It is currently only a transitive dep (via `keyring`), so it must be declared.

**New setting** in `backend/app/core/config.py`:
```
CREDENTIAL_ENCRYPTION_KEY: str = ""   # urlsafe-base64 32-byte Fernet key; empty disables BYO credentials
```
Add it to `backend/.env.example` with a comment showing how to generate one: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`.

Use a **dedicated** variable rather than deriving from `SECRET_KEY`: rotating `SECRET_KEY` after a leak is a routine action, and it must not silently render every stored user credential undecryptable.

**New module `backend/app/core/crypto.py`:**
- `class CredentialEncryptionUnavailable(Exception)`
- `encrypt_secret(plaintext: str) -> str` / `decrypt_secret(ciphertext: str) -> str`, both raising `CredentialEncryptionUnavailable` when `CREDENTIAL_ENCRYPTION_KEY` is empty. Build the `Fernet` instance lazily and cache it module-level, keyed on the setting value — constructing one per call is wasteful.
- `decrypt_secret` converts Fernet's `InvalidToken` into `CredentialEncryptionUnavailable` too, so a rotated encryption key degrades to "not configured" rather than a 500.

**Tests** `backend/tests/test_crypto.py`: round-trip; raises when the setting is empty; two encryptions of the same plaintext differ (Fernet nonce); a token encrypted under a different key raises rather than returning garbage.

## B2 · Provider registry

**New module `backend/app/core/llm/providers.py`** — declarative, no I/O:

```
@dataclass(frozen=True)
class ProviderSpec:
    id: str                  # "google" | "anthropic" | "openai"
    label: str               # "Google Gemini"
    default_model: str
    available: bool          # False => declared but not implemented
    key_hint: str            # human guidance, e.g. "starts with AIza"
    docs_url: str
    default_rpm: int
    default_tpm: int

PROVIDERS: dict[str, ProviderSpec]   # google available=True; anthropic, openai available=False
def get_provider(provider_id: str) -> ProviderSpec   # raises HTTPException(422, "UNKNOWN_PROVIDER")
def available_providers() -> list[ProviderSpec]
```

Fill in Google from the current `LLM_MODEL` default (`gemini-3.1-flash-lite`). Declare `anthropic` and `openai` with `available=False` — **do not write stub adapter classes**; dead code that must be maintained buys nothing here.

**`backend/app/core/llm/__init__.py`** — replace the `if provider == ...` chain in `get_llm_client()` with a dict lookup `_ADAPTERS: dict[str, Callable[[], LLMClient]] = {"google": GeminiClient, "replay": lambda: ReplayClient(_FIXTURES_DIR)}`, and have it raise a clear error naming the provider when a declared-but-unavailable provider is requested. Adding a provider then means: one adapter module, one `_ADAPTERS` entry, one `PROVIDERS` entry.

Also add `get_llm_client_for(provider_id: str) -> LLMClient` so the resolution layer (B5) can pick an adapter per user rather than per server.

**New settings** in `core/config.py` (server-wide ceilings and fallback control):
```
LLM_ALLOW_SERVER_KEY_FALLBACK: bool = True
LLM_MAX_RPM: int = 20      # admin ceiling — a user may set lower, never higher
LLM_MAX_TPM: int = 100_000
```

**Tests** `backend/tests/test_llm_providers.py`: `get_provider("google")` returns an available spec; `get_provider("anthropic")` returns an unavailable one; an unknown id raises 422 `UNKNOWN_PROVIDER`; `get_llm_client_for("anthropic")` raises a message naming the provider.

## B3 · Schema — `user_llm_providers`

A dedicated table rather than columns on `user_configs`: one row per user per provider, so a second provider needs no migration and rate limits hang naturally off the credential they govern.

**New model `backend/app/db/models/user_llm_provider.py`:**

| column | type | notes |
|---|---|---|
| `id` | `UUID` PK | |
| `user_id` | `UUID` FK → `users.id` `ondelete=CASCADE` | |
| `provider` | `String(50)` | a `PROVIDERS` key; validated in the service, not a DB enum — adding a provider must not need a migration |
| `api_key_encrypted` | `Text` | Fernet ciphertext |
| `api_key_hint` | `String(8)` | last 4 chars, for "…a3f9" |
| `model` | `String(100)`, nullable | overrides the spec's `default_model` |
| `rpm_limit` | `Integer`, nullable | user's own limit; `None` = use the effective ceiling |
| `tpm_limit` | `Integer`, nullable | ditto |
| `is_default` | `Boolean`, default `False` | which credential capture uses |
| `enabled` | `Boolean`, default `True` | |
| `created_at` / `updated_at` | via `TimestampMixin` | |

Unique constraint on `(user_id, provider)`. Index on `user_id`. Register it in `backend/app/db/models/__init__.py` and add the `llm_providers` relationship on `User` (cascade delete-orphan, matching the existing `api_keys` relationship).

**Admin ceiling per user** — add two nullable columns to `users`: `llm_rpm_ceiling` and `llm_tpm_ceiling` (`Integer`, nullable). `None` means "use `settings.LLM_MAX_RPM` / `LLM_MAX_TPM`".

**Effective limit** is one function, in the service layer, and every enforcement path must use it:

```
effective_rpm = min(row.rpm_limit or ceiling, ceiling)
  where ceiling = user.llm_rpm_ceiling or settings.LLM_MAX_RPM
```
Same for TPM. A user setting 999999 silently clamps to the ceiling — do **not** reject it with an error, just clamp, and show the effective value in the UI.

**Usage counter table `llm_usage_events`** (needed by B4): `id` UUID PK, `user_id` UUID FK CASCADE, `provider` String(50), `total_tokens` Integer, `created_at` DateTime index. Composite index on `(user_id, created_at)` — that is the query shape.

**Migration:** one Alembic revision creating both tables and the two `users` columns; downgrade drops them. Write it by hand or review the autogenerated one carefully — `create_type=False` conventions apply as elsewhere in this repo.

## B4 · Rate limiting

**New module `backend/app/api/services/llm_usage_service.py`.**

Postgres-backed rather than in-process: the deployment runs multiple workers, and an in-memory window would under-count by exactly the worker count. Capture volume is one call per deliberate user action, so a windowed query per call is cheap.

```
async def check_rate_limit(user, provider, db) -> None
```
Runs two aggregates over the last 60 seconds — `COUNT(*)` and `COALESCE(SUM(total_tokens), 0)` from `llm_usage_events` where `user_id` and `provider` match and `created_at > now() - 60s`. Do it as **one** query returning both. If count ≥ effective RPM or tokens ≥ effective TPM, raise `HTTPException(429, "LLM_RATE_LIMITED")` and set a `Retry-After` header from the oldest event in the window.

```
async def record_usage(user, provider, total_tokens, db) -> None
```
Inserts one row. Called **after** a successful LLM call, using `outcome.prompt_tokens + outcome.completion_tokens` — `ExtractionOutcome` already carries both, so no new plumbing.

```
async def prune_usage_events(db, older_than=timedelta(hours=1)) -> int
```
Deletes stale rows. Call it opportunistically from `record_usage` roughly 1 time in 100 (`random.random() < 0.01`) rather than adding a scheduler — the table only ever needs the last minute, and this keeps it small without new infrastructure.

Add `LLM_RATE_LIMITED` to both `backend/app/locales/en-GB.json` and `pl.json`.

**Tests** `backend/tests/test_llm_usage_service.py`: under the limit passes; the RPM-th call in a window raises 429; events older than 60s don't count; TPM enforced independently of RPM; the user's own lower limit wins; a user limit above the ceiling clamps to the ceiling; a per-user admin ceiling overrides `settings.LLM_MAX_RPM`; prune removes only stale rows.

## B5 · Thread the credential through the LLM layer

One signature change propagating through five files:

1. **`backend/app/core/llm/base.py`** — add `api_key: str | None = None` as a keyword-only parameter to the `LLMClient` Protocol's `complete()`.
2. **`backend/app/core/llm/gemini_client.py`** — resolve `key = api_key or (settings.GOOGLE_API_KEY if settings.LLM_ALLOW_SERVER_KEY_FALLBACK else "")`; raise `LLMNotConfigured` when empty. **Remove** the current unconditional `if not settings.GOOGLE_API_KEY` guard at the top of `complete()` — it would reject a user-supplied key on a server with no key of its own, which is the entire point. Also accept an optional `model` override (falling back to `settings.LLM_MODEL`) so a user's `model` column is honoured.
3. **`backend/app/core/llm/replay.py`** — accept and ignore `api_key` and `model`, keeping the Protocol satisfied.
4. **`backend/app/api/services/capture_service.py`** — `extract(text, ctx, client)` becomes `extract(text, ctx, client, api_key: str | None = None, model: str | None = None)`, forwarding both to `client.complete(...)`. **Both** call sites inside `extract` — the initial call and the retry at line ~111 — must pass them. No DB access is added, so the boundary test keeps passing.
5. **`backend/app/evals/run.py`** — the `extract(case["input"], ctx, client)` call at line 112 passes `api_key=settings.GOOGLE_API_KEY`. Replay mode ignores it, so offline eval runs are unaffected.

**Tests** — extend `backend/tests/test_llm_client.py`: a user key overrides the server key in the outgoing `x-goog-api-key` header; with no user key and fallback on, the server key is used; with fallback off and no user key, `LLMNotConfigured`; a user key works with `GOOGLE_API_KEY` empty; a `model` override reaches the request URL.

## B6 · Resolution and the config API

**`backend/app/api/services/llm_credential_service.py`** (new) — everything CRUD about `user_llm_providers`:

```
async def list_providers(user, db) -> list[UserLLMProviderResponse]
async def upsert_provider(user, provider_id, data, db) -> UserLLMProviderResponse
async def delete_provider(user, provider_id, db) -> None
async def resolve_credential(user, db) -> ResolvedCredential | None
```

`ResolvedCredential` is a small dataclass: `provider`, `api_key`, `model | None`. `resolve_credential` picks the user's `is_default` enabled row (or the single enabled row if none is flagged), decrypts it, and returns `None` on `CredentialEncryptionUnavailable` (logged at warning) so the server-key fallback still applies.

`upsert_provider`: `require_not_demo(user)`; `get_provider(provider_id)` and reject `available=False` with 422 `PROVIDER_NOT_AVAILABLE`; require `CREDENTIAL_ENCRYPTION_KEY` or raise 503 `CREDENTIAL_STORAGE_UNAVAILABLE`; validate the key (below); encrypt; store hint `key[-4:]`; clamp `rpm_limit`/`tpm_limit` to the effective ceiling; if this is the user's first credential set `is_default=True`; if `is_default=True` is passed, clear the flag on the user's other rows in the same transaction.

**Key validation on save.** Make one minimal generation call through the provider's adapter with the supplied key (`max_tokens=1`, trivial prompt). On an auth rejection from the provider, raise 422 `LLM_KEY_INVALID`. On a network error or timeout, **store it anyway** — a provider outage must not block a user saving a valid key. This catches the overwhelmingly common failure (a pasted typo) at the moment the user can fix it.

**Routes** in `backend/app/api/routes/config.py` (JWT-only; agents have no business managing credentials):

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/config/llm-providers` | user's configured credentials — **never the key**, only `provider`, `label`, `api_key_hint`, `model`, `rpm_limit`, `tpm_limit`, `effective_rpm`, `effective_tpm`, `is_default`, `enabled` |
| `PUT` | `/config/llm-providers/{provider}` | create or update |
| `DELETE` | `/config/llm-providers/{provider}` | remove |
| `GET` | `/config/llm-providers/available` | the `PROVIDERS` catalogue — `id`, `label`, `default_model`, `available`, `key_hint`, `docs_url` |

**Schemas** in `backend/app/api/schemas/llm_provider.py`: `UserLLMProviderUpdate` (`api_key: str | None`, `model`, `rpm_limit`, `tpm_limit`, `is_default`, `enabled`) and `UserLLMProviderResponse` / `ProviderCatalogueItem`. **`api_key` is write-only and must never appear on any response model** — enforce it with a test that asserts the raw key string is absent from the serialised body of every one of these endpoints.

**`capture_resolution_service.preview_capture`** — after `require_project_access` and before any LLM call:
1. `cred = await resolve_credential(user, db)`
2. `provider = cred.provider if cred else settings.LLM_PROVIDER`
3. `await check_rate_limit(user, provider, db)` — **before** the call, so a throttled user costs nothing
4. `extract(..., api_key=cred.api_key if cred else None, model=cred.model if cred else None)`
5. on success, `await record_usage(user, provider, outcome.prompt_tokens + outcome.completion_tokens, db)`

Add `429` to the endpoint's documented responses in `routes/tasks.py`, and let `LLM_RATE_LIMITED` propagate — it is a normal `HTTPException`, so the existing envelope handler formats it.

The credential owner is whoever authenticated: a JWT user, or the owner of the API key. That is the right semantics for MCP — an agent extracts on its owner's key and against its owner's limits.

**Locales** — add `UNKNOWN_PROVIDER`, `PROVIDER_NOT_AVAILABLE`, `LLM_KEY_INVALID`, `CREDENTIAL_STORAGE_UNAVAILABLE`, `LLM_RATE_LIMITED` to both `backend/app/locales/{en-GB,pl}.json`.

**Tests** `backend/tests/test_config_llm_providers.py`: PUT stores and GET returns hint but never the key (assert on raw response text); PUT with an unavailable provider → 422; unknown provider → 422; demo account → 403 `DEMO_ACCOUNT`; invalid key → 422 (mock the adapter); `CREDENTIAL_ENCRYPTION_KEY` empty → 503; `rpm_limit` above the ceiling is stored clamped; setting a second credential `is_default` unsets the first; DELETE removes it.

Extend `backend/tests/test_api_capture.py`: a user credential is forwarded to the client; no credential + fallback off → 503 `LLM_NOT_CONFIGURED`; exceeding RPM → 429 `LLM_RATE_LIMITED` **and no LLM call is made**; a successful capture writes exactly one `llm_usage_events` row with the summed token count.

## B7 · Admin ceilings

`backend/app/admin/users_router.py` + `users_service.py` + the `templates/users/` detail template, following the existing `enable-demo` / `disable-demo` pattern exactly (session auth via `require_admin_session`, `_flash`, `_redirect_users`).

- Show each user's `llm_rpm_ceiling` / `llm_tpm_ceiling` and their current usage in the last minute.
- `POST /admin/users/{user_id}/llm-limits` — set both (blank clears to the server default).

Extend `backend/tests/test_admin_users.py` (or whichever file covers the admin user actions) with: setting a ceiling persists; clearing it falls back to `settings.LLM_MAX_RPM`; a lowered ceiling immediately clamps a user's higher self-set limit on the next capture.

## B8 · Surfaces: frontend, CLI, docs

**Frontend** — an "AI providers" section in the existing config/settings page:
- Provider picker sourced from `GET /config/llm-providers/available`; unavailable ones render disabled with a "coming soon" label — this is the visible half of the stub work.
- Per provider: password-type key input, optional model override, RPM and TPM inputs showing the effective ceiling as helper text ("max 20"), a default toggle, Save, Clear.
- Status line: "Not configured" or "Configured (…a3f9)".
- A one-line privacy note matching the README's existing wording: capture text plus member and story *names* are sent to the provider.

Add the client methods to `frontend/src/services/api.ts` and keys to **both** `frontend/src/locales/en-GB.json` and `pl.json`.

**CLI** — a dedicated sub-command group under `config`, so the secret stays out of shell history:
- `spt config llm list` — configured credentials with hints and effective limits
- `spt config llm providers` — the catalogue, availability included
- `spt config llm set <provider>` — prompts for the key with `hide_input=True`; `--model`, `--rpm`, `--tpm`, `--default` options
- `spt config llm delete <provider>`

Add strings to `backend/app/cli/locales/{en-GB,pl}.json`. Extend `backend/tests/test_cli_commands.py`.

**Docs** — README: replace the capture "Configuration" table's `GOOGLE_API_KEY` row with the new model. State the resolution order plainly:

> **user's default credential → server key (only if `LLM_ALLOW_SERVER_KEY_FALLBACK=true`) → `503 LLM_NOT_CONFIGURED`**

Document `CREDENTIAL_ENCRYPTION_KEY`, `LLM_MAX_RPM`, `LLM_MAX_TPM`, and note that `LLM_ALLOW_SERVER_KEY_FALLBACK=false` is how a public deployment stops funding everyone's extraction. Add a short "Adding an LLM provider" subsection in `docs/architecture.md` listing the three touch points (adapter module, `_ADAPTERS` entry, `PROVIDERS` entry) and stating that no migration is required.

---

## Critical files

**Modified:** `backend/app/auth/dependencies.py` · `backend/app/api/routes/{projects,stories,tasks,comments,project_statuses,search,auth,config}.py` · `backend/app/api/schemas/user.py` · `backend/app/api/services/capture_{service,resolution_service}.py` · `backend/app/core/config.py` · `backend/app/core/llm/{__init__,base,gemini_client,replay}.py` · `backend/app/db/models/{__init__,user}.py` · `backend/app/evals/run.py` · `backend/app/admin/{users_router,users_service}.py` + `templates/users/` · `backend/app/cli/commands/config_cmd.py` · `backend/app/locales/{en-GB,pl}.json` · `backend/app/cli/locales/{en-GB,pl}.json` · `backend/pyproject.toml` · `frontend/src/services/api.ts` · `frontend/src/locales/{en-GB,pl}.json` · `README.md` · `docs/{architecture,how-to-run,changelog}.md` · `CLAUDE.md`

**New:** `backend/app/mcp/{__init__,config,client,errors,server}.py` · `backend/app/core/crypto.py` · `backend/app/core/llm/providers.py` · `backend/app/db/models/{user_llm_provider,llm_usage_event}.py` · `backend/app/api/schemas/llm_provider.py` · `backend/app/api/services/{llm_credential_service,llm_usage_service}.py` · one Alembic revision in `backend/migrations/versions/` · `backend/tests/{test_api_key_scopes,test_mcp_config,test_mcp_client,test_mcp_tools,test_crypto,test_llm_providers,test_llm_usage_service,test_config_llm_providers}.py`

**Reused, not modified:** `app/cli/config.py::CLIConfig` (base URL) · `app/auth/security.py::{check_scope,SCOPE_HIERARCHY}` — scopes already cover `read|write:{projects,stories,tasks,comments}`, so **no scope-vocabulary change is needed** · `app/auth/permissions.py` (untouched; RBAC keeps working because MCP goes through HTTP) · `app/api/pagination.py` (the cursor convention `fetch_all` walks) · `app/core/email.py` (the raw-httpx, no-vendor-SDK pattern `GeminiClient` already follows) · `app/admin/users_router.py`'s `enable-demo` action (the pattern B7 copies)

**One migration**, in Part 3 only: two new tables plus two nullable `users` columns. Parts 1 and 2 change no schema.

## Suggested commit sequence

`M0 → M1 → M2 → M3 → M4 → M5 → M6 → M7` then `B1 → B2 → B3 → B4 → B5 → B6 → B7 → B8`, one commit per ticket. Part 3 may equally run first or in parallel on its own branch — its only contact with Part 2 is the one-line `capture_tasks` description note in M5.

---

## Verification

Run from `backend/` on `feature/mcp-server`.

**1. Test suite**

```bash
cd backend && uv sync && uv run alembic upgrade head && uv run pytest && uv run ruff check . && uv run ruff format --check .
```

`test_api_key_scopes.py` and `test_mcp_tools.py` are the two that matter. The pre-existing suite passing unchanged is the evidence that M1 broke no JWT client.

**2. Manual API-key check** — start the server, create a key, confirm a previously JWT-only endpoint answers:

```bash
curl -H "X-API-Key: $SPT_API_KEY" http://localhost:8000/api/v1/projects
```

Then the negative: a key scoped only `read:tasks` must get 403 `INSUFFICIENT_SCOPE` from `PATCH /tasks/{id}`.

**3. MCP handshake without a client** — proves the protocol layer before any host is involved:

```bash
cd backend && printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' '{"jsonrpc":"2.0","method":"notifications/initialized"}' '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | SPT_API_KEY=$SPT_API_KEY uv run spt-mcp
```

Expect an `initialize` result then the full tool list on stdout — **and nothing else on stdout**.

**4. Real host end to end** — register with `claude mcp add` as in M7, then in a fresh Claude Code session drive an actual ticket round-trip: list projects → get one → list its tasks → move a task to `in_progress` → comment on it → confirm the change in the web UI. That visual confirmation is the real acceptance test; everything above is a proxy for it.

**5. Per-user credential** — with `GOOGLE_API_KEY` empty and `LLM_ALLOW_SERVER_KEY_FALLBACK=false`: capture returns 503 `LLM_NOT_CONFIGURED`; save a personal key in the settings UI; capture now works; `spt config llm list` shows the hint and effective limits; delete it and capture returns 503 again. Confirm the key never leaves the server in plaintext and is stored encrypted:

```bash
psql "$DATABASE_URL" -c "select provider, api_key_hint, left(api_key_encrypted, 12) from user_llm_providers;"
```

The ciphertext must start `gAAAAA` (Fernet) and share no prefix with the real key. Also grep the raw body of `GET /api/v1/config/llm-providers` for the key — it must not appear.

**6. Rate limiting** — set `LLM_MAX_RPM=2`, then fire three captures in quick succession: the third returns 429 `LLM_RATE_LIMITED` with a `Retry-After` header, and the provider is never called (check `llm_usage_events` has exactly two rows). Wait 60s and the next one succeeds. Then set a per-user ceiling of 1 in the admin panel and confirm it overrides the server default for that user only.

**7. Provider stubs** — `GET /api/v1/config/llm-providers/available` lists Google as available and Anthropic/OpenAI as unavailable; the settings UI renders the latter two disabled; `PUT /config/llm-providers/anthropic` returns 422 `PROVIDER_NOT_AVAILABLE`.

**8. Eval harness unaffected** — `uv run python -m app.evals.run` (replay mode) still passes its thresholds, proving B5's signature changes didn't disturb the extraction path.
