# Agent Identities — Design

**Date:** 2026-10-16
**Status:** Draft for review (feasibility study approved; approach A chosen)

## Problem

An API key today acts *as* the human who owns it. Everything an agent does (comments,
status changes, history) is recorded under that person's name, and a key cannot be
limited to particular projects. The only workaround is registering a fake user with an
email and adding it to projects by hand.

## Goals

1. **Attribution** — agent activity appears under the agent's own name, visibly marked as
   a bot.
2. **Isolation** — an agent reaches only the projects it was added to, with its own
   per-project role, so a leaked key exposes those projects, not the owner's account.
3. **Low friction** — a user creates an agent with a name and gets a key. No email, no
   sign-up flow.

## Non-goals (v1)

- Agents creating agents or managing keys.
- Agents with their own LLM credentials or access to natural-language capture (see Decisions).
- Per-agent rate limits, org/team-level agent sharing, agent-to-agent delegation.
- Hard-deleting agents.

## Approach

Agents are `users` rows with `kind = 'agent'` and an `owner_id`. Everything that already
keys off `user_id` (project membership, comments, status history, assignees, created-by,
RBAC) works unchanged. Agent API keys are the existing `api_keys` rows, with `user_id`
pointing at the agent. This keeps a single actor table, consistent with the project's
"no polymorphic FKs" decision.

## Data model

Migration on `users`:

| Change | Detail |
|---|---|
| `kind` | `String(16)` NOT NULL, default/server_default `'human'`; values `human`, `agent` |
| `owner_id` | UUID FK `users.id`, nullable, `ondelete="RESTRICT"`, indexed |
| `email` | becomes nullable (unique index still allows many NULLs in Postgres) |
| `password_hash` | becomes nullable |

Constraints:

- `CHECK (kind = 'human' AND email IS NOT NULL AND password_hash IS NOT NULL AND owner_id IS NULL
  OR kind = 'agent' AND email IS NULL AND password_hash IS NULL AND owner_id IS NOT NULL)`
- Partial unique index on `(owner_id, lower(name)) WHERE kind = 'agent'` — names unique per owner.

Agent rows: global `role = contributor`, `email_confirmed = true`, `is_blocked = false`.
`is_blocked` doubles as "deactivated".

`RESTRICT` on `owner_id` matters: most `created_by` FKs and `projects.owner_id` use
`ondelete="CASCADE"`, so removing a user row would erase everything it wrote.

## Lifecycle rules

- **Create**: a human (JWT only) creates an agent with a name; the response returns the
  first API key once, plus label, scopes and expiry (reusing existing key creation).
- **Deactivate** (replaces delete): sets `is_blocked = true` and revokes all its keys.
  History, comments and tasks remain, attributed to the agent. Reactivation allowed.
- **Owner blocked** → their agents are rejected too (checked in
  `get_current_user_or_api_key`: load the owner when `kind == 'agent'`).
- **Admin delete of a user who owns agents** is refused with a clear error until the
  agents are deactivated and the admin explicitly confirms; the RESTRICT FK enforces it.
- **Key rotation**: owner may create further keys for the agent and revoke old ones,
  using the existing key machinery.

## Authorization

- Agent management endpoints (`/agents/*`) require a **human JWT**: the dependency rejects
  API-key requests and `kind == 'agent'`. This prevents agents creating agents or minting keys.
- Only an agent's **owner** may view, rename, rotate, or deactivate it. Admins can
  deactivate any agent via the admin panel.
- **Adding to a project**: allowed only when the caller is the agent's owner **and** a
  Manager of that project (decided). Other managers of the project may see the agent and
  remove it, but not attach someone else's agent.
- **Project role for agents**: Contributor or Manager, chosen at attach time (existing
  `project_members.role`). The UI warns that Manager lets the agent create/delete.
  Contributors cannot create stories/tasks (`require_manager` guards create paths), so
  agents that must create tasks need Manager on that project.
