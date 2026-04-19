# Filter/Sort Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a filter/sort toolbar to the Stories tab and Board tab of `ProjectDetailPage`, with client-side filtering and a summary count. Remove per-column `+` buttons from the board.

**Architecture:** All filtering is client-side against already-fetched state. New filter state drives derived arrays (`filteredStories`, `filteredBoardTasks`) which replace the raw arrays in JSX. The board toolbar also houses the "New task" button formerly spread across column headers.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, i18next

**Spec:** `docs/superpowers/specs/2026-04-19-filter-sort-toolbar-design.md`

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/locales/en-GB.json` | Add 6 new i18n keys |
| `frontend/src/locales/pl.json` | Add 6 new i18n keys (Polish) |
| `frontend/src/pages/ProjectDetailPage.tsx` | All UI/logic changes — filter state, derived arrays, toolbar JSX, board toolbar JSX, remove column `+` buttons |

---

## Task 1: Add i18n keys

**Files:**
- Modify: `frontend/src/locales/en-GB.json`
- Modify: `frontend/src/locales/pl.json`

- [ ] **Step 1: Add keys to en-GB.json**

Open `frontend/src/locales/en-GB.json`. Add these 6 entries inside the `filter.*` block (after `"filter.all"`):

```json
"filter.assignee": "Assignee",
"filter.story": "Story",
"filter.no_story": "No story",
"toolbar.tasks_count": "{{count}} tasks",
"toolbar.stories_count": "{{count}} stories",
"toolbar.done_count": "{{count}} done"
```

- [ ] **Step 2: Add keys to pl.json**

Open `frontend/src/locales/pl.json`. Add these 6 entries in the same relative position:

```json
"filter.assignee": "Przypisany",
"filter.story": "Historyjka",
"filter.no_story": "Bez historyjki",
"toolbar.tasks_count": "{{count}} zadań",
"toolbar.stories_count": "{{count}} historyjek",
"toolbar.done_count": "{{count}} ukończonych"
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/locales/en-GB.json frontend/src/locales/pl.json
git commit -m "feat: add i18n keys for filter/sort toolbar"
```

---

## Task 2: Add sort helper and filter state to ProjectDetailPage

**Files:**
- Modify: `frontend/src/pages/ProjectDetailPage.tsx`

- [ ] **Step 1: Add `applySortField` helper above the component**

In `frontend/src/pages/ProjectDetailPage.tsx`, find the line `export function ProjectDetailPage()` (currently line ~120). Insert this function directly above it:

```tsx
type StorySortField = 'created_at' | 'status' | 'priority' | 'title'

const STORY_STATUS_ORDER: Record<string, number> = { to_do: 0, in_progress: 1, in_review: 2, in_testing: 3, done: 4 }
const STORY_PRIORITY_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2 }

function applySortField(a: StoryResponse, b: StoryResponse, field: StorySortField): number {
  if (field === 'status') return STORY_STATUS_ORDER[a.status] - STORY_STATUS_ORDER[b.status]
  if (field === 'priority') return STORY_PRIORITY_ORDER[a.priority] - STORY_PRIORITY_ORDER[b.priority]
  if (field === 'title') return a.title.localeCompare(b.title)
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
}
```

- [ ] **Step 2: Add filter state inside the component**

Inside `ProjectDetailPage`, find the block of `useState` declarations (after `const [creatingTask, setCreatingTask] = useState(false)`, around line 159). Add after it:

```tsx
const [storySearch, setStorySearch] = useState('')
const [storyFilterStatus, setStoryFilterStatus] = useState<Status | 'all'>('all')
const [storyFilterPriority, setStoryFilterPriority] = useState<Priority | 'all'>('all')
const [storySortField, setStorySortField] = useState<StorySortField>('created_at')
const [storySortDir, setStorySortDir] = useState<'asc' | 'desc'>('desc')

