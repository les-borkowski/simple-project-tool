# Sidebar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the left sidebar to show a "Recent Work" section (5 most-recently-updated items across Projects/Stories/Tasks), a Projects sub-list (5 newest), an inline pending-count on the Invitations link, and a viewport-pinned footer.

**Architecture:** New backend endpoint `GET /api/v1/recent` runs a UNION ALL query across projects/stories/tasks accessible to the user and returns ≤ 5 rows ordered by `updated_at` DESC. Frontend `AppShell.tsx` fetches this on mount and renders the new sidebar sections using existing Tailwind/icon patterns.

**Tech Stack:** Python 3.12 · FastAPI · SQLAlchemy async · Pydantic v2 · React 19 · TypeScript · Tailwind CSS · react-router-dom v6 · react-i18next

---

## File Map

**Created:**
- `backend/app/api/schemas/recent.py` — `RecentItemResponse` Pydantic schema
- `backend/app/api/services/recent_service.py` — UNION ALL query logic
- `backend/app/api/routes/recent.py` — single GET route
- `backend/tests/test_api_recent.py` — integration tests

**Modified:**
- `backend/app/api/main.py` — register `recent` router
- `frontend/src/services/api.ts` — add `RecentItemResponse` interface + `recentApi`
- `frontend/src/components/layout/AppShell.tsx` — all sidebar changes
- `frontend/src/locales/en-GB.json` — new i18n keys
- `frontend/src/locales/pl.json` — new i18n keys

---

## Task 1: RecentItemResponse schema

**Files:**
- Create: `backend/app/api/schemas/recent.py`

- [ ] **Step 1: Create the schema file**

```python
# backend/app/api/schemas/recent.py
from datetime import datetime
from typing import Literal
from pydantic import BaseModel


class RecentItemResponse(BaseModel):
    type: Literal["project", "story", "task"]
    id: str
    title: str
    project_id: str
    story_id: str | None
    updated_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/api/schemas/recent.py
git commit -m "feat: add RecentItemResponse schema"
```

---

## Task 2: Write failing tests for /api/v1/recent

**Files:**
- Create: `backend/tests/test_api_recent.py`

- [ ] **Step 1: Write the test file**

```python
# backend/tests/test_api_recent.py
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_recent_requires_auth(api_client: AsyncClient):
    resp = await api_client.get("/api/v1/recent")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_recent_empty(api_client: AsyncClient, auth_headers: dict):
    resp = await api_client.get("/api/v1/recent", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_recent_returns_project(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    resp = await api_client.get("/api/v1/recent", headers=manager_headers)
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) >= 1
    project_item = next((i for i in items if i["type"] == "project"), None)
    assert project_item is not None
    assert project_item["id"] == test_project["id"]
    assert project_item["title"] == test_project["name"]
    assert project_item["project_id"] == test_project["id"]
    assert project_item["story_id"] is None
    assert "updated_at" in project_item


@pytest.mark.asyncio
async def test_recent_returns_story(
    api_client: AsyncClient, manager_headers: dict, test_story: dict, test_project: dict
):
    resp = await api_client.get("/api/v1/recent", headers=manager_headers)
    assert resp.status_code == 200
    items = resp.json()
    story_item = next((i for i in items if i["type"] == "story"), None)
    assert story_item is not None
    assert story_item["id"] == test_story["id"]
    assert story_item["project_id"] == test_project["id"]
    assert story_item["story_id"] is None


@pytest.mark.asyncio
async def test_recent_returns_task(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    task_resp = await api_client.post(
        f"/api/v1/projects/{test_project['id']}/tasks",
        json={"title": "Recent task"},
        headers=manager_headers,
    )
    assert task_resp.status_code == 201
    task = task_resp.json()

    resp = await api_client.get("/api/v1/recent", headers=manager_headers)
    assert resp.status_code == 200
    items = resp.json()
    task_item = next((i for i in items if i["type"] == "task" and i["id"] == task["id"]), None)
    assert task_item is not None
    assert task_item["project_id"] == test_project["id"]


@pytest.mark.asyncio
async def test_recent_max_five(api_client: AsyncClient, manager_headers: dict):
    for i in range(6):
        await api_client.post(
            "/api/v1/projects",
            json={"name": f"Extra Project {i}"},
            headers=manager_headers,
        )
    resp = await api_client.get("/api/v1/recent", headers=manager_headers)
    assert resp.status_code == 200
    assert len(resp.json()) <= 5


@pytest.mark.asyncio
async def test_recent_contributor_sees_only_own_projects(
    api_client: AsyncClient, auth_headers: dict, manager_headers: dict
):
    # Manager creates a project the contributor is NOT a member of
    await api_client.post(
        "/api/v1/projects",
        json={"name": "Manager Only Project"},
        headers=manager_headers,
    )

    resp = await api_client.get("/api/v1/recent", headers=auth_headers)
    assert resp.status_code == 200
    # Contributor has no projects of their own → empty list
    assert resp.json() == []
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && uv run pytest tests/test_api_recent.py -v
```