- Agents never authenticate by password or JWT: `login`, `resend_confirmation`,
  `request_password_reset` and the admin reset in `users_service.py` reject `kind == 'agent'`
  (the null `password_hash` already fails bcrypt, but guard explicitly and return the same
  generic error).

## Surfaces affected

Backend:
- `app/db/models/user.py` + Alembic migration.
- `app/auth/dependencies.py` — owner-blocked check; `require_human` dependency.
- `app/api/services/auth_service.py`, `app/admin/users_service.py` — agent guards.
- `app/api/services/project_service.py` — member responses return `email` as nullable;
  add-agent-to-project service honouring the owner+Manager rule.
- `app/api/services/invitation_service.py` — invitations target human emails only; agents
  are attached directly, never invited.
- `app/api/services/capture_resolution_service.py:80` — `m.email.split("@")` must handle
  NULL email (match on name).
- New `app/api/schemas/agent.py`, `services/agent_service.py`, `routes/agents.py`.
- `app/core/config.py` — `MAX_AGENTS_PER_USER = 20`.
- `app/api/services/capture_service.py` / `routes/tasks.py` capture + confirm — reject agents.
- Admin panel and any user counts filter on `kind`.
- Response schemas for users/members gain `kind` so clients can badge bots.

MCP / CLI: no protocol change. `whoami` already returns the identity; it will show the
agent name and `kind`. CLI `projects members` table must tolerate empty email.

Frontend:
- Settings → "Agents" section: create (name), list, rotate key, deactivate.
- Project members UI: "Add agent" picker (owner's agents only) with role selector.
- Bot badge wherever user names render (comments, history, assignee, member lists).
- i18n keys in both `en-GB.json` and `pl.json`.

## Decisions and open items

| Item | Decision |
|---|---|
| Who may add an agent to a project | Owner who is Manager of that project |
| Delete | Not offered; deactivate only |
| Agent LLM credentials / `capture_tasks` | Agents do not get capture. `POST /projects/{id}/tasks/capture` and its confirm endpoint reject `kind == 'agent'` with 403 (a `require_human` check in the service, not only the route). The `capture_tasks` / `confirm_capture` MCP tools stay registered (they are shared with humans' keys) and surface that 403 as their error. Agents have no `user_llm_providers` rows, so nothing is billed to the owner |
| Agent count limit per user | Hard limit of 20 agents per owner, counting active and deactivated agents (deactivated rows still exist; otherwise the cap is bypassed by churn). Configured as `MAX_AGENTS_PER_USER: int = 20` in `app/core/config.py` (env-overridable, no migration needed to change it). Create returns 409 `AGENT_LIMIT_REACHED` once the owner is at the limit; the check runs in `agent_service.create_agent` and is covered by a test that sets the setting low |
| Agent as project owner (`projects.owner_id`) | Disallowed; agents can't create projects (Contributor global role, and project creation requires a human) |

## Testing

- Model/migration: constraint rejects an agent with an email or a human without one;
  per-owner name uniqueness; RESTRICT blocks deleting an owner with agents.
- Auth: agent key authenticates and acts as the agent; agent cannot log in, reset a
  password, or call `/agents/*`; deactivated agent and agent of a blocked owner get 403.
- Authorization: non-owner cannot manage; owner who is only Contributor on a project
  cannot attach; attached agent sees only its projects (404/403 elsewhere).
- Attribution: comment, status change and task creation by an agent show the agent's id
  and `kind='agent'` in responses and history.
- Limits: the 21st agent returns 409 (test with the setting lowered); deactivated agents count toward the cap.
- Capture: an agent key calling capture and confirm gets 403.
- Regression: capture-resolution with a NULL-email member; member list serialization;
  existing human flows unchanged.
- Frontend: Agents settings flow, add-agent picker, bot badge rendering.

## Rollout

Single migration, backward compatible (`kind` defaults to `human`; existing rows satisfy
the CHECK). No data backfill. Frontend ships with the backend since responses gain `kind`.
