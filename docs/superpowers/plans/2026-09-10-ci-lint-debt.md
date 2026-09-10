# CI Lint Debt — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-09-10
**Status:** approved 2026-09-10 — not started.

**Goal:** Make `Backend CI` and `Frontend CI` pass on `main` for the first time, by fixing the 34 ruff errors, 8 unformatted files, and 29 ESLint errors that the lint gates have always rejected.

**Architecture:** One branch off `main`, backend first (largely mechanical), frontend second (real refactoring). Each task ends green on its own gate and is committed separately. No behaviour changes — every task must leave both test suites passing.

**Tech Stack:** Python 3.11+ · ruff 0.15.10 (pinned in `backend/uv.lock`) · uv · React 19 + TypeScript · ESLint 9.39.5 + eslint-plugin-react-hooks 7.1.1 (pinned in `frontend/package-lock.json`) · vitest

**Spec:** none — this plan is its own spec. The findings in §1 were gathered by reading the repo and CI at `origin/main` = `31b36ea` on 2026-09-10.

---

## 1. What the CI history actually says

**These workflows have never passed on `main`.** Every run, as far back as the API returns:

| Workflow | Runs on `main` | Success |
|---|---|---|
| `.github/workflows/ci.yml` | 24 | **0** |
| Backend CI | 17 | **0** |
| Frontend CI | 11 | **0** |
| Security Scanning | 37 | 37 |

This is **not** a regression from a dependency bump. Both lockfiles are committed and both CI jobs install from them (`uv sync`, `npm ci`), so tool versions are deterministic and have been stable — `uv.lock` has pinned `ruff 0.15.10` across the commits either side of the last dependency bump (`c8d4e61`). The code has simply never satisfied the lint configuration it ships with, and merges have proceeded over red CI.

Two consequences that shape this plan:

1. **The backend test suite has never run in CI.** `backend.yml:46` gates on `ruff check && ruff format --check` before the pytest step, so pytest is never reached. Verified locally on 2026-09-10: **647 passed** in 4m40s. Nothing is hiding behind the gate, but re-verify before trusting it.
2. **The frontend has no test step in CI at all.** `frontend.yml` runs install → lint → build. `npm test` is never invoked. Adding it is out of scope here and recorded as a follow-up in §4.

**Only errors block.** `frontend/package.json` runs `eslint .` with no `--max-warnings`, so the 14 `react-hooks/exhaustive-deps` **warnings do not fail CI** and are explicitly out of scope. Do not fix them in this plan; see §4.

## 2. Global Constraints