Expected: `FAILED` — `404 Not Found` for `/api/v1/recent` (route doesn't exist yet).

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_api_recent.py
git commit -m "test: add failing tests for GET /api/v1/recent"
```

---

## Task 3: recent_service implementation

**Files:**
- Create: `backend/app/api/services/recent_service.py`

- [ ] **Step 1: Create the service**

```python
# backend/app/api/services/recent_service.py
from sqlalchemy import select, union_all, literal, null, cast, or_
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import RoleEnum
from app.db.models import Project, Story, Task, ProjectMember, User
from app.api.schemas.recent import RecentItemResponse


async def get_recent_items(user: User, db: AsyncSession) -> list[RecentItemResponse]:
    if user.role == RoleEnum.manager:
        project_ids_q = select(Project.id)
    else:
        project_ids_q = select(Project.id).where(
            or_(
                Project.owner_id == user.id,
                Project.id.in_(
                    select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)
                ),
            )
        )

    projects_q = select(
        literal("project").label("type"),
        Project.id.label("id"),
        Project.name.label("title"),
        Project.id.label("project_id"),
        cast(null(), PGUUID(as_uuid=True)).label("story_id"),
        Project.updated_at.label("updated_at"),
    ).where(Project.id.in_(project_ids_q))

    stories_q = select(
        literal("story").label("type"),
        Story.id.label("id"),
        Story.title.label("title"),
        Story.project_id.label("project_id"),
        cast(null(), PGUUID(as_uuid=True)).label("story_id"),
        Story.updated_at.label("updated_at"),
    ).where(Story.project_id.in_(project_ids_q))

    tasks_q = select(
        literal("task").label("type"),
        Task.id.label("id"),
        Task.title.label("title"),
        Task.project_id.label("project_id"),
        Task.story_id.label("story_id"),
        Task.updated_at.label("updated_at"),
    ).where(Task.project_id.in_(project_ids_q))

    combined = union_all(projects_q, stories_q, tasks_q).subquery()
    stmt = select(combined).order_by(combined.c.updated_at.desc()).limit(5)

    rows = (await db.execute(stmt)).fetchall()

    return [
        RecentItemResponse(
            type=row.type,
            id=str(row.id),
            title=row.title,
            project_id=str(row.project_id),
            story_id=str(row.story_id) if row.story_id else None,
            updated_at=row.updated_at,
        )
        for row in rows
    ]
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/api/services/recent_service.py
git commit -m "feat: add recent items service with UNION ALL query"
```

---

## Task 4: recent route + register

**Files:**
- Create: `backend/app/api/routes/recent.py`
- Modify: `backend/app/api/main.py`

- [ ] **Step 1: Create the route**

```python
# backend/app/api/routes/recent.py
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.db.database import get_db
from app.db.models import User
from app.api.schemas.recent import RecentItemResponse
from app.api.services import recent_service

