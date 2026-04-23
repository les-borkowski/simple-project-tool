# Time Management Features Design Spec

**Date:** 2026-04-23  
**Status:** Approved

## Context

simple-project-tool currently has no sprint, effort, or due date concepts. Recent work added dynamic project-scoped statuses (`ProjectStatus` model). `StatusHistory` already tracks status transitions with timestamps — this is the foundation for the timeline's fallback date logic.

This spec covers four related features:
1. **Effort tracking** — configurable unit per project, numeric estimate on tasks
2. **Sprints** — date-bounded effort buckets with optional capacity ceiling
3. **Sprint view** — list-style page showing tasks grouped by sprint
4. **Timeline view** — Gantt-style chart with server-resolved bar positions

## Data Model

### Project (extend existing)

Add one field:
- `effort_unit: String(50) | None` — e.g. `"sp"`, `"hours"`. `null` = effort tracking disabled for this project.

### Task (extend existing)

Add three fields:
- `effort: Integer | None` — estimate in the project's effort unit
- `due_date: Date | None` — explicit deadline
- `sprint_id: UUID | None` (FK → sprints `id`, nullable, SET NULL on sprint delete)

### Sprint (new table: `sprints`)

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK, default uuid4 |
| `project_id` | UUID | FK → projects.id CASCADE DELETE, NOT NULL |
| `name` | String(255) | NOT NULL |
| `start_date` | Date | NOT NULL |
| `end_date` | Date | NOT NULL |
| `capacity` | Integer | nullable (null = no ceiling) |
| `created_by` | UUID | FK → users.id, NOT NULL |
| `created_at` | datetime | via TimestampMixin |
| `updated_at` | datetime | via TimestampMixin |

Index on `project_id` for efficient project-scoped queries.

## Backend API

### Sprint Endpoints

All read endpoints require project access. Write endpoints require Manager role.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/projects/{project_id}/sprints` | List sprints (includes total_effort, task_count) |
| `POST` | `/api/v1/projects/{project_id}/sprints` | Create sprint |
| `PATCH` | `/api/v1/sprints/{sprint_id}` | Update name, dates, capacity |
| `DELETE` | `/api/v1/sprints/{sprint_id}` | Delete sprint; tasks' sprint_id → null |

### Task Endpoint Changes

Extend `TaskUpdate` schema: add `effort: int | None`, `due_date: date | None`, `sprint_id: UUID | None`.  
Extend `TaskResponse`: add same three fields.  
Task service validates `sprint_id` belongs to the same project as the task.

### Project Endpoint Changes

Extend `ProjectUpdate`: add `effort_unit: str | None`.  
Extend `ProjectResponse`: add `effort_unit: str | None`.

### Timeline Endpoint

`GET /api/v1/projects/{project_id}/timeline`

Returns tasks with resolved bar positions. Fallback resolution order:

1. **"deadline"** source — if `task.due_date` is set:
   - `bar_start` = `changed_at` of first StatusHistory entry where `from_status IS NOT NULL`, else `task.created_at.date()`
   - `bar_end` = `task.due_date`
2. **"sprint"** source — else if task has a sprint:
   - `bar_start` = `sprint.start_date`
   - `bar_end` = `sprint.end_date`
3. **"status_history"** source — else if task has a real status transition:
   - `bar_start` = `changed_at` of first entry where `from_status IS NOT NULL`
   - `bar_end` = `changed_at` of latest entry where `from_status IS NOT NULL`
4. **Excluded** — no due_date, no sprint, and no StatusHistory entry with `from_status` set

Response shape per task:
```json
{
  "task_id": "uuid",
  "title": "string",
  "status": "string",
  "priority": "low|medium|high",
  "story_id": "uuid|null",
  "sprint_id": "uuid|null",
  "bar_start": "2026-04-28",
  "bar_end": "2026-05-11",
  "source": "deadline|sprint|status_history"
}
```

**Over-capacity:** `SprintResponse` includes `total_effort: int` (sum of assigned tasks' effort, treating null effort as 0) and `task_count: int`. Over-capacity is a soft warning in the UI only — no server enforcement.

## Frontend

### Navigation

Add **Sprints** and **Timeline** tabs to `ProjectDetailPage.tsx` alongside the existing Board / Stories / Members tabs. Tab type expands from `'board' | 'stories' | 'members'` to also include `'sprints' | 'timeline'`.

### Sprint View (`/projects/:id?tab=sprints` or `/projects/:projectId/sprints`)

Following BacklogPage style:
- Vertical list of collapsible sprint cards
- **Sprint card header:** name, date range (e.g. `Apr 28 – May 11`), effort used / capacity (e.g. `14 / 20 sp`), red over-capacity badge when `total_effort > capacity`
- **Task rows:** title, `StatusPill`, `PriorityBars`, assignee avatar, effort badge in the project's unit
- **Unassigned section** at the bottom: tasks not in any sprint
- Manager-only: "New Sprint" button → modal (name, start date, end date, optional capacity)
- Manager-only: sprint assignment dropdown on each task row

### Timeline View (`/projects/:id?tab=timeline` or `/projects/:projectId/timeline`)

Gantt-style chart, no external chart library:
- **Left column** (fixed width, e.g. 220px): task title + small status colour dot
- **Right area** (scrollable horizontal): date axis at top, horizontal bar per task
- **Grouping:** tasks grouped by sprint (labelled sections), unassigned tasks in an "Unassigned" group at the bottom
- **Overlap stacking:** within each group, tasks whose `bar_start`–`bar_end` ranges overlap are placed on separate sub-rows (calendar-style stacking)
- **Bar colour:** matches priority — low = `#6b7280`, medium = `#3b82f6`, high = `#ef4444`
- **Dashed border:** on bars where `source === "status_history"` (position is inferred, not explicit)
- **Hover tooltip:** title, status, effort (with unit), source description
- **Default date range:** earliest `bar_start` to latest `bar_end` + 7-day padding each side
- **Date range controls:** previous/next period buttons; date range picker inputs

### Effort Config in Project Settings

New section in the existing Project Settings tab in `ConfigPage.tsx`:
- **Enable/disable toggle** — when disabled, sets `effort_unit` to `null` via `PATCH /projects/{id}`
- **Unit label text input** — shown when enabled, e.g. `"sp"`, `"hours"`, `"days"`

## Reuse

| Existing thing | Reused for |
|----------------|------------|
| `StatusHistory` model + `changed_at` field | Timeline bar_start/bar_end from status fallback |
| `require_project_access()` + `require_manager()` | Sprint service auth |
| `useProjectStatuses` hook pattern | `useProjectSprints` hook |
| BacklogPage task row style | SprintView task rows |
| Existing modal patterns (create task modal) | "New Sprint" modal |
| `ProjectStatus` config pattern | effort_unit in Project Settings |