- **Branch from `main`, not from `feature/nl-task-capture`.** The feature branch will be rebased onto the result afterwards. Base commit: `origin/main` = `31b36ea`.
- **No behaviour changes.** This is a lint-debt plan. If a fix would alter runtime behaviour, stop and flag it rather than shipping it.
- **Backend gate (both halves):** `cd backend && uv run ruff check . && uv run ruff format --check .` must exit 0.
- **Frontend gate:** `cd frontend && npm run lint` must exit 0, and `npm run build` must succeed.
- **Test suites must not regress.** Record baselines in Task 1 and compare after every task.
- **Commit per task.** Each task's commit message is given in its final step.
- Do not touch the 9 open Dependabot PRs (#42–#50) during this plan. They are triaged in §4 after CI is green.

## 3. File map

**Backend** — 9 files, all mechanical:

| File | What changes |
|---|---|
| `app/api/services/project_service.py` | move a misplaced statement (10× E402), wrap 1 line, reformat |
| `app/api/services/project_status_service.py` | wrap 1 line |
| `app/api/services/story_service.py` | wrap 1 line, reformat |
| `app/api/services/timeline_service.py` | reformat only |
| `app/auth/permissions.py` | 1 quoted annotation |
| `app/db/database.py` | 1 unused import |
| `tests/test_api_comments.py` | wrap 1 docstring |
| `tests/test_api_stories.py`, `tests/test_api_tasks.py`, `tests/test_api_timeline.py` | unused imports, import sorting, reformat |
| `tests/test_auth_hardening.py`, `tests/test_capture_service.py`, `tests/test_pagination.py` | unused imports, redefinitions, `datetime.UTC` |

**Frontend** — 18 files across three shapes:

| Shape | Count | Files |
|---|---|---|
| A: data-load effect | 14 | `hooks/useProjectStatuses.ts`, `hooks/useProjectSprints.ts`, `hooks/useRole.ts`, `components/comments/CommentList.tsx`, `components/status-history/StatusHistoryTimeline.tsx`, `components/config/ProjectStatusManager.tsx` (Task 7); `pages/SearchResultsPage.tsx`, `pages/TimelineView.tsx`, `pages/ConfigPage.tsx`, `pages/ProjectDetailPage.tsx`, `pages/SprintView.tsx`, `pages/StoryDetailPage.tsx` (×2), `context/AuthContext.tsx` (Task 8) |
| B: prop-sync effect | 2 | `components/settings/TabConfigPanel.tsx` (Task 9) |
| C: case-by-case | 7 | `components/tasks/CreateTaskModal.tsx` (×3), `components/layout/CommandPalette.tsx` (×3), `components/common/Menu.tsx` (Task 9) |
| D: non-hook errors | 6 | `pages/ProjectsPage.tsx`, `hooks/useProjects.ts` (Task 6); `context/AuthContext.tsx` (×3 — 1 in Task 6, 2 in Task 10), `context/ThemeContext.tsx` (Task 10) |

A + B + C = 23 `set-state-in-effect`; D = 2 `no-unused-vars` + 1 `immutability` + 3 `react-refresh`. Total 29, matching the baseline in Task 1.

---

## Task 1: Branch and baseline

**Files:** none modified.

**Interfaces:**
- Produces: a branch `fix/ci-lint-debt` based on `31b36ea`, and four recorded baseline numbers used as the pass/fail reference by every later task.

- [ ] **Step 1: Create the branch off main**

```bash
cd /Users/lechowski/dev/simple-project-tool
git fetch origin main
git switch --detach origin/main
git switch -c fix/ci-lint-debt
git log --oneline -1   # expect 31b36ea Github dependabot settings changed
```

- [ ] **Step 2: Record the lint baseline**

```bash
cd backend && uv sync
uv run ruff check . --statistics
uv run ruff format --check . 2>&1 | tail -1
cd ../frontend && npm ci
npm run lint 2>&1 | tail -1
```

Expected, exactly:
- ruff: `Found 34 errors.` / `[*] 19 fixable with the --fix option.`
- ruff format: `8 files would be reformatted, 116 files already formatted`
- eslint: `✖ 43 problems (29 errors, 14 warnings)`

If any number differs, **stop** — the tree is not the one this plan was written against.

- [ ] **Step 3: Record the test baseline**

```bash
cd backend && uv run pytest -q 2>&1 | tail -1     # takes ~5 min
cd ../frontend && npx vitest run 2>&1 | tail -4
```

Write both numbers down. Backend was **647 passed** on 2026-09-10. The frontend number is whatever `main` reports — record it; every later task must match it exactly.

- [ ] **Step 4: Commit nothing, but confirm a clean tree**

```bash
git status --short   # expect empty
```

---

## Task 2: Backend — apply the auto-fixable ruff rules

**Files:**
- Modify: `backend/app/db/database.py`, `backend/app/auth/permissions.py`, `backend/tests/test_api_stories.py`, `backend/tests/test_api_tasks.py`, `backend/tests/test_api_timeline.py`, `backend/tests/test_auth_hardening.py`, `backend/tests/test_pagination.py`

**Interfaces:**
- Consumes: the branch and baselines from Task 1.
- Produces: ruff error count drops from 34 to 15 (only `E402` ×10 and `E501` ×5 remain).

This covers 19 findings: 11 `F401` unused imports, 4 `I001` unsorted import blocks, 2 `F811` redefinitions, 1 `UP017` (`timezone.utc` → `datetime.UTC`), 1 `UP037` (quoted annotation).

- [ ] **Step 1: Apply the fixes**

```bash
cd backend && uv run ruff check . --fix
```

- [ ] **Step 2: Read the diff before trusting it**

```bash
git diff
```

Two things to check by eye, because `--fix` removing an import is only safe if the name really is unused:

1. `tests/test_auth_hardening.py` — lines 4 and 6 import `MagicMock` and `bcrypt` at module scope, and lines 116/118 import them **again inside a test function**. Ruff removes the module-scope pair as unused (`F401`) and the function-scope pair as redefinitions (`F811`). Confirm exactly one surviving import of each, and that it is in scope wherever it is used.
2. `tests/test_pagination.py:48` — `timezone.utc` becomes `datetime.UTC`. Confirm the `timezone` import is dropped only if nothing else in the file uses it.

- [ ] **Step 3: Verify the remaining count**

```bash
uv run ruff check . --statistics
```

Expected:
```
10	E402 	[ ] module-import-not-at-top-of-file
 5	E501 	[ ] line-too-long
Found 15 errors.
```

- [ ] **Step 4: Run the tests**

```bash
uv run pytest -q 2>&1 | tail -1
```

Expected: the same count as the Task 1 baseline (647 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "style(backend): apply ruff autofixes (unused imports, import order, UP017/UP037)"
```

---

## Task 3: Backend — fix the 10 E402 errors in project_service.py

**Files:**
- Modify: `backend/app/api/services/project_service.py:1-23`

**Interfaces:**
- Consumes: Task 2's tree.
- Produces: ruff error count drops from 15 to 5.

**Cause:** a single misplaced statement. `_logger = logging.getLogger(__name__)` sits on line 5, between the stdlib imports and the third-party imports, so ruff correctly reports every import below it as "not at top of file". All 10 `E402`s are that one statement. Current head of file:

```python
import logging
import uuid
from datetime import UTC, datetime

_logger = logging.getLogger(__name__)          # ← line 5, the cause

from fastapi import HTTPException
from sqlalchemy import and_, or_, select, tuple_
...
from app.db.models import Project, ProjectMember, StatusHistory, Story, User
```

- [ ] **Step 1: Move the logger below the imports**

Delete the `_logger` line (and the blank line after it) from line 5, and reinsert it after the final import — i.e. after `from app.db.models import Project, ProjectMember, StatusHistory, Story, User` — separated by one blank line:

```python
import logging
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import and_, or_, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.pagination import decode_cursor, encode_cursor
from app.api.schemas.common import PaginatedResponse
from app.api.schemas.project import (
    MemberAdd,
    MemberResponse,
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
)
from app.api.utils import escape_like
from app.auth.permissions import require_manager, require_not_demo, require_project_access
from app.db.base import PriorityEnum, RoleEnum
from app.db.models import Project, ProjectMember, StatusHistory, Story, User

_logger = logging.getLogger(__name__)
```

- [ ] **Step 2: Verify**

```bash
cd backend && uv run ruff check . --statistics
```

Expected:
```
5	E501 	[ ] line-too-long
Found 5 errors.
```

- [ ] **Step 3: Run the tests**

```bash
uv run pytest -q 2>&1 | tail -1
```

Expected: 647 passed.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/services/project_service.py
git commit -m "style(backend): move module logger below imports to clear E402"
```

---

## Task 4: Backend — wrap the 5 over-length lines

**Files:**
- Modify: `backend/app/api/services/project_service.py:259`, `backend/app/api/services/project_status_service.py:147`, `backend/app/api/services/story_service.py:215`, `backend/tests/test_api_comments.py:98`, `backend/tests/test_api_stories.py:138`

**Interfaces:**
- Consumes: Task 3's tree.
- Produces: `ruff check` exits 0.

Line limit is 100. Note line numbers shift by one after Task 3 removes a line from `project_service.py` — locate by content, not by number.

- [ ] **Step 1: Wrap `project_service.py` (141 chars)**

From:
```python
        result.append(MemberResponse(user_id=m.user_id, role=m.role, joined_at=m.joined_at, name=member_user.name, email=member_user.email))
```
To:
```python
        result.append(
            MemberResponse(
                user_id=m.user_id,
                role=m.role,
                joined_at=m.joined_at,
                name=member_user.name,
                email=member_user.email,
            )
        )
```

- [ ] **Step 2: Wrap `project_status_service.py` (134 chars)**

From:
```python
            detail=f"Status '{status.slug}' is in use by {task_count} task(s) and {story_count} story/stories. Reassign them first.",
```
To:
```python
            detail=(
                f"Status '{status.slug}' is in use by {task_count} task(s) "
                f"and {story_count} story/stories. Reassign them first."
            ),
```

The rendered string is unchanged — note the trailing space after `task(s) ` on the first fragment. This string is user-facing; do not reword it.

- [ ] **Step 3: Wrap `story_service.py` (109 chars)**

From:
```python
        update(Task).where(Task.story_id == story_id).values(project_id=new_project_id, status=default_slug)
```
To:
```python
        update(Task)
        .where(Task.story_id == story_id)
        .values(project_id=new_project_id, status=default_slug)
```

Check the surrounding expression: if this is already inside a call such as `await db.execute(...)`, the chained form needs no extra parentheses. If it is a bare statement, wrap it in `(` `)`.

- [ ] **Step 4: Wrap the two test docstrings**

`tests/test_api_comments.py:98` (106 chars) — from:
```python
    """A global manager who is NOT a project member must get 403 when deleting another user's comment."""
```
To:
```python
    """A global manager who is NOT a project member must get 403 when deleting
    another user's comment."""
```

`tests/test_api_stories.py:138` (104 chars) — from:
```python
    """Moving a story to another project resets its tasks' statuses to the target project's default."""
```
To:
```python
    """Moving a story to another project resets its tasks' statuses to the
    target project's default."""
```

- [ ] **Step 5: Verify `ruff check` is clean**

```bash
cd backend && uv run ruff check .
```

Expected: `All checks passed!`

- [ ] **Step 6: Run the tests**

```bash
uv run pytest -q 2>&1 | tail -1
```

Expected: 647 passed.

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "style(backend): wrap five over-length lines to the 100-char limit"
```

---

## Task 5: Backend — apply ruff format

**Files:**
- Modify: `backend/app/api/services/project_service.py`, `backend/app/api/services/story_service.py`, `backend/app/api/services/timeline_service.py`, `backend/tests/test_api_stories.py`, `backend/tests/test_api_tasks.py`, `backend/tests/test_api_timeline.py`, `backend/tests/test_auth_hardening.py` (plus any file Tasks 2–4 touched)

**Interfaces:**
- Consumes: Task 4's tree.
- Produces: the **whole backend gate** green — this is the task that turns Backend CI's lint step from red to green.

`ruff format --check` is the second half of `backend.yml:46` and fails independently of `ruff check`. On `main` it reports 8 files.

- [ ] **Step 1: Format**

```bash
cd backend && uv run ruff format .
```

- [ ] **Step 2: Review the diff**

```bash
git diff --stat
git diff
```

This is pure whitespace and line-joining. If the diff shows anything that looks semantic, stop and investigate.

- [ ] **Step 3: Verify the full backend gate exactly as CI runs it**

```bash
cd backend && uv run ruff check . && uv run ruff format --check .
```

Expected: `All checks passed!` then `120 files already formatted` (count may differ by a file or two; the requirement is that nothing "would be reformatted").

- [ ] **Step 4: Run the tests**

```bash
uv run pytest -q 2>&1 | tail -1
```

Expected: 647 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "style(backend): apply ruff format"
```

---

## Task 6: Frontend — the four non-hook errors

**Files:**
- Modify: `frontend/src/hooks/useProjects.ts:28`, `frontend/src/context/AuthContext.tsx:66`, `frontend/src/pages/ProjectsPage.tsx:73-81`

**Interfaces:**
- Consumes: Task 5's tree.
- Produces: eslint error count drops from 29 to 26. Leaves the 3 `react-refresh` errors for Task 10.

- [ ] **Step 1: Fix the unused `catch` binding**

`src/hooks/useProjects.ts:28` — `'e' is defined but never used`. From:
```ts
    } catch (e: unknown) {
      pagination.setError('Failed to load projects')
```
To:
```ts
    } catch {
      pagination.setError('Failed to load projects')
```

Optional catch binding is ES2019 and already used elsewhere in this codebase (e.g. `ResetPasswordPage.tsx`).

- [ ] **Step 2: Fix the unused parameter**

`src/context/AuthContext.tsx:66` — `'_token' is defined but never used` on `async function loadUserConfig(_token: string)`. The underscore shows the intent was already "deliberately unused", so honour that intent in config rather than at the call site. Add to `frontend/eslint.config.js`, inside the main `{ files: ['**/*.{ts,tsx}'], ... }` block, a `rules` key:

```js
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
```

If the block already has a `rules` key, merge into it rather than adding a second.

- [ ] **Step 3: Fix the use-before-declaration**

`src/pages/ProjectsPage.tsx:76` — `react-hooks/immutability`: *"Cannot access variable before it is declared"*. `setShowCreate` is called at line 76 inside a `useEffect`, but `const [showCreate, setShowCreate] = useState(false)` is not declared until line 81. It works at runtime because the effect body runs after render, but the rule is right to reject it.

Move the `useState` declaration **above** the `useEffect` that uses it:

```ts
  const [showCreate, setShowCreate] = useState(false)

  const location = useLocation()
  useEffect(() => {
    if ((location.state as { modal?: string } | null)?.modal === 'create-project') {
      setShowCreate(true)
      window.history.replaceState({}, '')
    }
  }, [location.state])
```

Do not reorder any other hook — hook call order must stay otherwise identical.

- [ ] **Step 4: Verify**

```bash
cd frontend && npm run lint 2>&1 | tail -1
```

Expected: `✖ 40 problems (26 errors, 14 warnings)`

- [ ] **Step 5: Run the tests**

```bash
npx vitest run 2>&1 | tail -4
```

Expected: the Task 1 baseline count.

- [ ] **Step 6: Commit**

```bash
git add frontend/
git commit -m "fix(frontend): clear unused bindings and a use-before-declare in ProjectsPage"
```

---

## Task 7: Frontend — establish and apply the data-load effect pattern

**Files:**
- Modify: `frontend/src/hooks/useProjectStatuses.ts` (first, as the reference), then `frontend/src/hooks/useProjectSprints.ts:25`, `frontend/src/hooks/useRole.ts:19`, `frontend/src/components/comments/CommentList.tsx:31`, `frontend/src/components/status-history/StatusHistoryTimeline.tsx:25`, `frontend/src/components/config/ProjectStatusManager.tsx:284`

**Interfaces:**
- Consumes: Task 6's tree.
- Produces: the verified fix pattern reused by Tasks 8 and 9. Hook public APIs must not change — `useProjectStatuses` keeps returning `{ statuses, loading, error, refresh }` and `refresh` stays a zero-argument function.

**Why the obvious fixes don't work.** `react-hooks/set-state-in-effect` follows the call graph out of the effect body. Both of these were tried against ESLint 9.39.5 + plugin 7.1.1 on 2026-09-10 and **still error**:

```ts
useEffect(() => { fetch() }, [fetch])        // errors — rule follows into fetch()
useEffect(() => { void fetch() }, [fetch])   // errors — `void` changes nothing
```

The rule permits setState inside a **callback** (its own message says so: *"Subscribe for updates from some external system, calling setState in a callback function when external state changes"*). So the fix is to move every setState into a promise callback and out of anything synchronously reachable from the effect body.

- [ ] **Step 1: Rewrite `useProjectStatuses.ts` as the reference implementation**

This exact file was verified lint-clean on 2026-09-10. Replace the whole file with:

```ts
import { useCallback, useEffect, useState } from 'react'
import { statusesApi } from '../services/api'
import type { ProjectStatusResponse } from '../services/api'

export function useProjectStatuses(projectId: string | undefined) {
  const [statuses, setStatuses] = useState<ProjectStatusResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Bumped by refresh() to re-run the effect. The fetch cannot simply be
  // called from the effect body: react-hooks/set-state-in-effect follows the
  // call into it and rejects the setState inside, so the request has to be
  // started here and every setState kept inside a promise callback.
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    statusesApi
      .list(projectId)
      .then((res) => {
        if (!cancelled) setStatuses(res.data)
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load statuses')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, reloadKey])

  const refresh = useCallback(() => setReloadKey((k) => k + 1), [])

  return { statuses, loading, error, refresh }
}
```

- [ ] **Step 2: Verify the reference file is clean**

```bash
cd frontend && npx eslint src/hooks/useProjectStatuses.ts
```

Expected: no output.

- [ ] **Step 3: Apply the same shape to the five remaining shape-A files in this task**

For each of `useProjectSprints.ts`, `useRole.ts`, `CommentList.tsx`, `StatusHistoryTimeline.tsx`, `ProjectStatusManager.tsx`:

1. Delete the `useEffect(() => { someFetch() }, [someFetch])`.
2. Inline the request into the effect, using `.then` / `.catch` / `.finally`.
3. Guard every setState with a `cancelled` flag and return the cleanup that sets it.
4. If the component or hook exposed a manual refresh, replace it with the `reloadKey` bump above and keep the exported name and signature identical.
5. Keep the loading semantics: if the old code set `loading` true synchronously before the request, note that the new shape cannot — initialise the `useState` to the right starting value instead.

- [ ] **Step 4: Verify these six files**

```bash
cd frontend && npx eslint src/hooks/useProjectStatuses.ts src/hooks/useProjectSprints.ts src/hooks/useRole.ts src/components/comments/CommentList.tsx src/components/status-history/StatusHistoryTimeline.tsx src/components/config/ProjectStatusManager.tsx
```

Expected: no errors (warnings are acceptable).

- [ ] **Step 5: Run the tests**

```bash
npx vitest run 2>&1 | tail -4
```

Expected: the Task 1 baseline count. `useRole` and `CommentList` are covered by existing tests — if any fail, the refresh semantics changed and the fix is wrong, not the test.

- [ ] **Step 6: Commit**

```bash
git add frontend/
git commit -m "refactor(frontend): move data-load setState into promise callbacks (hooks, comments, history, statuses)"
```

---

## Task 8: Frontend — the remaining shape-A pages

**Files:**
- Modify: `frontend/src/pages/SearchResultsPage.tsx:71`, `frontend/src/pages/TimelineView.tsx:171`, `frontend/src/pages/ConfigPage.tsx:88`, `frontend/src/pages/ProjectDetailPage.tsx:321`, `frontend/src/pages/SprintView.tsx:372`, `frontend/src/pages/StoryDetailPage.tsx:62,76`, `frontend/src/context/AuthContext.tsx:110`

**Interfaces:**
- Consumes: the pattern proven in Task 7.
- Produces: eslint error count drops to 3 (the `react-refresh` trio) plus whatever Task 9 has not yet cleared.

Same transformation as Task 7, on the page-level and context-level call sites. These are larger files; change only the effect in question.

- [ ] **Step 1: Apply the Task 7 pattern to each site**

Work one file at a time, running `npx eslint <file>` after each. `StoryDetailPage.tsx` has two separate effects (lines 62 and 76) — treat them independently.

`AuthContext.tsx:110` is the session-restore effect and is the highest-risk change in this plan: it decides whether a returning user is logged in. Do not alter the order of `applyTheme`, token refresh, and user load. If the shape cannot be preserved exactly, stop and flag it rather than guessing.

- [ ] **Step 2: Verify**

```bash
cd frontend && npx eslint src/pages/SearchResultsPage.tsx src/pages/TimelineView.tsx src/pages/ConfigPage.tsx src/pages/ProjectDetailPage.tsx src/pages/SprintView.tsx src/pages/StoryDetailPage.tsx src/context/AuthContext.tsx 2>&1 | grep -c "set-state-in-effect"
```

Expected: `0`.

- [ ] **Step 3: Run the tests**

```bash
npx vitest run 2>&1 | tail -4
```

Expected: the Task 1 baseline count. These files carry a lot of the suite (`ProjectDetailPage` alone has 9 test files), so a regression here will be loud.

- [ ] **Step 4: Manually verify the auth path**

```bash
cd backend && uv run python -m app.main   # terminal 1
cd frontend && npm run dev                # terminal 2
```

Log in, reload the page, and confirm you are still logged in and the theme is correct. `AuthContext` changes are not fully covered by the suite.

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "refactor(frontend): move page-level data-load setState into promise callbacks"
```

---

## Task 9: Frontend — prop-sync and the case-by-case remainder

**Files:**
- Modify: `frontend/src/components/settings/TabConfigPanel.tsx:73-74`, `frontend/src/components/common/Menu.tsx:163`, `frontend/src/components/layout/CommandPalette.tsx:134,147,169`, `frontend/src/components/tasks/CreateTaskModal.tsx:50,57,63`

**Interfaces:**
- Consumes: Tasks 7–8.
- Produces: zero `set-state-in-effect` errors repo-wide.

- [ ] **Step 1: Fix the prop-sync pair in `TabConfigPanel.tsx`**

These two effects mirror props into local state:

```ts
  useEffect(() => { setLocalOrder(tabOrder) }, [tabOrder])
  useEffect(() => { setLocalHidden(hiddenTabs) }, [hiddenTabs])
```

Replace with React's documented "adjust state during render" pattern, verified lint-clean on 2026-09-10:

```ts
  // Re-sync when the parent hands down a different set. React's documented
  // "adjust state during render" pattern: it runs before children render, so
  // there is no cascading second pass, and it is not an effect.
  const [syncedFrom, setSyncedFrom] = useState({ tabOrder, hiddenTabs })
  if (syncedFrom.tabOrder !== tabOrder || syncedFrom.hiddenTabs !== hiddenTabs) {
    setSyncedFrom({ tabOrder, hiddenTabs })
    setLocalOrder(tabOrder)
    setLocalHidden(hiddenTabs)
  }
```

Then remove `useEffect` from the React import if nothing else in the file uses it — leaving it produces a fresh `no-unused-vars` error, which is exactly what happened when this was trialled.

- [ ] **Step 2: Fix the three `CreateTaskModal.tsx` sites (lines 50, 57, 63)**

All three are the same shape: *initialise a form field once its source data arrives.*

```ts
  useEffect(() => {
    if (statuses.length > 0 && !taskStatus) setTaskStatus(statuses[0].slug as Status)
  }, [statuses])

  useEffect(() => {
    if (!defaultStoryId && !storyId && storiesHook.items.length > 0) {
      const backlog = storiesHook.items.find(s => s.is_default) ?? storiesHook.items[0]
      setStoryId(backlog.id.toString())
    }
  }, [storiesHook.items])

  useEffect(() => {
    if (user?.id && !assigneeId) setAssigneeId(user.id)
  }, [user?.id])
```

Delete all three effects and compute the effective value during render instead, keeping the state purely for user edits. The `''` empty-state each one already guards on becomes the "not yet chosen" sentinel:

```ts
  // Each field falls back to its default until the user picks something.
  // Previously three effects wrote these defaults into state as the data
  // arrived, which is a cascading render and what set-state-in-effect rejects.
  const effectiveStatus = taskStatus || ((statuses[0]?.slug as Status) ?? '')
  const effectiveStoryId =
    storyId ||
    defaultStoryId ||
    (storiesHook.items.find((s) => s.is_default) ?? storiesHook.items[0])?.id.toString() ||
    ''
  const effectiveAssigneeId = assigneeId || user?.id || ''
```

Then replace every *read* of `taskStatus` / `storyId` / `assigneeId` below this point — the `value=` on the corresponding `<select>`, and the submit handler's payload — with the `effective*` constant. The `onChange` handlers keep calling the plain setters. Check each read with `grep -n "taskStatus\|storyId\|assigneeId" src/components/tasks/CreateTaskModal.tsx`; missing one means the field renders blank or submits the wrong value, and `CreateTaskModal.test.tsx` should catch it.

- [ ] **Step 3: Fix the three `CommandPalette.tsx` sites (lines 134, 147, 169)**

Three different causes; treat them separately.

**Line 134 — reset-on-open.** `useEffect(() => { if (open) { setQuery(''); setResults([]); setFocusedIndex(-1) } }, [open])` clears the palette each time it opens. The component returns `null` when closed but stays mounted, so the state survives. Rather than resetting inside an effect, let the parent give it a fresh instance. Delete this effect, and in `src/components/layout/AppShell.tsx` add a `key` to the `<CommandPalette ... />` element that changes each time it opens — the simplest is a counter bumped in `openPalette()`, or `key={String(paletteOpen)}`. Remounting resets `query`, `results` and `focusedIndex` to their initial values for free.

**Line 147 — the empty-query branch.** In the debounced-search effect:

```ts
    if (!query) {
      setResults([])
      setIsSearching(false)
      return
    }
    setIsSearching(true)
```

Neither line needs to be state. `results` is already emptied by the remount above and by `.catch`, and "is searching" is derivable. Keep the effect and its timer, but delete the `if (!query)` early-return's two setState calls and the synchronous `setIsSearching(true)`; instead start the timer only when `query` is non-empty, and set `isSearching` inside the timer callback (which is a callback, so the rule permits it):

```ts
  useEffect(() => {
    if (!query) return
    const timer = setTimeout(() => {
      setIsSearching(true)
      searchApi
        .search(query)
        .then((res) => setResults(res.data))
        .catch(() => setResults([]))
        .finally(() => setIsSearching(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [query])
```

Then render the results list from `query ? results : []` so a cleared query shows nothing without needing to write state.

**Line 169 — reset focus on list change.** `useEffect(() => { setFocusedIndex(-1) }, [query, results.length])`. This is the adjust-during-render shape from Step 1:

```ts
  const listSignature = `${query}:${results.length}`
  const [focusedFor, setFocusedFor] = useState(listSignature)
  if (focusedFor !== listSignature) {
    setFocusedFor(listSignature)
    setFocusedIndex(-1)
  }
```

`CommandPalette.test.tsx` covers the arrow-key/Enter model directly, so a mistake here fails loudly.

- [ ] **Step 4: Fix `Menu.tsx:163`**

Inside `useLayoutEffect`, the closed branch clears the measured position:

```ts
    if (!open) {
      setPanelPosition(null)
      return
    }
```

`panelPosition` is only meaningful while the menu is open, so clearing it is redundant bookkeeping. Delete those two lines (keep an early `return` when `!open`) and make the single consumer of `panelPosition` treat "closed" as "no position" — i.e. gate the read on `open`, `const position = open ? panelPosition : null`, or rely on the panel not being rendered at all when closed. Do not change `computePanelPosition` or the clamping maths; the portal/`fixed` positioning documented in the comment above this effect is load-bearing and `Menu.test.tsx` plus `ProjectDetailPage.menu.test.tsx` both exercise it.

Do not reach for `// eslint-disable-next-line` in any of these. If a site genuinely needs it, stop and flag it for a human decision rather than committing the suppression.

- [ ] **Step 5: Verify repo-wide**

```bash
cd frontend && npm run lint 2>&1 | tail -1
```

Expected: `✖ 17 problems (3 errors, 14 warnings)` — the 3 remaining errors are all `react-refresh/only-export-components`, cleared in Task 10.

- [ ] **Step 6: Run the tests**

```bash
npx vitest run 2>&1 | tail -4
```

Expected: the Task 1 baseline count. `CommandPalette`, `Menu` and `CreateTaskModal` all have dedicated test files.

- [ ] **Step 7: Commit**

```bash
git add frontend/
git commit -m "refactor(frontend): replace prop-sync effects and remaining setState-in-effect sites"
```

---

## Task 10: Frontend — split the context files for Fast Refresh

**Files:**
- Create: `frontend/src/context/authContext.ts`, `frontend/src/context/themeContext.ts`
- Modify: `frontend/src/context/AuthContext.tsx`, `frontend/src/context/ThemeContext.tsx`, and the import sites listed below

**Interfaces:**
- Consumes: Task 9's tree.
- Produces: `npm run lint` exits 0. `useAuth()`, `useTheme()` and `AuthContext` keep their current names, signatures and behaviour — only the module they live in changes.

**Cause:** `react-refresh/only-export-components` fires because `AuthContext.tsx` exports `AuthProvider` (a component) alongside `AuthContext` (line 32) and `useAuth` (line 153); `ThemeContext.tsx` exports `ThemeProvider` alongside `useTheme` (line 30). Fast Refresh cannot hot-update a module that mixes the two, so this rule is protecting a real developer-experience property, not a style preference.

Import sites to update — `useAuth` is imported by 9 files besides its definition:
`src/test/render.tsx`, `src/test/render.test.tsx`, `src/components/comments/CommentList.tsx`, `src/components/tasks/CreateTaskModal.tsx`, `src/components/layout/ProtectedRoute.tsx`, `src/components/layout/AppShell.tsx`, `src/hooks/useRole.ts`, `src/pages/LoginPage.tsx`, `src/pages/ConfigPage.tsx`.
`useTheme` is imported by 2 files besides its definition — find them with `grep -rl useTheme src`.

Note `src/test/render.tsx` imports `AuthContext` itself (to provide a fake value), so it needs the new path too.

- [ ] **Step 1: Create `src/context/authContext.ts`**

Move the context object, its type, and the hook out of the `.tsx` file. No component may live in this file:

```ts
import { createContext, useContext } from 'react'
import type { UserResponse } from '../services/api'

export interface AuthContextValue {
  user: UserResponse | null
  accessToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshToken: () => Promise<string | null>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

Copy the `AuthContextValue` members verbatim from the existing interface in `AuthContext.tsx` — the list above is transcribed from `main` and must match whatever is actually there after Task 8.

- [ ] **Step 2: Reduce `AuthContext.tsx` to the provider**

Delete the moved declarations and import them instead:

```ts
import { AuthContext } from './authContext'
import type { AuthContextValue } from './authContext'
```

The file must now export only `AuthProvider`.

- [ ] **Step 3: Do the same for `ThemeContext.tsx` → `themeContext.ts`**

Move `ThemeContext`, `ThemeContextValue`, `AccentColor` and `useTheme` into `src/context/themeContext.ts`, leaving `ThemeProvider` as the only export of the `.tsx`. Note `AccentColor` is a type used elsewhere (`ConfigPage.tsx` imports it) — keep the name and update those imports.

- [ ] **Step 4: Update every import site**

```bash
cd frontend && grep -rn "from '.*context/AuthContext'" src | grep -v "context/AuthContext.tsx"
grep -rn "from '.*context/ThemeContext'" src | grep -v "context/ThemeContext.tsx"
```

Repoint each to `.../context/authContext` or `.../context/themeContext`. Components importing `AuthProvider` / `ThemeProvider` keep the old path.

- [ ] **Step 5: Typecheck, lint, build**

```bash
cd frontend && npx tsc -b --noEmit && npm run lint && npm run build
```

Expected: `npm run lint` exits 0 with `✖ 14 problems (0 errors, 14 warnings)`, and the build succeeds.

- [ ] **Step 6: Run the tests**

```bash
npx vitest run 2>&1 | tail -4
```

Expected: the Task 1 baseline count. `src/test/render.tsx` is the shared harness, so if this import move is wrong, everything fails at once.

- [ ] **Step 7: Commit**

```bash
git add frontend/
git commit -m "refactor(frontend): split contexts from providers so Fast Refresh works"
```

---

## Task 11: Verify both gates exactly as CI runs them, and open the PR

**Files:** none modified.

**Interfaces:**
- Consumes: Tasks 2–10.
- Produces: a green PR against `main`, which unblocks the Dependabot queue and gives `feature/nl-task-capture` a clean rebase target.

- [ ] **Step 1: Reproduce both CI jobs locally, command for command**

```bash
cd backend && uv sync && uv run ruff check . && uv run ruff format --check .
cd backend && uv run pytest --cov=app --cov-report=term-missing 2>&1 | tail -3
cd ../frontend && npm ci && npm run lint && npm run build
```

All four must exit 0.

- [ ] **Step 2: Confirm no behaviour drifted**

```bash
git diff origin/main --stat
```

Read the stat. Expect changes confined to the files in §3. If anything under `backend/migrations/`, `backend/app/db/models/`, or `frontend/src/services/api.ts` changed, something went wrong — those are not lint fixes.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin fix/ci-lint-debt
gh pr create --base main --title "Fix lint debt so CI passes on main" --body "$(cat <<'EOF'
Backend CI and Frontend CI have never passed on `main` — 0 successful runs across 17 backend, 11 frontend and 24 combined runs. Both lockfiles are committed and tool versions are deterministic, so this is accumulated lint debt, not a dependency regression.

Fixes 34 ruff errors, 8 unformatted files, and 29 ESLint errors. No behaviour changes.

- Backend: ruff autofixes, a misplaced module logger causing 10 E402s, five over-length lines, `ruff format`
- Frontend: data-load `setState` moved into promise callbacks, prop-sync effects replaced with adjust-during-render, contexts split from providers for Fast Refresh

The 14 `react-hooks/exhaustive-deps` warnings are untouched — `eslint .` runs without `--max-warnings`, so they do not gate CI. Tracked as follow-up.

Note: the backend pytest step has never actually executed in CI, because the ruff gate precedes it. It runs and passes with this change.
EOF
)"
```

- [ ] **Step 4: Confirm CI is green on the PR**

```bash
gh pr checks --watch
```

This should be the first green Backend CI and Frontend CI run in the repository's history.

- [ ] **Step 5: Merge**

Merge to `main` once checks pass. Do not merge any Dependabot PR in the same operation.

---

## 4. Follow-ups (not in this plan)

Record these; do not do them here.

1. **Rebase `feature/nl-task-capture` onto the fixed `main`.** That branch has 20 completed tickets awaiting a merge decision and currently cannot go green either. It also carries its own lint findings that this plan does not cover, because it was written against `main` — expect a small repeat of Tasks 2–5 on the rebased branch. Its baseline as of 2026-09-10: 35 ruff errors (one more than `main`) and the same 29 ESLint errors.
2. **Triage the 9 Dependabot PRs (#42–#50)** once CI can actually tell you whether they pass. Five are major bumps that deserve real review rather than a green tick: `bcrypt 4.1→5.0` (password hashing), `pytest-asyncio 0.23→1.4` (changed `asyncio_mode` default), `eslint 9→10`, `jsdom 29→30`, `@types/node 24→26`. Rebase them onto the fixed `main` first, or they will still show red.
3. **Add a test step to Frontend CI.** `frontend.yml` runs install → lint → build only; `npm test` never runs in CI, so the whole vitest suite is unverified on every merge.
4. **Consider a branch protection rule on `main`** requiring these checks. Nothing currently prevents merging over red CI, which is how this accumulated.
5. **The 14 `react-hooks/exhaustive-deps` warnings.** Non-blocking today. If they are ever promoted to errors, or `--max-warnings 0` is added, they become a second project of similar size.
6. **`frontend/src/index.css:289`** has a dead rule — `font-mono { ... }` is an element selector for an element that does not exist; it was presumably meant to be `.font-mono`. Harmless, unrelated to CI, noticed while reading the file.