router = APIRouter(tags=["recent"])


@router.get("/recent", response_model=list[RecentItemResponse])
async def get_recent(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await recent_service.get_recent_items(user, db)
```

- [ ] **Step 2: Register the router in `backend/app/api/main.py`**

Add `recent` to the imports block (around line 14):

```python
from app.api.routes import (
    auth,
    projects,
    stories,
    tasks,
    comments,
    invitations,
    time_tracking,
    config,
    recent,
)
```

Add at the end of the route registrations (after line 180):

```python
app.include_router(recent.router, prefix="/api/v1")
```

- [ ] **Step 3: Run all tests**

```bash
cd backend && uv run pytest tests/test_api_recent.py -v
```

Expected: all 7 tests PASS.

- [ ] **Step 4: Run full test suite to check for regressions**

```bash
cd backend && uv run pytest -v
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/recent.py backend/app/api/main.py
git commit -m "feat: add GET /api/v1/recent endpoint"
```

---

## Task 5: Frontend API client

**Files:**
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: Add `RecentItemResponse` interface and `recentApi`**

In `frontend/src/services/api.ts`, add the interface after the existing interfaces (e.g., after `InvitationResponse`) and the API object before the final export or at the end:

```typescript
export interface RecentItemResponse {
  type: 'project' | 'story' | 'task'
  id: string
  title: string
  project_id: string
  story_id: string | null
  updated_at: string
}
```

```typescript
export const recentApi = {
  list: () => api.get<RecentItemResponse[]>('/recent'),
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npm run build 2>&1 | head -30
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/api.ts
git commit -m "feat: add recentApi and RecentItemResponse to API client"
```

---

## Task 6: i18n keys

**Files:**
- Modify: `frontend/src/locales/en-GB.json`
- Modify: `frontend/src/locales/pl.json`

- [ ] **Step 1: Add keys to `en-GB.json`**

Add after `"nav.settings"`:

```json
"nav.recent_work": "Recent work",
"nav.all_projects": "All projects",
```

- [ ] **Step 2: Add keys to `pl.json`**

Add after `"nav.settings"`:

```json
"nav.recent_work": "Ostatnia aktywność",
"nav.all_projects": "Wszystkie projekty",
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/locales/en-GB.json frontend/src/locales/pl.json
git commit -m "feat: add i18n keys for sidebar recent work and all projects"
```

---

## Task 7: AppShell — layout restructure + invitations label + projects section

**Files:**
- Modify: `frontend/src/components/layout/AppShell.tsx`

This task rewrites AppShell.tsx. Read the current file before editing.

- [ ] **Step 1: Replace AppShell.tsx with the updated version**

Replace the entire file content with:

```tsx
import { useEffect, useState } from 'react'
import { NavLink, useNavigate, useLocation, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { invitationsApi, projectsApi, recentApi, ProjectResponse, RecentItemResponse } from '../../services/api'

const ISearch = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
  </svg>
)
const IPlus = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12h14"/>
  </svg>
)
const IHome = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/>
  </svg>
)
const IInbox = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <path d="M3 13h5l1 3h6l1-3h5"/><path d="M3 13l3-8h12l3 8v6H3z"/>
  </svg>
)
const ICog = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.3 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
  </svg>
)
const ICaret = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m6 9 6 6 6-6"/>
  </svg>
)
const IFolder = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
  </svg>
)
const IDoc = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <path d="M14 2v6h6M8 13h8M8 17h5"/>
  </svg>
)
const ICheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 6 9 17l-5-5"/>
  </svg>
)

const recentIcon = (type: RecentItemResponse['type']) => {
  if (type === 'project') return <IFolder />
  if (type === 'story') return <IDoc />
  return <ICheck />
}

const recentLink = (item: RecentItemResponse): string => {
  if (item.type === 'project') return `/projects/${item.id}`
  if (item.type === 'story') return `/projects/${item.project_id}/stories/${item.id}`
  if (item.story_id) return `/stories/${item.story_id}/tasks/${item.id}`
  return `/projects/${item.project_id}`
}