const [boardSearch, setBoardSearch] = useState('')
const [boardFilterPriority, setBoardFilterPriority] = useState<Priority | 'all'>('all')
const [boardFilterAssignee, setBoardFilterAssignee] = useState('')
const [boardFilterStory, setBoardFilterStory] = useState('')
```

- [ ] **Step 3: Check TypeScript compiles**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

Expected: build succeeds (or only pre-existing errors, none related to the new state).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ProjectDetailPage.tsx
git commit -m "feat: add filter state and sort helper to ProjectDetailPage"
```

---

## Task 3: Add derived filtered values

**Files:**
- Modify: `frontend/src/pages/ProjectDetailPage.tsx`

- [ ] **Step 1: Add derived values before the return statement**

Find the line `// Build flat task list for board` (around line 315). Insert the following directly after the `allTasks` array definition (which ends around line 321) and before the `if (loading)` check:

```tsx
// Stories tab derived values
const totalTaskCount = Object.values(tasksByStory).reduce((sum, arr) => sum + arr.length, 0)

const filteredStories = storiesHook.items
  .filter(s => !storySearch || s.title.toLowerCase().includes(storySearch.toLowerCase()))
  .filter(s => storyFilterStatus === 'all' || s.status === storyFilterStatus)
  .filter(s => storyFilterPriority === 'all' || s.priority === storyFilterPriority)
  .sort((a, b) => {
    const c = applySortField(a, b, storySortField)
    return storySortDir === 'asc' ? c : -c
  })

// Board tab derived values
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

- [ ] **Step 2: Check TypeScript compiles**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ProjectDetailPage.tsx
git commit -m "feat: add filteredStories and filteredBoardTasks derived values"
```

---

## Task 4: Stories tab — toolbar and filtered table

**Files:**
- Modify: `frontend/src/pages/ProjectDetailPage.tsx`

- [ ] **Step 1: Replace the stories tab non-empty branch**

Find the stories tab non-empty branch (the `<>` block that starts after `storiesHook.items.length === 0 ?`). It currently contains:
- a `flex justify-end mb-4` div with the "New story" manager button
- the table `div.rounded-md border`
- the `LoadMoreButton`

Replace the entire `<>…</>` block (keeping the outer `storiesHook.items.length === 0` conditional intact) with:

