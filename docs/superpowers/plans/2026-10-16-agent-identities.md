# Agent Identities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user create named agents (non-human `users` rows with their own API keys) that can be attached to projects with their own role and appear as distinct, badged actors.

**Architecture:** Agents are `users` rows with `kind='agent'` and `owner_id`, so membership, comments, history and RBAC work unchanged. Agent API keys are the existing `api_keys` rows pointing at the agent. A new `/agents` surface (human-JWT only) handles lifecycle; guards keep agents out of login, reset, invitation, capture and key-management flows.

**Tech Stack:** FastAPI, SQLAlchemy 2 async, Alembic, pytest (asyncpg test DB), React 19 + TypeScript + Vitest, i18next.

**Spec:** `docs/superpowers/specs/2026-10-16-agent-identities-design.md`

## Global Constraints

- Agent rows: `kind='agent'`, `email IS NULL`, `password_hash IS NULL`, `owner_id` NOT NULL, global `role=contributor`, `email_confirmed=true`.
- Human rows: `kind='human'` (default), `email` and `password_hash` NOT NULL, `owner_id IS NULL`.
- `users.owner_id` FK is `ondelete="RESTRICT"`. Agents are deactivated (`is_blocked=true` + all keys revoked), never deleted.
- `MAX_AGENTS_PER_USER: int = 20` in `app/core/config.py`; counts active and deactivated agents; over the limit → 409 `AGENT_LIMIT_REACHED`.
- Agent names are unique per owner, case-insensitive (partial unique index on `(owner_id, lower(name)) WHERE kind='agent'`).
- Only an agent's owner who is a Manager of the project may attach it; project role for agents is `contributor` or `manager`.
- `/agents/*` requires a human JWT: API-key requests and agents are rejected (403).
- Agents are rejected (403) from capture and confirm-capture.
- Every new user-facing string goes into both `en-GB.json` and `pl.json`.
- Run `uv run ruff check . && uv run ruff format .` in `backend/` and `npm run lint` in `frontend/` before each commit.

## Review Focus

- Agent with a password attempting `/auth/login`, forgot-password or resend-confirmation → same generic failure as an unknown email, never a token or an email send.
- Owner blocked → their agent's key stops working (403 `ACCOUNT_BLOCKED`) even though the agent row itself is not blocked.
- Member list, `capture_resolution_service` name matching and `/auth/me` with a NULL-email member must not crash or serialize `null` into a non-nullable field.
- Deactivate then create at the cap: deactivated agents still count, so the 21st create fails.
- Admin deleting a user who owns agents must fail cleanly (FK RESTRICT surfaced as an error), not 500 or cascade-wipe.

---

### Task 1: Schema, config and constraints

**Files:**
- Modify: `backend/app/db/models/user.py`
- Modify: `backend/app/core/config.py` (next to `API_KEY_LEGACY_PREFIX_FALLBACK`)
- Create: `backend/migrations/versions/<rev>_add_agent_identities_to_users.py` (down_revision `fb57c93a3ab2`; generate with `uv run alembic revision --autogenerate -m "add agent identities to users"` then review)
- Test: `backend/tests/test_agent_model.py`

**Interfaces:**
- Produces: `User.kind: Mapped[str]` (`"human"`/`"agent"`), `User.owner_id: Mapped[uuid.UUID | None]`, `User.email` and `User.password_hash` typed `str | None`; `settings.MAX_AGENTS_PER_USER: int`; module constants `KIND_HUMAN = "human"`, `KIND_AGENT = "agent"` in `app/db/models/user.py`.

