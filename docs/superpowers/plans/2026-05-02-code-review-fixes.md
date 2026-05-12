# Code Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all outstanding bugs and "nice to have" issues identified in the `backend-code-review.md` and `frontend-code-review.md` documents.

**Architecture:** Backend fixes are pure service-layer changes — no schema or route changes needed except adding `DEBUG` to settings. Frontend fixes are either single-line bug fixes or DRY extractions into `utils/` and `components/common/`. No new pages, no routing changes, no library additions.

**Tech Stack:** Python + FastAPI + SQLAlchemy (async), React 19 + TypeScript + Tailwind, pytest (backend), no test framework for frontend (TypeScript compile = verification).

---

## Already Fixed (do not re-implement)

The following were fixed in recent commits on this branch — skip them:
- Backend 1.1 (pagination tuple), 1.2 (`.value` on str), 1.3 (move_story), 1.4 (comment crash), 1.5 (update_task unassign), 1.6 (SprintUpdate validation)
- Frontend 1.3 (loading reset), 1.4 (concurrent refresh), 1.5 (search debounce), 1.9 (theme toggle)
- Frontend 1.2 (group class on ProjectsPage — already present at line 205)

---

## File Map

**Backend — modified:**
- `backend/app/api/services/time_tracking_service.py` — remove Story lookup in task branch; use `task.project_id`
- `backend/app/api/services/comment_service.py` — batch author lookup across all three list functions
- `backend/app/api/services/search_service.py` — add `_escape_like` helper; apply to all ilike calls
- `backend/app/api/services/task_service.py` — apply `_escape_like`
- `backend/app/api/services/project_service.py` — apply `_escape_like`
- `backend/app/api/services/story_service.py` — apply `_escape_like`
- `backend/app/api/services/auth_service.py` — gate real token behind `settings.DEBUG`
- `backend/app/api/main.py` — replace `print`/`traceback.print_exc()` with `logger.exception`
- `backend/app/core/config.py` — add `DEBUG: bool = False`
- `backend/app/db/models/project_status.py` — remove empty `if TYPE_CHECKING: pass`

**Backend — new test files:**
- `backend/tests/test_api_time_tracking.py` — regression tests for task time-metrics on project-level tasks

**Frontend — modified:**
- `frontend/src/pages/SprintView.tsx:126` — replace hardcoded `/tasks/${id}` with `taskHref(task)` (import already present)
- `frontend/src/utils/links.ts` — add `recentLink` export
- `frontend/src/components/layout/AppShell.tsx` — use `recentLink` from utils; use `initials` from utils
- `frontend/src/components/layout/CommandPalette.tsx` — use `recentLink` from utils
- `frontend/src/pages/SearchResultsPage.tsx` — use `recentLink` from utils
- `frontend/src/pages/StoryDetailPage.tsx` — use `DetailField` from common; use `applySortField` from utils; use `initials` from utils
- `frontend/src/pages/TaskDetailPage.tsx` — use `DetailField` from common
- `frontend/src/pages/SprintDetailPage.tsx` — use `DetailField` from common
- `frontend/src/pages/ProjectDetailPage.tsx` — use `applySortField`/`STATUS_ORDER`/`PRIORITY_ORDER` from utils; use `initials` from utils
- `frontend/src/pages/ConfigPage.tsx` — use `initials` from utils; remove density UI
- `frontend/src/pages/InvitationsPage.tsx` — use `initials` from utils
- `frontend/src/context/ThemeContext.tsx` — remove `density` state (unimplemented feature)
- `frontend/src/components/comments/CommentList.tsx` — gray→stone, sky→accent
- `frontend/src/components/status-history/StatusHistoryTimeline.tsx` — gray→stone, sky→accent
- `frontend/src/components/config/ApiKeyList.tsx` — gray→stone, sky→accent
- `frontend/src/components/common/EmptyState.tsx` — gray→stone
- `frontend/src/components/common/MarkdownEditor.tsx` — gray→stone, sky→accent
- `frontend/src/components/common/Skeleton.tsx` — gray→stone
- `frontend/src/components/common/LoadMoreButton.tsx` — gray→stone
- `frontend/src/components/common/ConfirmDialog.tsx` — gray→stone, sky→accent
- `frontend/src/pages/NotFoundPage.tsx` — gray→stone, sky→accent
- `frontend/src/pages/ProtectedRoute.tsx` — sky→accent

