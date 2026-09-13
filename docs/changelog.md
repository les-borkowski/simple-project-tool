# Changelog

All notable changes to simple-project-tool are documented here. Format: reverse chronological (newest first).

## [2026-09-12] - Security & correctness: pre-deploy review fixes

**Category**: Security, Fixes

**API keys now expire.** New keys last 90 days unless you choose otherwise (`expires_in_days`, 1-3650), and the expiry shows in the key list. Keys issued before this change have no expiry and keep working. This branch is the one that hands API keys to third-party LLM hosts, where they live in a config file on the user's machine — an unbounded lifetime meant a leaked key stayed valid until somebody noticed.

**`CREDENTIAL_ENCRYPTION_KEY` is rotatable.** It now accepts comma-separated keys, newest first: encryption uses the first, decryption tries each. `scripts/rotate_credentials.py` re-encrypts stored rows so the old key can be retired. Previously rotating it made every stored credential undecryptable, and the capture path reads that as "no credential" — so an operator rotating for an unrelated reason would have silently moved their whole user base's LLM spend onto the server key.

**`LLM_ALLOW_SERVER_KEY_FALLBACK` now defaults to `False`.** A multi-tenant deployment should not spend the operator's own provider key for users who have not supplied one. Set it to `True` deliberately for a single-tenant or internal instance.

**Password reset is rate limited** — one email per account per 15 minutes. Throttled requests are byte-identical to un-throttled and unknown-address ones, so the limit does not become an account-existence oracle.

**Quick capture says what actually went wrong.** "Not configured", "your key was rejected", "you have hit your limit" and "the provider is unreachable" were all reported as _"temporarily unavailable, try again later"_ — advice that never comes true for the first two. The Story field also reads **Backlog (no story)** instead of rendering blank when no story was resolved.

**`spt tasks capture` accepts `--file` and stdin**, so capture text — which routinely quotes people or describes unreleased work — need not go through your shell history.

**The user manual is translated.** It was 574 lines of hardcoded English, so a `pl` user clicking "Pomoc" got an entirely English document. Content now lives in per-locale modules; the Polish is new and unreviewed by a native speaker.

**Also**: an overall deadline on LLM calls (a throttling provider could previously hold a request for minutes); `bcrypt` moved off the event loop on the API-key path; the LLM rate limit is now claimed before the call rather than recorded after it, so concurrent callers cannot all pass and a failed call still counts; demo accounts can no longer mint API keys; `GET /config/llm-providers/available` requires authentication; and per-credential rate limits are no longer overwritten with the clamped value.

---

## [2026-09-11] - Features: point the CLI at any server, document installing the tools

**Category**: Features

**The CLI can now reach a server other than localhost.** `spt auth login --api-url https://…` saves the
address alongside the tokens — which is the right pairing, since those tokens are only valid on the server
that issued them. For a one-off or a script, `SPT_API_URL` overrides the saved value without being written
to disk; it is the same variable the MCP server already reads, so a single export points both at the same
place. Previously the only way to move the CLI off `http://localhost:8000` was to hand-edit
`~/.config/spt/config.json`. `spt config set` looks like it should have done this but does not — it
patches account preferences on the server, not the CLI's own connection.

**`spt config set` now rejects keys it cannot set** instead of reporting success and changing nothing.
`UserConfigUpdate` does not forbid extra fields, so the server accepted any key, ignored it and returned
200 — which made `spt config set api_base_url …` look like it had worked. Unknown keys now fail with the
list of settable ones, and the two names people actually reach for, `api_base_url` and `api_url`, point at
`spt auth login --api-url` and `SPT_API_URL` instead.

**The manual now says how to install `spt` and `spt-mcp`.** It documented using them in detail but never
said where they come from, opening with `spt auth login` as though the command already existed. Both are
entry points on the backend package, so one install gives you both. Two things that bite in practice are
called out: `uv pip install -e .` puts the commands in `backend/.venv`, which is not on `PATH`, so the
README's install-then-`spt auth login` sequence never actually worked from a fresh shell; and
`claude mcp add … -- spt-mcp` needs the command on the *host's* `PATH`, not merely in a shell where the
virtual environment is active — the likeliest reason an LLM host reports the server failing to start.

---

## [2026-09-10] - Features: agent key self-service, MCP story/comment tools, demo hardening

**Category**: Features

**API keys are now self-service.** The Settings → "API Keys" tab is enabled, with working create and revoke controls (the panel existed but every control was hard-disabled). The scope picker deliberately omits `admin`: the backend accepts it and it expands to every other scope, so offering it as a one-click checkbox invited blanket-access keys for no benefit. `spt config api-keys list` also works again — it was parsing the response as a paginated `{"items": [...]}` envelope, but that endpoint returns a bare JSON array, so the command raised `AttributeError`. It now prints full key ids rather than 8-character prefixes, because the full id is what `api-keys revoke` takes.