- [ ] **Step 1: Write failing tests** in `test_agent_model.py` using the `db` fixture: `test_human_default_kind` (new `User` has `kind == "human"` after flush); `test_agent_with_email_rejected` and `test_human_without_email_rejected` (flush raises `IntegrityError`); `test_agent_requires_owner` (agent with `owner_id=None` raises); `test_agent_name_unique_per_owner_case_insensitive` ("Bot" and "bot" for the same owner raises; same name for a different owner succeeds); `test_owner_with_agents_cannot_be_deleted` (delete owner then flush raises `IntegrityError`).
- [ ] **Step 2: Run** `uv run pytest tests/test_agent_model.py -v`. Expected: FAIL (no `kind` column).
- [ ] **Step 3: Implement** the columns on `User` and `MAX_AGENTS_PER_USER = 20`. In the migration, add `kind` with `server_default='human'`, nullable `owner_id` FK with `ondelete="RESTRICT"` plus an index, alter `email`/`password_hash` to nullable, add the CHECK constraint exactly as in the spec's "Data model" section (name it `ck_users_kind_shape`) and the partial unique index `uq_users_agent_owner_name`. Put both constraints in the model's `__table_args__` too so autogenerate stays clean. Write a `downgrade()` that fails loudly if agent rows exist.
- [ ] **Step 4: Run** `uv run alembic upgrade head && uv run alembic downgrade -1 && uv run alembic upgrade head` (Expected: all succeed on an empty agent set), then `uv run pytest tests/test_agent_model.py -v`. Expected: PASS. Also run `uv run pytest -x -q` to confirm no existing test regressed on the nullable columns.
- [ ] **Step 5: Commit** `feat(db): add agent identity columns to users`.

---

### Task 2: Keep agents out of human-only flows

**Files:**
- Modify: `backend/app/auth/dependencies.py`, `backend/app/auth/permissions.py`, `backend/app/api/services/auth_service.py`, `backend/app/admin/users_service.py`, `backend/app/api/services/invitation_service.py`, `backend/app/api/services/capture_resolution_service.py`
- Test: `backend/tests/test_agent_guards.py`

**Interfaces:**
- Consumes: `User.kind`, `KIND_AGENT` (Task 1).
- Produces: `require_human(user: User) -> None` in `permissions.py` (raises `HTTPException(403, "HUMAN_ONLY")` when `user.kind == "agent"`); dependency `get_current_human(...) -> User` in `dependencies.py` (JWT only, rejects agents and API-key auth); `get_current_user_or_api_key` additionally returns 403 `ACCOUNT_BLOCKED` when the key's user is an agent whose owner `is_blocked`.

