# Sidebar Redesign

## Context

The current left sidebar shows two flat nav links (Projects, Invitations) with a floating spacer-based footer. The redesign adds a "Recent Work" section showing the 5 most recently updated items across all entity types, a recent-projects sub-list under Projects, surfaces the pending invitation count inline in the Invitations label, and fixes the footer so it stays pinned to the bottom of the viewport.

## Goals

- New "Recent Work" section: 5 most recently updated items (Projects, Stories, Tasks) across user's accessible projects
- Show up to 5 most recently created projects in sidebar for quick access
- Show pending invitation count inline in the Invitations label (bold when > 0), clicking navigates to `/invitations`
- Add a "+" action next to Projects that navigates to the projects page
- Keep Settings and User Menu always visible at the bottom of the viewport

## Out of Scope

- Search functionality (already stubbed, left as-is)
- Collapsible sections
- "Recently accessed" tracking (use server `created_at` / `updated_at` order instead)

---

## Sidebar Structure

```
[SP]  simple-project-tool

[ search... ]

Recent work
  ├─ 📁 Alpha project
  ├─ 📖 User auth story
  ├─ ✓ Fix login bug
  └─ (up to 5, no overflow link)

Projects                    [+]
  ├─ Alpha project
  ├─ Beta initiative
  ├─ Gamma rollout
  ├─ Delta sprint
  └─ All projects →          ← only when >5 exist

Invitations (2)              ← bold when pending > 0

─────────────────────────────  ← always visible
⚙ Settings
👤 User menu
```

---

## Backend

### New endpoint: `GET /api/v1/recent`

Returns 5 most recently updated items across Projects, Stories, and Tasks that the authenticated user has access to (i.e., is a member of the parent project).

**Response schema** (`RecentItemResponse`):
```python
class RecentItemResponse(BaseModel):
    type: Literal["project", "story", "task"]
    id: str
    title: str           # project.name / story.title / task.title
    project_id: str
    story_id: str | None  # None for projects and project-level tasks
    updated_at: datetime
```

**Response**: `list[RecentItemResponse]` (always ≤ 5 items)

**Implementation** (`app/api/services/recent_service.py`):
- Get all project IDs the user is a member of (query `project_members` table)
- Run a UNION ALL across `projects`, `stories`, `tasks` filtered to those project IDs
- `ORDER BY updated_at DESC LIMIT 5`
- Tasks with `story_id = NULL` link to the project page on the frontend

**Route**: `app/api/routes/recent.py` — single GET, registered at `/api/v1/recent`

**Files added/changed**:
| File | Change |
|------|--------|
| `backend/app/api/schemas/recent.py` | New — `RecentItemResponse` schema |
| `backend/app/api/services/recent_service.py` | New — UNION ALL query logic |
| `backend/app/api/routes/recent.py` | New — single GET route |
| `backend/app/main.py` | Register new router |

---

## Frontend

### API client (`frontend/src/services/api.ts`)

Add interface and API method:
```typescript
export interface RecentItemResponse {
  type: 'project' | 'story' | 'task'
  id: string
  title: string
  project_id: string
  story_id: string | null
  updated_at: string
}

export const recentApi = {
  list: () => api.get<RecentItemResponse[]>('/recent'),
}
```

### AppShell (`frontend/src/components/layout/AppShell.tsx`)

**Layout restructure**:
- `aside` gets `h-screen sticky top-0` to anchor to viewport
- Wrap workspace + search + nav in `flex-1 overflow-y-auto min-h-0`
- Remove `<div className="flex-1" />` spacer
- Footer (`border-t ...`) is `flex-shrink-0`, outside the scrollable zone

**State added**:
```typescript
const [recentItems, setRecentItems] = useState<RecentItemResponse[]>([])
const [recentProjects, setRecentProjects] = useState<ProjectResponse[]>([])
const [hasMoreProjects, setHasMoreProjects] = useState(false)
```

**Fetch on mount** (alongside existing invitations fetch):
```typescript
recentApi.list().then(res => setRecentItems(res.data)).catch(() => {})
projectsApi.list({ limit: 6 }).then(res => {
  const items = res.data.items
  const hasMore = items.length === 6
  setHasMoreProjects(hasMore)
  setRecentProjects(items.slice(0, hasMore ? 4 : 5))
}).catch(() => {})
```

**Recent Work section** (above Projects nav):

Icons (inline SVGs, same style as existing icons, 12×12):
- Project: folder icon
- Story: document icon  
- Task: checkmark icon

Each item link:
- project → `/projects/:id`
- story → `/projects/:projectId/stories/:id`
- task with story → `/stories/:storyId/tasks/:id`
- task without story → `/projects/:projectId`

Item styling (same as Projects sub-items):
```
pl-8 pr-2 py-1 text-[12.5px] truncate rounded-md
text-stone-500 dark:text-stone-400
hover:bg-stone-50 dark:hover:bg-stone-900
hover:text-stone-800 dark:hover:text-stone-200
```

Section header styling (same as Projects header — not a nav link):
```
flex items-center gap-2.5 px-2 py-1.5 text-[13px]
text-stone-600 dark:text-stone-300
```

**Projects section** (replaces flat NavLink):

Header row — not a NavLink, label row with "+" on the right:
```
[IHome]  Projects              [IPlus → /projects]
```
- "+" is `<Link to="/projects">` with `ml-auto` positioning
- Header row applies active styling (`text-stone-900 dark:text-stone-100 font-medium`) when `location.pathname === '/projects'` (use `useLocation`)
- Sub-items: project name truncated, links to `/projects/:id`
- Active project (sub-item): `bg-stone-100 dark:bg-stone-900 text-stone-900 dark:text-stone-100`
- "All projects →" (when hasMoreProjects): same indent, `text-stone-400`

**Invitations row** (replaces existing NavLink):
- Keep `IInbox` icon
- Remove red badge
- Label: `{t('nav.invitations')}{pendingCount > 0 ? \` (${pendingCount})\` : ''}`
- Add `font-semibold` to label span when `pendingCount > 0`
- All existing active/hover classes unchanged

---

## Verification

1. `npm run dev` in `frontend/`, start backend
2. Log in — sidebar shows: Recent Work → Projects → Invitations → footer
3. Recent Work shows up to 5 items with correct type icons; each links to the right page
4. With < 5 projects: all shown under Projects, no "All projects →"
5. With > 5 projects: 4 items + "All projects →" as 5th row
6. Pending invitations: label shows "Invitations (N)" in bold
7. No pending invitations: label shows "Invitations" in normal weight
8. "+" navigates to `/projects`
9. Footer stays visible at bottom of viewport when project list is long
10. Active-link highlighting works on all nav rows
11. `GET /api/v1/recent` returns ≤ 5 items ordered by `updated_at` desc