**Frontend — new files:**
- `frontend/src/components/common/DetailField.tsx` — shared `<DetailField label children>` component
- `frontend/src/utils/sort.ts` — `applySortField`, `STATUS_ORDER`, `PRIORITY_ORDER`
- `frontend/src/utils/initials.ts` — `initials(name)` helper

**Frontend — deleted:**
- `frontend/src/pages/BacklogPage.tsx` — not imported in App.tsx; dead code

---

## Task 1: Fix time_tracking_service crash for project-level tasks

**Files:**
- Modify: `backend/app/api/services/time_tracking_service.py:30-36`
- Create: `backend/tests/test_api_time_tracking.py`

The `get_status_history` function does `story = await db.get(Story, task.story_id)` then reads `story.project_id`. When a task has no story (`story_id = None`), `db.get` returns `None` and the next line raises `AttributeError`. `Task` already has `project_id`, so the Story lookup is unnecessary.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_api_time_tracking.py`:

```python
import pytest
from httpx import AsyncClient


@pytest.mark.anyio
async def test_task_status_history_for_project_level_task(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    """GET /tasks/{id}/status-history must not crash for story-less tasks."""
    # Create a task directly under the project (no story)
    task_resp = await api_client.post(
        f"/api/v1/projects/{test_project['id']}/tasks",
        json={"title": "Orphan Task"},
        headers=manager_headers,
    )
    assert task_resp.status_code == 201
    task_id = task_resp.json()["id"]

    resp = await api_client.get(
        f"/api/v1/tasks/{task_id}/status-history",
        headers=manager_headers,
    )
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.anyio
async def test_task_time_metrics_for_project_level_task(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    """GET /tasks/{id}/time-metrics must not crash for story-less tasks."""
    task_resp = await api_client.post(
        f"/api/v1/projects/{test_project['id']}/tasks",
        json={"title": "Orphan Task 2"},
        headers=manager_headers,
    )
    assert task_resp.status_code == 201
    task_id = task_resp.json()["id"]

    resp = await api_client.get(
        f"/api/v1/tasks/{task_id}/time-metrics",
        headers=manager_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["total_seconds"] == 0
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && uv run pytest tests/test_api_time_tracking.py -v
```

Expected: FAIL with `AttributeError: 'NoneType' object has no attribute 'project_id'`

- [ ] **Step 3: Fix time_tracking_service.py**

In `backend/app/api/services/time_tracking_service.py`, replace lines 30–36:

```python
    elif item_type == "task":
        task = await db.get(Task, item_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        story = await db.get(Story, task.story_id)
        await require_project_access(user, story.project_id, db)
```

with:

```python
    elif item_type == "task":
        task = await db.get(Task, item_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        await require_project_access(user, task.project_id, db)
```

Also remove `Story` from the import at the top of the file (line 9) if it's no longer used elsewhere in the module. Check first: `grep -n "Story" backend/app/api/services/time_tracking_service.py` — if Story only appears in the old lines 35-36, remove it from the import.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && uv run pytest tests/test_api_time_tracking.py -v
```

Expected: PASS (2 tests)

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
cd backend && uv run pytest --tb=short -q
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/services/time_tracking_service.py backend/tests/test_api_time_tracking.py
git commit -m "fix: time_tracking_service crashes on project-level tasks (story_id is None)"
```

---

## Task 2: Fix N+1 author fetch in comment_service

**Files:**
- Modify: `backend/app/api/services/comment_service.py`

The three list functions (`list_comments_on_project`, `list_comments_on_story`, `list_comments_on_task`) each do `await db.get(User, item.author_id)` inside a loop — one DB round-trip per comment. Replace with a single bulk query.

The pattern is identical in all three functions: after fetching `items`, build an `authors` dict, then look up in it.

- [ ] **Step 1: Write a failing test that proves N+1 is observable**

Add to `backend/tests/test_api_time_tracking.py` (or a new `test_api_comments.py`):

Create `backend/tests/test_api_comments.py`:

```python
import pytest
from httpx import AsyncClient


@pytest.mark.anyio
async def test_list_comments_on_project(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    """Comments list returns author_name and doesn't crash with multiple items."""
    project_id = test_project["id"]

    for i in range(3):
        resp = await api_client.post(
            f"/api/v1/projects/{project_id}/comments",
            json={"body": f"Comment {i}"},
            headers=manager_headers,
        )
        assert resp.status_code == 201

    resp = await api_client.get(
        f"/api/v1/projects/{project_id}/comments",
        headers=manager_headers,
    )
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 3
    assert all(c["author_name"] for c in items)
```

- [ ] **Step 2: Run test to confirm it currently passes (the N+1 works; this is a performance fix)**

```bash
cd backend && uv run pytest tests/test_api_comments.py -v
```

Expected: PASS (existing code works; we're checking it still passes after refactor)

- [ ] **Step 3: Refactor list functions to batch-load authors**

In `backend/app/api/services/comment_service.py`, replace the `for item in items` loops in all three list functions.

The current pattern (appears at lines ~39-51, ~86-98, ~131-143):

```python
    result = []
    for item in items:
        author = await db.get(User, item.author_id)
        result.append(
            CommentResponse(
                id=item.id,
                body=item.body,
                author_id=item.author_id,
                author_name=author.name if author else "Unknown",
                created_at=item.created_at,
                updated_at=item.updated_at,
            )
        )
    return PaginatedResponse(items=result, next_cursor=next_cursor)
```

Replace with this pattern in every occurrence (the SQL import `select` is already at the top):

```python
    author_ids = {item.author_id for item in items}
    authors = {
        u.id: u
        for u in (await db.scalars(select(User).where(User.id.in_(author_ids)))).all()
    }
    result = [
        CommentResponse(
            id=item.id,
            body=item.body,
            author_id=item.author_id,
            author_name=authors[item.author_id].name if item.author_id in authors else "Unknown",
            created_at=item.created_at,
            updated_at=item.updated_at,
        )
        for item in items
    ]
    return PaginatedResponse(items=result, next_cursor=next_cursor)
```

Apply this to all three list functions.

- [ ] **Step 4: Run tests to verify no regressions**

```bash
cd backend && uv run pytest tests/test_api_comments.py tests/test_api_tasks.py tests/test_api_stories.py -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/services/comment_service.py backend/tests/test_api_comments.py
git commit -m "perf: batch-load comment authors; eliminate N+1 round-trips"
```

---

## Task 3: Escape LIKE wildcards in search and filter queries

**Files:**
- Modify: `backend/app/api/services/search_service.py`
- Modify: `backend/app/api/services/task_service.py`
- Modify: `backend/app/api/services/project_service.py`
- Modify: `backend/app/api/services/story_service.py`

Raw `ilike(f"%{q}%")` lets users inject `%` and `_` to match everything. Fix with an escape helper.

- [ ] **Step 1: Write a failing test in test_api_search.py**

Add to the end of `backend/tests/test_api_search.py`:

```python
@pytest.mark.anyio
async def test_search_percent_in_query_does_not_match_everything(
    api_client: AsyncClient, manager_headers: dict
):
    """A % in the query should not act as a wildcard."""
    # Create a project whose name does NOT contain "%"
    resp = await api_client.post(
        "/api/v1/projects",
        json={"name": "NeedsNoPercent"},
        headers=manager_headers,
    )
    assert resp.status_code == 201

    # Search for "%" should not return NeedsNoPercent
    resp = await api_client.get("/api/v1/search?q=%", headers=manager_headers)
    assert resp.status_code == 200
    names = [r["title"] for r in resp.json()["results"]]
    assert "NeedsNoPercent" not in names
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd backend && uv run pytest tests/test_api_search.py::test_search_percent_in_query_does_not_match_everything -v
```

Expected: FAIL (the unescaped % matches NeedsNoPercent)

- [ ] **Step 3: Add _escape_like helper and apply to search_service.py**

At the top of `backend/app/api/services/search_service.py` (after imports), add:

```python
def _escape_like(s: str) -> str:
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
```

Then update every `ilike(f"%{q}%")` call in that file to:

```python
ilike(f"%{_escape_like(q)}%", escape="\\")
```

There are 6 such calls in search_service.py (lines 35, 36, 50, 51, 65, 66).

- [ ] **Step 4: Apply the same helper in the other three services**

In `backend/app/api/services/task_service.py`, add the same helper at the top (after imports) and update `Task.title.ilike(f"%{q}%")` at lines 58 and 218:

```python
def _escape_like(s: str) -> str:
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
```

Change:
```python
stmt = stmt.where(Task.title.ilike(f"%{q}%"))
```
to:
```python
stmt = stmt.where(Task.title.ilike(f"%{_escape_like(q)}%", escape="\\"))
```

In `backend/app/api/services/project_service.py`, add same helper and update line 63:

```python
stmt = stmt.where(Project.name.ilike(f"%{_escape_like(q)}%", escape="\\"))
```

In `backend/app/api/services/story_service.py`, add same helper and update line 38:

```python
stmt = stmt.where(Story.title.ilike(f"%{_escape_like(q)}%", escape="\\"))
```

- [ ] **Step 5: Run the failing test to verify it passes**

```bash
cd backend && uv run pytest tests/test_api_search.py -v
```

Expected: All PASS

- [ ] **Step 6: Run full suite**

```bash
cd backend && uv run pytest --tb=short -q
```

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/services/search_service.py backend/app/api/services/task_service.py backend/app/api/services/project_service.py backend/app/api/services/story_service.py backend/tests/test_api_search.py
git commit -m "fix: escape LIKE wildcards in search and filter queries"
```

---

## Task 4: Backend cleanup — logging, password reset, TYPE_CHECKING

**Files:**
- Modify: `backend/app/api/main.py`
- Modify: `backend/app/api/services/auth_service.py`
- Modify: `backend/app/core/config.py`
- Modify: `backend/app/db/models/project_status.py`

Small independent cleanups grouped into one task.

- [ ] **Step 1: Replace print/traceback with structured logging in main.py**

In `backend/app/api/main.py`, find the general exception handler (around line 149):

```python
    import traceback
    ...
    print(f"Unexpected error: {exc}")
    traceback.print_exc()
```

Replace with structured logging. Add at the top of the file (alongside other imports):

```python
import logging
logger = logging.getLogger(__name__)
```

Then replace the print/traceback block in `general_exception_handler`:

```python
    logger.exception("Unexpected error: %s", exc)
```

Also remove the `from fastapi.responses import JSONResponse` inside the handler functions if it's already imported at the top (check line ~10 of the file for the top-level import).

- [ ] **Step 2: Add DEBUG flag to settings**

In `backend/app/core/config.py`, add to the `Settings` class:

```python
    DEBUG: bool = False
```

Place it after `CORS_ORIGINS`.

- [ ] **Step 3: Gate password reset token behind DEBUG**

In `backend/app/api/services/auth_service.py`, add the settings import at the top:

```python
from app.core.config import settings
```

Then replace lines 103–104:

```python
    token = create_password_reset_token(user.id)
    # TODO: send token via email; for now just return it
    return token
```

with:

```python
    token = create_password_reset_token(user.id)
    if settings.DEBUG:
        return token
    # TODO: send token via email
    return "reset_token_sent"
```

- [ ] **Step 4: Remove empty TYPE_CHECKING block**

In `backend/app/db/models/project_status.py`, remove lines 10–11:

```python
if TYPE_CHECKING:
    pass
```

Also remove the `from typing import TYPE_CHECKING` import on line 2 if it's no longer used after this removal. Check: `grep -n "TYPE_CHECKING" backend/app/db/models/project_status.py`.

- [ ] **Step 5: Verify no breakage**

```bash
cd backend && uv run pytest --tb=short -q
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/main.py backend/app/api/services/auth_service.py backend/app/core/config.py backend/app/db/models/project_status.py
git commit -m "fix: structured logging in exception handler; gate password reset token behind DEBUG; remove dead TYPE_CHECKING block"
```

---

## Task 5: Fix SprintView project-level task link

**Files:**
- Modify: `frontend/src/pages/SprintView.tsx:126`

`SprintView.tsx:126` has a hardcoded `/tasks/${task.id}` which is not a route. `taskHref` is already imported at line 32 and used elsewhere in the same file (line 79). This is a one-line fix.

- [ ] **Step 1: Find and replace the hardcoded link**

In `frontend/src/pages/SprintView.tsx`, line 126 currently reads:

```tsx
  const href = task.story_id ? `/stories/${task.story_id}/tasks/${task.id}` : `/tasks/${task.id}`
```

Replace with:

```tsx
  const href = taskHref(task)
```

The `taskHref` import is already present at line 32 (`import { taskHref } from '../utils/links'`).

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/SprintView.tsx
git commit -m "fix: SprintView sprint card links use wrong route for project-level tasks"
```

---

## Task 6: Extract recentLink to utils/links.ts

**Files:**
- Modify: `frontend/src/utils/links.ts`
- Modify: `frontend/src/components/layout/AppShell.tsx`
- Modify: `frontend/src/components/layout/CommandPalette.tsx`
- Modify: `frontend/src/pages/SearchResultsPage.tsx`

`recentLink` is defined identically in three files. It belongs in `utils/links.ts` alongside `taskHref`.

- [ ] **Step 1: Add recentLink to utils/links.ts**

Current `frontend/src/utils/links.ts`:

```ts
import type { TaskResponse } from '../services/api'

export function taskHref(task: TaskResponse): string {
  return task.story_id
    ? `/stories/${task.story_id}/tasks/${task.id}`
    : `/projects/${task.project_id}/tasks/${task.id}`
}
```

Add `recentLink` export (check the existing definition in any of the three files to confirm the shape — they all look like):

```ts
import type { RecentItemResponse, TaskResponse } from '../services/api'

export function taskHref(task: TaskResponse): string {
  return task.story_id
    ? `/stories/${task.story_id}/tasks/${task.id}`
    : `/projects/${task.project_id}/tasks/${task.id}`
}

export function recentLink(item: RecentItemResponse): string {
  if (item.item_type === 'project') return `/projects/${item.item_id}`
  if (item.item_type === 'story') return `/stories/${item.item_id}`
  return item.story_id
    ? `/stories/${item.story_id}/tasks/${item.item_id}`
    : `/projects/${item.project_id}/tasks/${item.item_id}`
}
```

Verify the exact body by reading the existing `recentLink` in `AppShell.tsx:75` before writing. Use that exact implementation.

- [ ] **Step 2: Update AppShell.tsx**

In `frontend/src/components/layout/AppShell.tsx`:
1. Add `recentLink` to the import from `../utils/links` (or `../../utils/links` — check relative path).
2. Delete the locally defined `const recentLink = ...` (around line 75).

- [ ] **Step 3: Update CommandPalette.tsx**

In `frontend/src/components/layout/CommandPalette.tsx`:
1. Add `recentLink` to the import from `../../utils/links`.
2. Delete the locally defined `function recentLink(...)` (around line 65).

- [ ] **Step 4: Update SearchResultsPage.tsx**

In `frontend/src/pages/SearchResultsPage.tsx`:
1. Add `recentLink` to the import from `../utils/links`.
2. Delete the locally defined `function recentLink(...)` (around line 31).

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/links.ts frontend/src/components/layout/AppShell.tsx frontend/src/components/layout/CommandPalette.tsx frontend/src/pages/SearchResultsPage.tsx
git commit -m "refactor: consolidate recentLink into utils/links.ts"
```

---

## Task 7: Extract DetailField component

**Files:**
- Create: `frontend/src/components/common/DetailField.tsx`
- Modify: `frontend/src/pages/StoryDetailPage.tsx`
- Modify: `frontend/src/pages/TaskDetailPage.tsx`
- Modify: `frontend/src/pages/SprintDetailPage.tsx`

`DetailField` is a small component defined identically in three pages. BacklogPage also had one but is being deleted in Task 10.

- [ ] **Step 1: Read the existing definition**

Read `frontend/src/pages/StoryDetailPage.tsx` lines 40-55 to get the exact implementation:

```tsx
function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wider text-stone-400 font-medium mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}
```

(Read the file to confirm this exact JSX before writing.)

- [ ] **Step 2: Create the common component**

Create `frontend/src/components/common/DetailField.tsx`:

```tsx
export function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wider text-stone-400 font-medium mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}
```

(Confirm classNames match what's in StoryDetailPage before writing.)

- [ ] **Step 3: Replace in StoryDetailPage.tsx**

1. Delete the local `function DetailField(...)` definition.
2. Add import: `import { DetailField } from '../components/common/DetailField'`

- [ ] **Step 4: Replace in TaskDetailPage.tsx**

1. Delete the local `function DetailField(...)` definition.
2. Add import: `import { DetailField } from '../components/common/DetailField'`

- [ ] **Step 5: Replace in SprintDetailPage.tsx**

1. Delete the local `function DetailField(...)` definition.
2. Add import: `import { DetailField } from '../components/common/DetailField'`

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/common/DetailField.tsx frontend/src/pages/StoryDetailPage.tsx frontend/src/pages/TaskDetailPage.tsx frontend/src/pages/SprintDetailPage.tsx
git commit -m "refactor: extract DetailField to components/common"
```

---

## Task 8: Extract applySortField and sort constants to utils/sort.ts

**Files:**
- Create: `frontend/src/utils/sort.ts`
- Modify: `frontend/src/pages/ProjectDetailPage.tsx`
- Modify: `frontend/src/pages/StoryDetailPage.tsx`

`applySortField`, `STATUS_ORDER`, and `PRIORITY_ORDER` are duplicated in both files (BacklogPage also had them but is being removed). The implementations are nearly identical; the type parameter differs (`StoryResponse` vs generic). Make it generic.

- [ ] **Step 1: Read existing implementations**

Read `frontend/src/pages/ProjectDetailPage.tsx` lines 205–215 and `frontend/src/pages/StoryDetailPage.tsx` lines 33–43 to confirm both use the same `STATUS_ORDER` and `PRIORITY_ORDER` maps and the same sort logic.

- [ ] **Step 2: Create utils/sort.ts**

Create `frontend/src/utils/sort.ts`:

```ts
export const STATUS_ORDER: Record<string, number> = {
  to_do: 0,
  in_progress: 1,
  in_review: 2,
  in_testing: 3,
  done: 4,
}

export const PRIORITY_ORDER: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
}

export function applySortField<T extends { status: string; priority: string; title: string; created_at: string }>(
  a: T,
  b: T,
  field: string
): number {
  if (field === 'status') return (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99)
  if (field === 'priority') return (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)
  if (field === 'title') return a.title.localeCompare(b.title)
  if (field === 'created_at') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  return 0
}
```

Confirm the sort fields match what ProjectDetailPage and StoryDetailPage actually use before writing (read the `applySortField` call sites in both files).

- [ ] **Step 3: Update ProjectDetailPage.tsx**

1. Delete local `STORY_STATUS_ORDER`, `STORY_PRIORITY_ORDER`, and `applySortField` definitions.
2. Add import: `import { STATUS_ORDER, PRIORITY_ORDER, applySortField } from '../utils/sort'`
3. Update the call site to use the imported versions (type inference handles the rest).

- [ ] **Step 4: Update StoryDetailPage.tsx**

1. Delete local `STATUS_ORDER`, `PRIORITY_ORDER`, and `applySortField` definitions.
2. Add import: `import { applySortField } from '../utils/sort'`

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/sort.ts frontend/src/pages/ProjectDetailPage.tsx frontend/src/pages/StoryDetailPage.tsx
git commit -m "refactor: extract applySortField and sort constants to utils/sort.ts"
```

---

## Task 9: Extract initials() to utils/initials.ts

**Files:**
- Create: `frontend/src/utils/initials.ts`
- Modify: `frontend/src/components/layout/AppShell.tsx`
- Modify: `frontend/src/pages/ProjectDetailPage.tsx`
- Modify: `frontend/src/pages/ConfigPage.tsx`
- Modify: `frontend/src/pages/StoryDetailPage.tsx`
- Modify: `frontend/src/pages/InvitationsPage.tsx`

The same `name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()` one-liner is inlined in 5+ files.

- [ ] **Step 1: Create utils/initials.ts**

```ts
export function initials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
```

- [ ] **Step 2: Update AppShell.tsx**

Replace:
```ts
const initials = user?.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
```
with:
```ts
import { initials as getInitials } from '../../utils/initials'
// ...
const userInitials = user ? getInitials(user.name) : '?'
```

Update the JSX to use `userInitials`.

- [ ] **Step 3: Update ProjectDetailPage.tsx**

1. Delete the local `function initials(name: string)` definition (lines 98–100).
2. Add import: `import { initials } from '../utils/initials'`
3. Keep `avatarClass` local (it's project-specific styling, not a candidate for extraction).

- [ ] **Step 4: Update ConfigPage.tsx**

Replace inline `const initials = user?.name.split(...)...`:
```ts
import { initials as getInitials } from '../utils/initials'
// ...
const userInitials = user ? getInitials(user.name) : '?'
```

Update JSX references from `{initials}` to `{userInitials}`.

- [ ] **Step 5: Update StoryDetailPage.tsx**

Replace inline `m.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()` at line 334:
```tsx
import { initials } from '../utils/initials'
// in the JSX:
{initials(m.name)}
```

- [ ] **Step 6: Update InvitationsPage.tsx**

Replace `inv.project_name.split(' ').map(w => w[0]).slice(0, 2).join('')` at line 66:
```tsx
import { initials } from '../utils/initials'
// in the JSX:
{initials(inv.project_name)}
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/utils/initials.ts frontend/src/components/layout/AppShell.tsx frontend/src/pages/ProjectDetailPage.tsx frontend/src/pages/ConfigPage.tsx frontend/src/pages/StoryDetailPage.tsx frontend/src/pages/InvitationsPage.tsx
git commit -m "refactor: extract initials() to utils/initials.ts"
```

---

## Task 10: Remove BacklogPage dead code and density feature

**Files:**
- Delete: `frontend/src/pages/BacklogPage.tsx`
- Modify: `frontend/src/context/ThemeContext.tsx`
- Modify: `frontend/src/pages/ConfigPage.tsx`

BacklogPage is not imported in App.tsx — it's unreachable dead code. Density is stored in localStorage and exposed in the UI but never applied anywhere (no CSS reads it, no component uses it). Both are YAGNI removals.

- [ ] **Step 1: Verify BacklogPage is not imported**

```bash
grep -r "BacklogPage" frontend/src/
```

Expected: only `BacklogPage.tsx` itself (no imports). If it IS imported somewhere — do not delete, wire it up instead and skip this step.

- [ ] **Step 2: Delete BacklogPage.tsx**

```bash
rm frontend/src/pages/BacklogPage.tsx
```

- [ ] **Step 3: Remove density from ThemeContext.tsx**

Read `frontend/src/context/ThemeContext.tsx` first. Then:

1. Remove `export type Density = 'compact' | 'balanced' | 'spacious'` type
2. Remove `density: Density` and `setDensity: (density: Density) => void` from the context interface
3. Remove `const [density, setDensityState] = useState<Density>(...)` state
4. Remove the `setDensity` function
5. Remove `density` and `setDensity` from the context provider value

- [ ] **Step 4: Remove density UI from ConfigPage.tsx**

Read `frontend/src/pages/ConfigPage.tsx` first. Then:

1. Remove `density` and `setDensity` from the `useTheme()` destructure
2. Remove the entire density section from the JSX (the label + button group for compact/balanced/spacious)

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/context/ThemeContext.tsx frontend/src/pages/ConfigPage.tsx
git commit -m "chore: remove unimplemented density feature; delete dead BacklogPage"
```

---

## Task 11: Color sweep — gray/sky → stone/accent

**Files:**
- `frontend/src/components/common/EmptyState.tsx`
- `frontend/src/components/common/MarkdownEditor.tsx`
- `frontend/src/components/common/Skeleton.tsx`
- `frontend/src/components/common/LoadMoreButton.tsx`
- `frontend/src/components/common/ConfirmDialog.tsx`
- `frontend/src/components/comments/CommentList.tsx`
- `frontend/src/components/status-history/StatusHistoryTimeline.tsx`
- `frontend/src/components/config/ApiKeyList.tsx`
- `frontend/src/pages/NotFoundPage.tsx`
- `frontend/src/pages/ProtectedRoute.tsx` (`border-sky-600` spinner)

The redesign uses `stone-*` and the CSS variable `accent` (`bg-[var(--accent)]` / `text-[var(--accent)]`). These components still use `gray-*` and `sky-*`.

Mapping:
- `gray-100` → `stone-100`, `gray-200` → `stone-200`, `gray-300` → `stone-300`, `gray-400` → `stone-400`, `gray-500` → `stone-500`, `gray-600` → `stone-600`, `gray-700` → `stone-700`, `gray-800` → `stone-800`, `gray-900` → `stone-900`
- `bg-sky-600 hover:bg-sky-700` → `bg-[var(--accent)] hover:bg-[var(--accent-hover)]`
- `text-sky-600` → `text-[var(--accent)]`
- `border-sky-600` → `border-[var(--accent)]`
- `ring-sky-500` → `ring-[var(--accent)]`
- `bg-sky-400` → `bg-[var(--accent)]`

Check that the CSS variables `--accent` and `--accent-hover` are defined in the theme (read `frontend/src/utils/theme.ts` or `frontend/src/index.css` first to confirm the variable names).

- [ ] **Step 1: Confirm accent CSS variable names**

```bash
grep -n "accent\|--accent" frontend/src/index.css frontend/src/utils/theme.ts frontend/src/context/ThemeContext.tsx 2>/dev/null | head -20
```

Note the exact variable names. Adjust the mapping above if they differ.

- [ ] **Step 2: Apply substitutions to each file**

For each file listed above, read it first, then apply the gray→stone and sky→accent substitutions. Read before editing — do not edit blindly.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/common/EmptyState.tsx frontend/src/components/common/MarkdownEditor.tsx frontend/src/components/common/Skeleton.tsx frontend/src/components/common/LoadMoreButton.tsx frontend/src/components/common/ConfirmDialog.tsx frontend/src/components/comments/CommentList.tsx frontend/src/components/status-history/StatusHistoryTimeline.tsx frontend/src/components/config/ApiKeyList.tsx frontend/src/pages/NotFoundPage.tsx frontend/src/pages/ProtectedRoute.tsx
git commit -m "style: align legacy components to stone/accent palette"
```

---

## Execution Order

Tasks are mostly independent. Suggested order:

1. **Task 1** first (backend bug — correctness)
2. **Task 2, 3, 4** in parallel (backend — all independent)
3. **Task 5** (frontend bug — one-liner)
4. **Tasks 6–9** in parallel (frontend DRY — all independent)
5. **Task 10** (removal — depends on no other task touching BacklogPage)
6. **Task 11** last (color sweep — purely cosmetic, safe to do last)

Run `uv run pytest` after each backend task and `npm run build` after each frontend task to catch regressions early.