```tsx
<>
  {/* Toolbar */}
  <div className="flex items-center gap-2 mb-4">
    <input
      type="text"
      placeholder={t('filter.search')}
      value={storySearch}
      onChange={e => setStorySearch(e.target.value)}
      className="w-40 px-2.5 py-1.5 text-[12px] rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
    />
    <select
      value={storyFilterStatus}
      onChange={e => setStoryFilterStatus(e.target.value as Status | 'all')}
      className="px-2.5 py-1.5 text-[12px] rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
    >
      <option value="all">{t('filter.all')} {t('filter.status')}</option>
      {statuses.map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
    </select>
    <select
      value={storyFilterPriority}
      onChange={e => setStoryFilterPriority(e.target.value as Priority | 'all')}
      className="px-2.5 py-1.5 text-[12px] rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
    >
      <option value="all">{t('filter.all')} {t('filter.priority')}</option>
      {priorities.map(p => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
    </select>
    <select
      value={storySortField}
      onChange={e => setStorySortField(e.target.value as StorySortField)}
      className="px-2.5 py-1.5 text-[12px] rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
    >
      <option value="created_at">{t('sort.created')}</option>
      <option value="status">{t('sort.status')}</option>
      <option value="priority">{t('sort.priority')}</option>
      <option value="title">{t('sort.title')}</option>
    </select>
    <button
      onClick={() => setStorySortDir(d => d === 'asc' ? 'desc' : 'asc')}
      className="px-2.5 py-1.5 text-[12px] rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
    >
      {storySortDir === 'asc' ? '↑' : '↓'}
    </button>
    <span className="flex-1" />
    <span className="text-[11.5px] text-stone-400 tabular-nums">
      {t('toolbar.tasks_count', { count: totalTaskCount })} · {t('toolbar.stories_count', { count: storiesHook.items.length })}
    </span>
    {isManager && (
      <button
        onClick={() => setShowCreateStory(true)}
        className="px-2.5 py-1.5 text-[12px] rounded-md accent-bg inline-flex items-center gap-1.5"
      >
        <IPlus /> {t('stories.create')}
      </button>
    )}
  </div>

  {/* Stories table */}
  {filteredStories.length === 0 ? (
    <p className="text-[13px] text-stone-400 py-8 text-center">{t('stories.empty')}</p>
  ) : (
    <div className="rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 overflow-hidden">
      <div className="grid grid-cols-[1fr_120px_100px_100px_80px] px-4 py-2 text-[10.5px] uppercase tracking-wider text-stone-400 font-medium border-b border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/30">
        <span>{t('board.col_title')}</span>
        <span>{t('board.col_status')}</span>
        <span>{t('board.col_priority')}</span>
        <span>{t('board.col_tasks')}</span>
        <span className="text-right">{t('board.col_updated')}</span>
      </div>
      {filteredStories.map((story) => (
        <div key={story.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
          <div className="grid grid-cols-[1fr_120px_100px_100px_80px] items-center px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-900/40">
            <div className="min-w-0">
              <Link
                to={`/projects/${id}/stories/${story.id}`}
                className="text-[13px] font-medium hover:accent-text"
              >
                {story.title}
              </Link>
            </div>
            <StatusPill status={story.status} />
            <PriorityBars priority={story.priority} withLabel />
            <span className="text-[12px] text-stone-500">{tasksByStory[story.id]?.length ?? '…'}</span>
            <div className="flex items-center justify-end gap-2">
              <span className="text-[11px] text-stone-400">{formatRelative(story.created_at)}</span>
              {isManager && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditStory({ id: story.id, title: story.title, description: story.description ?? '' })}
                    className="text-[11px] text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                  >
                    {t('actions.edit')}
                  </button>
                  <button
                    onClick={() => setDeleteStoryId(story.id)}
                    className="text-[11px] text-rose-400 hover:text-rose-600"
                  >
                    {t('actions.delete')}
                  </button>
                </div>
              )}
            </div>
          </div>
          {/* Tasks inline */}
          {tasksByStory[story.id] && tasksByStory[story.id].length > 0 && (
            <div className="border-t border-stone-50 dark:border-stone-800/60">
              {tasksByStory[story.id].map((task) => (
                <Link
                  key={task.id}
                  to={`/stories/${story.id}/tasks/${task.id}`}
                  className="grid grid-cols-[1fr_120px_100px_100px_80px] items-center px-4 py-1.5 pl-8 bg-stone-50/60 dark:bg-stone-900/20 hover:bg-stone-100/60 dark:hover:bg-stone-900/40 border-t border-stone-100/60 dark:border-stone-800/40 first:border-t-0"
                >
                  <span className="text-[12px] text-stone-600 dark:text-stone-400 truncate">{task.title}</span>
                  <StatusPill status={task.status} />
                  <PriorityBars priority={task.priority} withLabel />
                  <span />
                  <span className="text-[11px] text-stone-400 text-right">{formatRelative(task.created_at)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )}
  {storiesHook.nextCursor && (
    <LoadMoreButton onLoadMore={storiesHook.loadMore} isLoading={storiesHook.isLoading} />
  )}
</>
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

Expected: build succeeds with no new errors.

- [ ] **Step 3: Start dev server and verify Stories tab**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173`, navigate to a project, click the **Stories** tab. Verify:
- Toolbar appears with search input, Status select, Priority select, Sort select, ↑↓ button
- Counts show correctly (e.g. "4 tasks · 2 stories")
- "New story" button visible for managers, absent for contributors
- Typing in search filters the list
- Changing Status/Priority selects filters the list
- Changing sort field and direction reorders rows
- When all stories are filtered out: "No stories yet" message shows
- Clicking "New story" opens the create modal as before
- Edit / Delete row actions still work

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ProjectDetailPage.tsx
git commit -m "feat: add filter/sort toolbar to Stories tab"
```

---

## Task 5: Board tab — toolbar, filtered tasks, remove column `+` buttons

**Files:**
- Modify: `frontend/src/pages/ProjectDetailPage.tsx`

- [ ] **Step 1: Add board toolbar above the board scroll area**

Find the board tab section:

```tsx
{tab === 'board' && (
  <div className="flex-1 overflow-x-auto scroll-hidden bg-stone-50 dark:bg-stone-950/50 fine-grid">
```

Replace it with:

```tsx
{tab === 'board' && (
  <>
    {/* Board toolbar */}
    <div className="flex items-center gap-2 px-7 py-2.5 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950">
      <input
        type="text"
        placeholder={t('filter.search')}
        value={boardSearch}
        onChange={e => setBoardSearch(e.target.value)}
        className="w-40 px-2.5 py-1.5 text-[12px] rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
      />
      <select
        value={boardFilterPriority}
        onChange={e => setBoardFilterPriority(e.target.value as Priority | 'all')}
        className="px-2.5 py-1.5 text-[12px] rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
      >
        <option value="all">{t('filter.all')} {t('filter.priority')}</option>
        {priorities.map(p => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
      </select>
      <select
        value={boardFilterAssignee}
        onChange={e => setBoardFilterAssignee(e.target.value)}
        className="px-2.5 py-1.5 text-[12px] rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
      >
        <option value="">{t('filter.all')} {t('filter.assignee')}</option>
        {members.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
      </select>
      <select
        value={boardFilterStory}
        onChange={e => setBoardFilterStory(e.target.value)}
        className="px-2.5 py-1.5 text-[12px] rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
      >
        <option value="">{t('filter.all')} {t('filter.story')}</option>
        <option value="none">{t('filter.no_story')}</option>
        {storiesHook.items.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
      </select>
      <span className="flex-1" />
      <span className="text-[11.5px] text-stone-400 tabular-nums">
        {t('toolbar.tasks_count', { count: allTasks.length })} · {t('toolbar.done_count', { count: totalDoneCount })}
      </span>
      {isManager && (
        <button
          onClick={() => { setCreateTaskStatus('to_do'); setShowCreateTask(true) }}
          className="px-2.5 py-1.5 text-[12px] rounded-md accent-bg inline-flex items-center gap-1.5"
        >
          <IPlus /> {t('tasks.create')}
        </button>
      )}
    </div>
    <div className="flex-1 overflow-x-auto scroll-hidden bg-stone-50 dark:bg-stone-950/50 fine-grid">
```

Also close the new `<>` wrapper — find the closing `}` of the board tab section and change:

```tsx
      </div>
    </div>
  )}
```

to:

```tsx
      </div>
    </div>
  </>
)}
```

- [ ] **Step 2: Swap `allTasks` for `filteredBoardTasks` in the column render**

Inside the board tab, find:

```tsx
const columnTasks = allTasks.filter(({ task }) => task.status === statusId)
```

Change to:

```tsx
const columnTasks = filteredBoardTasks.filter(({ task }) => task.status === statusId)
```

- [ ] **Step 3: Remove the column `+` button**

Inside the column header, find and delete these lines:

```tsx
<button
  onClick={() => { setCreateTaskStatus(statusId); setShowCreateTask(true) }}
  className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
>
  <IPlus />
</button>
```

- [ ] **Step 4: Check TypeScript compiles**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 5: Verify board toolbar in browser**

With the dev server still running, navigate to the **Board** tab. Verify:
- Toolbar appears with Search, Priority, Assignee, Story selects
- Count shows "N tasks · M done"
- "New task" button opens the create modal (manager only)
- No `+` button in column headers
- Typing in search filters cards across all columns
- Priority filter hides non-matching cards
- Assignee filter hides cards not assigned to that person
- Story filter: "No story" shows only project-level tasks; selecting a story shows only that story's tasks
- Empty columns still show the dashed placeholder box

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ProjectDetailPage.tsx
git commit -m "feat: add filter toolbar to Board tab, remove column + buttons"
```