- [ ] **Step 1: Write failing tests** using a helper `make_agent(db, owner, name="bot") -> User` defined at the top of `test_agent_guards.py` (inserts an agent row; later tasks import it via `tests/helpers.py`, so create `backend/tests/helpers.py` holding it now). Tests: `test_agent_cannot_login` (POST `/api/v1/auth/login` with the agent's name as email and any password → 401 `Invalid email or password`, identical body to an unknown email); `test_forgot_password_and_resend_ignore_agents` (no email task queued; patch `app.core.email.send_email` and assert not called); `test_admin_password_reset_rejects_agent`; `test_agent_key_blocked_when_owner_blocked` (create key via `config_service.create_api_key` for the agent, block the owner, call `GET /api/v1/auth/me` with `X-API-Key` → 403); `test_capture_and_confirm_reject_agent` (POST both capture endpoints with an agent key having `write:tasks` → 403 `HUMAN_ONLY`); `test_resolution_handles_null_email_member` (call the name-matching helper in `capture_resolution_service` with a member whose email is `None`; no exception); `test_admin_delete_user_with_agents_fails_cleanly` (raises a handled error, not a raw `IntegrityError`).
- [ ] **Step 2: Run** `uv run pytest tests/test_agent_guards.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement.** `require_human` + `get_current_human` as above. In `auth_service.login/resend_confirmation/request_password_reset` filter `User.kind == "human"` in the lookups (so agents are indistinguishable from unknown emails). In `users_service.send_password_reset` call `require_human`. In `users_service.delete_user`, catch `IntegrityError` and raise a domain error the admin router renders as a message (follow how that router already reports errors). In `get_current_user_or_api_key`, after loading the user, if `user.kind == "agent"` load `owner_id` and 403 if the owner is blocked or missing. In `capture_resolution_service.preview_capture` and `confirm_capture` call `require_human(user)` first. In the name matcher at `capture_resolution_service.py:80` skip the email comparison when `m.email is None`. `invitation_service` already compares `invitee_email` to `user.email`; add `require_human` to its accept/decline entry points so a `None` email can never match.
- [ ] **Step 4: Run** `uv run pytest tests/test_agent_guards.py -v` then the full `uv run pytest -q`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(auth): keep agents out of human-only flows`.

---

### Task 3: Agent service, routes and project attachment

**Files:**
- Create: `backend/app/api/schemas/agent.py`, `backend/app/api/services/agent_service.py`, `backend/app/api/routes/agents.py`
- Modify: `backend/app/api/main.py` (register router at `/api/v1`), `backend/app/api/services/project_service.py`, `backend/app/api/routes/projects.py`, `backend/app/api/schemas/project.py`, `backend/app/api/schemas/user.py`
- Test: `backend/tests/test_api_agents.py`

**Interfaces:**
- Consumes: `get_current_human`, `require_human`, `require_not_demo`, `require_manager`, `require_project_access`, `config_service.create_api_key(data: APIKeyCreate, user: User, db) -> APIKeyCreatedResponse` (called with the agent as `user`, after the demo guard has passed for the owner).
- Produces (schemas in `agent.py`): `AgentCreate{name: str (1-100 chars, stripped), scopes: list[str] = default read:projects..., expires_in_days}` , `AgentResponse{id, name, is_active: bool, created_at, key_count: int}`, `AgentCreatedResponse(AgentResponse){key: APIKeyCreatedResponse}`. Service functions: `create_agent(data, owner, db) -> AgentCreatedResponse`, `list_agents(owner, db) -> list[AgentResponse]`, `rename_agent(agent_id, name, owner, db) -> AgentResponse`, `deactivate_agent(agent_id, owner, db) -> None`, `reactivate_agent(...) -> AgentResponse`, `list_agent_keys`, `create_agent_key`, `revoke_agent_key` (all owner-checked; unknown or foreign agent → 404). `project_service.add_agent_member(project_id, data: AgentMemberAdd, user, db) -> MemberResponse`. Routes: `POST/GET /agents`, `PATCH /agents/{id}`, `POST /agents/{id}/deactivate`, `POST /agents/{id}/reactivate`, `GET/POST /agents/{id}/api-keys`, `DELETE /agents/{id}/api-keys/{key_id}`, `POST /projects/{project_id}/agents` body `{agent_id, role}`. `MemberResponse.email` becomes `str | None`; `MemberResponse` and `UserResponse` gain `kind: str`.

- [ ] **Step 1: Write failing tests** in `test_api_agents.py` (fixtures: `api_client`, `auth_headers`/`manager_headers`; use `tests/helpers.make_agent` where a row is needed directly). Tests: `test_create_agent_returns_key_once` (201; `key` present; subsequent `GET /agents` has no key); `test_duplicate_name_same_owner_409_case_insensitive`; `test_limit_reached_returns_409_agent_limit` (monkeypatch `settings.MAX_AGENTS_PER_USER = 2`; third create → 409 with detail `AGENT_LIMIT_REACHED`); `test_deactivated_agents_count_toward_limit`; `test_agent_key_acts_as_agent` (`GET /auth/me` with the agent's key returns the agent's name and `kind == "agent"`); `test_agents_endpoints_reject_api_key_and_agents` (API-key and agent-key callers → 403); `test_other_owner_gets_404_on_manage`; `test_deactivate_revokes_keys_and_blocks` (old key then 403 `ACCOUNT_BLOCKED`; history rows remain); `test_reactivate_does_not_restore_keys` (owner must create a new key); `test_attach_requires_owner_and_project_manager` (non-owner 404/403, owner who is only Contributor → 403, owner Manager → 201 with chosen role); `test_attached_agent_sees_only_its_projects` (agent key lists only attached project; direct GET of another project → 403/404); `test_attach_twice_409`; `test_agent_comment_and_status_change_attributed` (agent comments and changes a task status; `author_name` equals agent name; `changed_by` equals agent id); `test_member_list_shows_agent_with_null_email_and_kind`; `test_demo_owner_cannot_create_agent`.
- [ ] **Step 2: Run** `uv run pytest tests/test_api_agents.py -v`. Expected: FAIL (404 routes).
- [ ] **Step 3: Implement** the schemas, service and routes following the existing route→service layering (no DB access in routes). `create_agent`: `require_not_demo(owner)`, count `User` rows where `owner_id == owner.id` against `settings.MAX_AGENTS_PER_USER` (raise 409 `AGENT_LIMIT_REACHED`), insert the agent (role contributor, `email_confirmed=True`, a `UserConfig` row is not required), translate the unique-index `IntegrityError` to 409 `AGENT_NAME_TAKEN`, then issue the first key via `config_service.create_api_key` with `user=agent`. `deactivate_agent`: set `is_blocked=True`, set `revoked_at` on all of the agent's unrevoked keys, one commit. `add_agent_member`: load the agent, require `agent.owner_id == user.id`, require manager role on the project, reject duplicates with 409, then insert the `ProjectMember` and return `MemberResponse`. Leave the existing `add_member` untouched but make it return 404 for `kind='agent'` targets so humans cannot attach someone else's agent through it.
- [ ] **Step 4: Run** `uv run pytest tests/test_api_agents.py -v` then `uv run pytest -q`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): agent identities — lifecycle and project attachment`.

---

### Task 4: Surface `kind` in API clients and docs

**Files:**
- Modify: `backend/app/api/schemas/comment.py`, `backend/app/api/services/comment_service.py` (add `author_kind: str` next to `author_name`), `backend/app/mcp/server.py` (whoami docstring mention only), `backend/app/cli/commands/projects.py:116` (render empty email as `-`), `docs/architecture.md`, `CLAUDE.md` (Data model and Key Decisions rows), `docs/changelog.md`
- Test: `backend/tests/test_agent_surfaces.py`

**Interfaces:**
- Consumes: `kind` on user rows.
- Produces: `CommentResponse.author_kind: str`; `MeResponse.kind` via `UserResponse`.

- [ ] **Step 1: Write failing tests**: `test_comment_by_agent_has_author_kind_agent`, `test_comment_by_human_has_author_kind_human`, `test_cli_members_table_renders_missing_email` (follow `tests/test_cli_commands.py` style, one member with `email=None`, output contains `-` and no traceback).
- [ ] **Step 2: Run** `uv run pytest tests/test_agent_surfaces.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** the field plumbing and the CLI fallback. In the admin panel (`backend/app/admin/users_service.py` listing and its template), show a "Bot" marker and the owner's name for agent rows, and exclude agents from "new user" counts and the email-confirmation/password-reset actions (add `test_admin_user_list_marks_agents` to this task's test file). Update docs (architecture, CLAUDE.md data model line "Agents are `users` rows with `kind='agent'`", the deactivate-not-delete decision, and `MAX_AGENTS_PER_USER`).
- [ ] **Step 4: Run** `uv run pytest -q`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): expose actor kind; document agent identities`.

---

### Task 5: Frontend — Agents settings and bot badge

**Files:**
- Create: `frontend/src/components/config/AgentList.tsx`, `frontend/src/components/common/BotBadge.tsx`
- Modify: `frontend/src/services/api.ts` (types + `agentsApi`), `frontend/src/pages/ConfigPage.tsx` (new `agents` tab after `api_keys`), `frontend/src/locales/en-GB.json`, `frontend/src/locales/pl.json`
- Test: `frontend/src/components/config/AgentList.test.tsx`, `frontend/src/components/common/BotBadge.test.tsx`

**Interfaces:**
- Consumes: Task 3 routes.
- Produces: `AgentResponse`, `AgentCreatedResponse` types; `agentsApi.{list, create, rename, deactivate, reactivate, listKeys, createKey, revokeKey}`; `<BotBadge />` (renders a small "Bot" pill, accessible name from i18n key `agents.badge`); `MemberResponse` gains `kind: 'human' | 'agent'` and `email: string | null`, `CommentResponse` gains `author_kind`.

- [ ] **Step 1: Write failing tests** following `ApiKeyList.test.tsx`: `AgentList` shows empty state; create form posts the name and displays the raw key exactly once in a dismissible dialog; a 409 `AGENT_LIMIT_REACHED` shows the limit message from i18n (no raw detail string); deactivate goes through `ConfirmDialog` and the row then shows an inactive state with a Reactivate action; per-agent key create/revoke calls the right endpoints. `BotBadge` renders text `Bot` and has no interactive role.
- [ ] **Step 2: Run** `npm test -- AgentList BotBadge` (in `frontend/`). Expected: FAIL.
- [ ] **Step 3: Implement** modelled on `ApiKeyList.tsx` (same structure for create / reveal-once / confirm dialogs, `isDemoBlockedError` handling, `getApiErrorMessage`). Keys: `agents.*` in both locale files, including `agents.limit_reached`, `agents.name_taken`, `agents.badge`, `agents.deactivate_confirm`, and a manager-role warning string `agents.manager_warning` for Task 6.
- [ ] **Step 4: Run** `npm test && npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): agents settings tab and bot badge`.

---

### Task 6: Frontend — attach agents to a project, badge in members and comments

**Files:**
- Modify: `frontend/src/pages/ProjectDetailPage.tsx` (members tab around line 1182, `Avatar` at line 121), `frontend/src/services/api.ts` (`projectsApi.addAgent`), comment author rendering in `frontend/src/components/comments/`, locale files
- Test: `frontend/src/pages/ProjectDetailPage.agents.test.tsx` (model on `ProjectDetailPage.modals.test.tsx`), plus an added case in the existing comments component test

**Interfaces:**
- Consumes: `agentsApi.list`, `projectsApi.addAgent(projectId: string, data: { agent_id: string; role: Role })`, `<BotBadge />`.

- [ ] **Step 1: Write failing tests**: members tab for a Manager shows an "Add agent" action listing only active agents not yet members; choosing Manager role shows `agents.manager_warning`; submit calls `addAgent` and appends the member; members whose `kind === 'agent'` render `BotBadge` and no email line (and a `null` email does not render the string "null"); a comment with `author_kind: 'agent'` renders the badge; Contributors don't see "Add agent".
- [ ] **Step 2: Run** `npm test -- ProjectDetailPage.agents`. Expected: FAIL.
- [ ] **Step 3: Implement** the picker (reuse `Modal`), the badge in the members list and comment header, and the `null`-safe email rendering. Do not change `Avatar` sizing or tap targets (the repo has source-lint tests for tap-safe and type-scale; run them).
- [ ] **Step 4: Run** `npm test && npm run lint && npm run build`. Expected: PASS. Then start the dev servers and check in the browser: create an agent, copy the key, attach it to a project, comment as the agent via `curl` with its key, and confirm the badge and name render in both light and dark themes.
- [ ] **Step 5: Commit** `feat(web): attach agents to projects and badge bot actors`.

---

### Task 7: End-to-end check with the MCP server

**Files:**
- Test: `backend/tests/test_agent_mcp_flow.py` (follow the style of the existing `test_mcp_*` tests)

- [ ] **Step 1: Write the test**: create an agent and key through the API, build the MCP client with that key (reuse the fixtures the existing MCP tests use), call `whoami` → agent name and kind; `list_projects` → only the attached project; `create_task` on a project where the agent is Contributor → 403 surfaced as a tool error; after promoting to Manager → succeeds; `capture_tasks` → error mentioning that agents cannot capture.
- [ ] **Step 2: Run** `uv run pytest tests/test_agent_mcp_flow.py -v`. Expected: PASS (all behaviour exists by now; if `whoami` omits `kind`, add it in `app/mcp/server.py` and the `/auth/me` response).
- [ ] **Step 3: Run the full suites** `uv run pytest -q && uv run ruff check . && uv run ruff format --check .` and `npm test && npm run lint`. Expected: all green.
- [ ] **Step 4: Commit** `test(mcp): end-to-end agent identity flow`.