const SUB_ITEM = 'flex items-center gap-2 pl-8 pr-2 py-1 text-[12.5px] rounded-md truncate text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-900 hover:text-stone-800 dark:hover:text-stone-200'
const SUB_ITEM_ACTIVE = 'flex items-center gap-2 pl-8 pr-2 py-1 text-[12.5px] rounded-md truncate bg-stone-100 dark:bg-stone-900 text-stone-900 dark:text-stone-100'

interface Props {
  children: React.ReactNode
}

export function AppShell({ children }: Props) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const [pendingCount, setPendingCount] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [recentProjects, setRecentProjects] = useState<ProjectResponse[]>([])
  const [hasMoreProjects, setHasMoreProjects] = useState(false)
  const [recentItems, setRecentItems] = useState<RecentItemResponse[]>([])
  const initials = user?.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'

  useEffect(() => {
    invitationsApi.mine().then((res) => {
      setPendingCount(res.data.filter(i => i.status === 'pending').length)
    }).catch(() => {})

    projectsApi.list({ limit: 6 }).then((res) => {
      const items = res.data.items
      const hasMore = items.length === 6
      setHasMoreProjects(hasMore)
      setRecentProjects(items.slice(0, hasMore ? 4 : 5))
    }).catch(() => {})

    recentApi.list().then((res) => {
      setRecentItems(res.data)
    }).catch(() => {})
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const projectsActive = location.pathname === '/projects'

  return (
    <div className="flex min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100">
      {/* Sidebar */}
      <aside className="w-[240px] shrink-0 border-r border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 flex flex-col h-screen sticky top-0">

        {/* Scrollable zone: workspace + search + nav */}
        <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
          {/* Workspace */}
          <div className="px-3 py-3 border-b border-stone-200 dark:border-stone-800 shrink-0">
            <Link to="/projects" className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-stone-50 dark:hover:bg-stone-900">
              <span className="w-6 h-6 rounded-md accent-bg flex items-center justify-center text-[11px] font-semibold">SP</span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-semibold leading-tight">{t('shell.workspace')}</span>
              </span>
            </Link>
          </div>

          {/* Search stub */}
          <div className="px-3 pt-3 shrink-0">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-stone-200 dark:border-stone-800 text-stone-400 text-[12px]">
              <ISearch />
              <span className="flex-1 text-left">{t('shell.search')}</span>
            </div>
          </div>

          {/* Primary nav */}
          <nav className="px-2 py-3 space-y-0.5 text-[13px]">

            {/* Recent Work */}
            {recentItems.length > 0 && (
              <div className="mb-1">
                <div className="flex items-center gap-2.5 px-2 py-1.5 text-stone-600 dark:text-stone-300 select-none">
                  <span className="flex-1">{t('nav.recent_work')}</span>
                </div>
                {recentItems.map(item => (
                  <Link
                    key={`${item.type}-${item.id}`}
                    to={recentLink(item)}
                    className={SUB_ITEM}
                  >
                    <span className="text-stone-400 shrink-0">{recentIcon(item.type)}</span>
                    <span className="truncate">{item.title}</span>
                  </Link>
                ))}
              </div>
            )}

            {/* Projects */}
            <div className="mb-1">
              <div className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md ${projectsActive ? 'text-stone-900 dark:text-stone-100 font-medium' : 'text-stone-600 dark:text-stone-300'}`}>
                <span className="text-stone-400"><IHome /></span>
                <span className="flex-1">{t('nav.projects')}</span>
                <Link
                  to="/projects"
                  className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 p-0.5 rounded"
                  aria-label="New project"
                >
                  <IPlus />
                </Link>
              </div>
              {recentProjects.map(project => (
                <NavLink
                  key={project.id}
                  to={`/projects/${project.id}`}
                  className={({ isActive }) => isActive ? SUB_ITEM_ACTIVE : SUB_ITEM}
                >
                  <span className="truncate">{project.name}</span>
                </NavLink>
              ))}
              {hasMoreProjects && (
                <Link to="/projects" className={SUB_ITEM}>
                  {t('nav.all_projects')} →
                </Link>
              )}
            </div>

            {/* Invitations */}
            <NavLink
              to="/invitations"
              className={({ isActive }) =>
                `w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md ${isActive ? 'bg-stone-100 dark:bg-stone-900 text-stone-900 dark:text-stone-100' : 'text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900'}`
              }
            >
              <span className="text-stone-400"><IInbox /></span>
              <span className={pendingCount > 0 ? 'font-semibold' : ''}>
                {t('nav.invitations')}{pendingCount > 0 ? ` (${pendingCount})` : ''}
              </span>
            </NavLink>

          </nav>
        </div>

        {/* Footer — always visible at bottom of viewport */}
        <div className="border-t border-stone-200 dark:border-stone-800 p-2 space-y-0.5 shrink-0">
          <NavLink
            to="/config"
            className={({ isActive }) =>
              `w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] ${isActive ? 'bg-stone-100 dark:bg-stone-900' : 'text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900'}`
            }
          >
            <span className="text-stone-400"><ICog /></span>
            <span>{t('nav.settings')}</span>
          </NavLink>

          <div className="relative">
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-stone-50 dark:hover:bg-stone-900"
            >
              <span className="w-6 h-6 rounded-full av-2 inline-flex items-center justify-center text-white text-[9.5px] font-semibold">
                {initials}
              </span>
              <span className="flex-1 min-w-0 text-left">
                <span className="block text-[12px] font-medium leading-tight truncate text-stone-800 dark:text-stone-100">{user?.name}</span>
                <span className="block text-[10.5px] text-stone-500 leading-tight capitalize">{user?.role}</span>
              </span>
              <span className="text-stone-400"><ICaret /></span>
            </button>
            {menuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-md shadow-lg z-50 overflow-hidden">
                <Link
                  to="/config"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-[12.5px] text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800"
                >
                  <ICog /> {t('nav.settings')}
                </Link>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800"
                >
                  <IPlus /> {t('shell.sign_out')}
                </button>
              </div>
            )}
          </div>
        </div>

      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col min-h-screen">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npm run build 2>&1 | head -40
```

Expected: build succeeds, no type errors.

- [ ] **Step 3: Check lint**

```bash
cd frontend && npm run lint 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/AppShell.tsx
git commit -m "feat: rework sidebar with recent work, projects sub-list, inline invitations count, pinned footer"
```

---

## Task 8: Update plan file in docs

**Files:**
- Modify: `backend/app/api/routes/__init__.py` (if needed — check it's empty/doesn't need changes)

- [ ] **Step 1: Check routes __init__.py**

```bash
cat backend/app/api/routes/__init__.py
```

If it's empty or just has `__all__`, no changes needed. If it imports routers, add `recent` there too.

- [ ] **Step 2: Final full test run**

```bash
cd backend && uv run pytest -v
```

Expected: all tests pass including `test_api_recent.py`.

- [ ] **Step 3: Run frontend dev server and manually verify**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173`, log in and verify:
1. Recent Work section appears above Projects (only when there are items)
2. Project sub-list shows up to 5 names; "All projects →" appears only when there are > 5
3. Invitations shows count inline in bold when pending > 0
4. Settings and User Menu stay pinned at the bottom of the viewport when scrolling
5. Active link highlighting works on all nav items

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: verify sidebar redesign complete"
```

---

## Quick Reference

| URL pattern | Page |
|---|---|
| `/projects` | Projects list |
| `/projects/:id` | Project detail |
| `/projects/:projectId/stories/:storyId` | Story detail |
| `/stories/:storyId/tasks/:taskId` | Task detail (with story) |
| `/projects/:projectId` | Fallback for tasks without story |
| `/invitations` | Invitations list |
