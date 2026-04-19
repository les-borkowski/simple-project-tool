# Filter/Sort Toolbar — Stories Tab & Board Tab

**Date:** 2026-04-19  
**Branch:** redesing-attempt-2  
**Status:** Approved for implementation

---

## Summary

Add a unified filter/sort toolbar to two views in `ProjectDetailPage`:

1. **Stories tab** — filter and sort the story list
2. **Board tab** — filter tasks across all kanban columns; replace per-column `+` with a single toolbar button

---

## Toolbar Layout

### Stories tab

```
[Search…] [Status ▾] [Priority ▾] [Sort ▾] [↑↓]    23 tasks · 5 stories    [+ New story]
```

- **Search**: text input, filters stories by title (case-insensitive substring)
- **Status**: select — All / To do / In progress / In review / In testing / Done
- **Priority**: select — All / Low / Medium / High
- **Sort**: select — Created / Status / Priority / Title; direction toggle (↑↓)
- **Counts**: total task count (sum of `tasksByStory` values) · total story count (`storiesHook.items.length`) — reflects *unfiltered* totals, not the current filtered subset
- **New story**: accent-bg button, manager-only; opens existing `showCreateStory` modal

### Board tab

```
[Search…] [Priority ▾] [Assignee ▾] [Story ▾]    23 tasks · 8 done    [+ New task]
```

- **Search**: text input, filters tasks by title
- **Priority**: select — All / Low / Medium / High
- **Assignee**: select — All / [member name list] (populated from `members` state)
- **Story**: select — All / No story / [story title list] (populated from `storiesHook.items`)
- **Counts**: total task count · done task count — *unfiltered* totals
- **New task**: accent-bg button; opens existing `showCreateTask` modal (pre-set status to `to_do`)
- **Column `+` buttons**: removed from column headers

---

## Filtering Logic

All filtering is client-side, applied to already-fetched data. No new API calls.

### Stories tab

Filtered items derived from `storiesHook.items`:

```
filterSearch  → story.title.toLowerCase().includes(search)
filterStatus  → story.status === status  (skip if "all")
filterPriority → story.priority === priority  (skip if "all")
```

Sorting applied after filtering, duplicating the `applySortField` helper inline (4 lines; not worth extracting to a shared util).

### Board tab

Filtered items derived from `allTasks` array (already built in the component):

```
filterSearch   → task.title.toLowerCase().includes(search)
filterPriority → task.priority === priority  (skip if "all")
filterAssignee → task.assignee_id === assigneeId  (skip if "all")
filterStory    → story?.id === storyId  (skip if "all"; "none" matches story === null)
```

Filtered `allTasks` is then distributed into status columns as before.

---

## State

### Stories tab (new state)
```ts
const [storySearch, setStorySearch] = useState('')
const [storyFilterStatus, setStoryFilterStatus] = useState<Status | 'all'>('all')
const [storyFilterPriority, setStoryFilterPriority] = useState<Priority | 'all'>('all')
const [storySortField, setStorySortField] = useState<'created_at' | 'status' | 'priority' | 'title'>('created_at')
const [storySortDir, setStorySortDir] = useState<'asc' | 'desc'>('desc')
```

### Board tab (new state)
```ts
const [boardSearch, setBoardSearch] = useState('')
const [boardFilterPriority, setBoardFilterPriority] = useState<Priority | 'all'>('all')
const [boardFilterAssignee, setBoardFilterAssignee] = useState('')  // '' = all
const [boardFilterStory, setBoardFilterStory] = useState('')  // '' = all, 'none' = no story
```

---

## Derived Values

```ts
// Stories tab
const totalTaskCount = Object.values(tasksByStory).reduce((s, arr) => s + arr.length, 0)

const filteredStories = storiesHook.items
  .filter(s => !storySearch || s.title.toLowerCase().includes(storySearch.toLowerCase()))
  .filter(s => storyFilterStatus === 'all' || s.status === storyFilterStatus)
  .filter(s => storyFilterPriority === 'all' || s.priority === storyFilterPriority)
  .sort((a, b) => {
    const c = applySortField(a, b, storySortField)
    return storySortDir === 'asc' ? c : -c
  })

// Board tab
const totalDoneCount = allTasks.filter(({ task }) => task.status === 'done').length

const filteredBoardTasks = allTasks
  .filter(({ task }) => !boardSearch || task.title.toLowerCase().includes(boardSearch.toLowerCase()))
  .filter(({ task }) => boardFilterPriority === 'all' || task.priority === boardFilterPriority)
  .filter(({ task }) => !boardFilterAssignee || task.assignee_id === boardFilterAssignee)
  .filter(({ task, story }) => {
    if (!boardFilterStory) return true
    if (boardFilterStory === 'none') return story === null
    return story?.id === boardFilterStory
  })
```

---

## Toolbar Component

Extract a shared `ToolbarShell` layout wrapper (inline in the file, not a separate component file) that renders the `flex items-center gap-2` row with a left section, auto-expanding spacer, counts, and right action button. Each toolbar then composes its own controls into the left section.

---

## Styling

Follow existing `ProjectDetailPage` patterns:
- Controls: `text-[12px] px-2.5 py-1.5 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950`
- Search input: same class, `w-40`
- Counts: `text-[11.5px] text-stone-400 tabular-nums` (muted, between controls and action button)
- Toolbar container: `flex items-center gap-2 mb-4`
- Separator between counts and action button: implicit spacing via `ml-auto` on counts

Design plan reference: `docs/design plan/project/styles.css` — `.btn.ghost.sm` pattern for filter controls, `.mono` for counts.

---

## i18n

New keys needed in both `en-GB.json` and `pl.json`:

```json
"filter.assignee": "Assignee",
"filter.story": "Story",
"filter.no_story": "No story",
"toolbar.stories_count": "{{count}} stories",
"toolbar.tasks_count": "{{count}} tasks",
"toolbar.done_count": "{{count}} done"
```

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/pages/ProjectDetailPage.tsx` | Add toolbar state, filtered derivations, toolbar JSX for both tabs; remove column `+` buttons |
| `frontend/src/locales/en-GB.json` | Add 6 new keys |
| `frontend/src/locales/pl.json` | Add 6 new keys (Polish) |

No backend changes. No new component files. No migration needed.

---

## Out of Scope

- Server-side filtering (all filtering is client-side against already-fetched data)
- Persisting filter state across navigation
- Filter state indicators / active filter badges
- Sorting on the board view (tasks are already grouped by status column)
