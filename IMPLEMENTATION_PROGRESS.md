# Security & Quality Fixes Implementation Progress

**Plan File:** `docs/superpowers/plans/2026-06-06-security-and-quality-fixes.md`  
**Date Started:** 2026-06-06  
**Status:** 3 of 10 tasks complete; 2 in progress

---

## Completed Tasks ✅

### Task 1: IDOR + Backlog Protection + Cursor Safety
**Commit:** `6e5b9f2`

- ✅ Fixed IDOR in `delete_task`, `delete_story`, `move_story` by replacing `resolve_role` with `require_project_access`
- ✅ Added Backlog story move guard — prevents moving default stories
- ✅ Fixed cursor decode to return HTTP 400 on malformed input
- ✅ Fixed IDOR in `delete_comment` (quality fix)
- ✅ Extracted `global_manager_headers` fixture to conftest.py for test reuse
- **Tests:** 219/219 passing

### Task 2: Password Reset Security
**Commit:** `2bd8adc`

- ✅ Removed DEBUG token leak from HTTP response — token only logged server-side
- ✅ Added `password_changed_at` nullable column to User model
- ✅ Made reset tokens single-use via `pw_ts` JWT claim
- ✅ Updated `refresh_token_fn` to block unconfirmed users (403)
- ✅ Created Alembic migration `c15015e0f1e5_add_password_changed_at_to_users.py`
- **Tests:** 223/223 passing

### Task 7: Frontend Critical Fixes
**Commit:** `e55a580` + `0eb0909` (quality fixes)

- ✅ Open redirect validation in LoginPage
- ✅ Created `getApiErrorMessage()` typed error helper
- ✅ Replaced unsafe `as` casts in LoginPage, RegisterPage
- ✅ Added `getApiErrorCode()` helper for ConfigPage
- ✅ Fixed `useRole.ts` — safe fallback to `false` instead of global role elevation
- ✅ Added cancellation guards to CommentList, StatusHistoryTimeline, TaskDetailPage
- ✅ Added error handling (try/catch + toast) to StoryDetailPage, InvitationsPage
- ✅ Added i18n for InvitationsPage success toasts
- ✅ TypeScript: 0 errors

---

## In Progress Tasks 🔄

### Task 9: i18n Hardcoded Strings Sweep
**Status:** Implementation running

Replacing ~35 hardcoded English strings with `t()` calls across:
- ProjectsPage, ProjectDetailPage, SprintView, TaskDetailPage, StoryDetailPage
- TimelineView labels (Unassigned, Story, Task)
- CommandPalette (Searching…)
- Adding keys to en-GB.json and pl.json

### Task 3: Backend Auth Hardening
**Status:** Queued for implementation

Planned fixes:
- Session cookie `https_only` in production
- Minimum password length 8 chars
- Login timing oracle fix (bcrypt on dummy hash for missing users)
- Invitation race condition (FOR UPDATE lock)
- ADMIN_USERNAME no default (required)
- User time report access control
- Invitation route ordering

---

## Pending Tasks ⏳

### Task 4: API Key DoS Fix + Scope Validation
- Add `key_prefix` column + migration
- Fix O(1) lookup (prefix filter before bcrypt)
- Validate scopes against known values

### Task 5: Status Delete Orphan Guard + Move Story
- Block delete_project_status when tasks/stories use it (422)
- Reset task statuses on story move

### Task 6: DB Indexes + N+1 Fixes + Query Performance
- Add missing indexes (owner_id, comment FKs, task position)
- Fix N+1 in list_members (batch query)
- Cap timeline at 500 tasks
- Fix story cursor pagination (Backlog disappearing on page 2)

### Task 8: Refresh Token to httpOnly Cookie
- Set cookie on `/auth/login`
- Read cookie on `/auth/refresh`
- Remove localStorage storage in AuthContext
- Add `/auth/logout` endpoint

### Task 10: Housekeeping
- Add `extra="forbid"` to all input schemas
- Filter revoked API keys from list endpoint

---

## Commits So Far

1. `b103c6c` — SprintView dead-props cleanup
2. `9f7d4ad` — Deployment docs expansion
3. `6e5b9f2` — Task 1 quality fixes
4. `2bd8adc` — Task 2 password reset security
5. `0eb0909` — Task 7 quality fixes

---

## Next Steps

1. Wait for Task 9 (i18n) to complete and pass spec/quality review
2. Implement Task 3 (backend auth hardening) → spec review → quality review
3. Implement Tasks 4–6 (DB + API key fixes) in parallel where possible
4. Implement Task 8 (refresh token to cookie)
5. Final housekeeping (Task 10)