**Three new MCP tools**, bringing the total to 16: `get_story`, `update_story`, and `list_comments`. `update_task` also gained `due_date`, `effort`, and `sprint_id` — `create_task` already accepted `due_date`, so an agent could set a deadline at creation and never move it. All four close gaps where the REST endpoint and its scope already existed and only the MCP surface was missing; `list_comments` is the only way to read a project's comment thread, which was previously write-only over MCP.

**Demo accounts are capped at one AI capture every 2 hours**, independent of the RPM/TPM ceilings. Demo accounts can never hold a personal LLM credential, so every demo capture spends the server's own key. The allowance is claimed *before* the provider call, so an attempt that times out still counts — otherwise induced failures would be unmetered.

**Capture can now run offline** for demos: `LLM_PROVIDER=replay` serves recorded fixtures, and `backend/scripts/demo_capture.py` seeds a demo project and records them. Two fixes made this viable — the prompt interpolated member and story names in unordered DB order (now sorted, so fixture keys are stable), and the new `CAPTURE_REFERENCE_DATE` setting pins the reference date the frontend otherwise sets to today, which would have rotted every fixture daily.

The Quick Capture textarea now caps input at 4000 characters with a live counter, matching the limit the API already enforced.

---

## [2026-09-05] - Features: MCP server for AI agents

**Category**: Features

Added `spt-mcp`, an MCP (Model Context Protocol) server (`backend/app/mcp/`) that exposes the tool to LLM hosts such as Claude Code and Claude Desktop. It's a thin async HTTP client over the public REST API — no direct DB, model, or service access — so every existing permission check (`require_project_access`, `require_manager`, `require_scope`) still runs on every tool call, exactly as it would for any other API client.

13 tools are exposed: `whoami`, `list_projects`, `get_project`, `list_stories`, `list_tasks`, `get_task`, `search`, `update_task`, `add_comment`, `create_task`, `create_story`, `capture_tasks`, `confirm_capture`. There are no delete tools and no member-management tools, by design. An agent's actual permissions come entirely from its API key's scopes plus normal per-project RBAC — a read-only agent is a differently-scoped key, not a different server.

Scoped API keys can now do a lot more than the natural-language capture endpoints they were previously limited to: GET on projects (list, get, list members); GET/POST/PATCH on stories and tasks; GET/POST on comments (create and list, no edit). Project create/update/archive/restore, all member management, deletes, admin/config, and most of `/auth` remain JWT-only. `GET /auth/me` now also accepts an API key and reports its label and scopes.

Setup: create a scoped API key (`spt config api-keys create`), then register the server with `claude mcp add` or the equivalent `claude_desktop_config.json` block — see `docs/how-to-run.md`.

---

## [2026-09-04] - Features: Natural-language task capture

**Category**: Features

Added natural-language task capture: type a sentence describing one or more tasks and get structured candidates (title, due date, assignee, story, priority) to review and confirm before anything is created. Available via the "Quick capture" action on the project board (web UI), the `spt tasks capture` CLI command, and directly through the REST API — useful for custom agent integrations.

Extraction is backed by Google Gemini using a constrained-decoding response schema, and the create endpoint requires a `write:tasks`-scoped API key or a logged-in session. Extraction quality is measured by a new eval harness and guarded by a fixture-replay regression test in the standard test suite.

---

## [2026-04-09] - Docs: Initial documentation structure

**Category**: Docs

Created initial documentation structure with:
- `docs/readme.md` - Project overview and features
- `docs/readme_cli.md` - CLI tool documentation and command reference
- `docs/changelog.md` - This change log

Set up automated documentation updates via post-commit git hook.

---

## Guidelines

**Date Format**: `[YYYY-MM-DD]`

**Categories**:
- `Features`: New functionality
- `Fixes`: Bug fixes
- `Improvements`: Enhancements to existing features
- `Docs`: Documentation changes
- `Refactor`: Code refactoring (no functional changes)
- `Breaking Changes`: Changes that break backwards compatibility
- `Security`: Security-related updates

**Entry Format**:
```
## [YYYY-MM-DD] - <Category>: <Summary>

**Category**: <Category>

<Detailed description of what changed and why>

Additional context, related issues, or migration notes if applicable.
```

**Tips**:
- Be concise but informative
- Describe the "why" not just the "what"
- Group related changes under one entry when appropriate
- Use this log to communicate changes to users and developers
