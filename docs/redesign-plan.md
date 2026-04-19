# Frontend Redesign — SPT "Focus" (Variation A)

## Context

The user assembled a design bundle in `docs/design plan/` via Claude Design. The primary design is `SPT Redesign.html`, which ships two layout variations. We're building **Variation A — "Focus"**: left sidebar, balanced density, board-first. The goal is a pixel-faithful reimplementation in the existing React + TypeScript + Tailwind stack.

**User decisions (already confirmed):**
- Variation A only (no toggle).
- Design references concepts the backend doesn't model (project short keys, per-item codes, watchers, due dates, sub-task checklists, linked items, "My work", activity feed). Render these as **greyed placeholders** — no backend/API changes in this pass.
- Introduce a full **CSS variable token system** (`--st-*`, `--pr-*`, `--accent*`) plus an accent-color picker on the Config page.
- **Full shell rewrite** — replace the current top `NavBar` layout with a sidebar-based `AppShell`; restyle every page.

**Expected outcome**: the app should visually match the Variation A screens in the design for the Board, Projects list, Story detail, Task detail, Settings, Invitations (Inbox), and Login. Non-existent data shows as muted placeholders with clear "not yet supported" affordance.

---

## Scope

**In scope**
- New `AppShell` layout (sidebar + main), replacing `ProtectedLayout` in `src/App.tsx`.
- Design tokens in `src/index.css` + a `ThemeStyle` runtime override for accent.
- Rewrite of all protected pages; redesign of `LoginPage` with split layout.
- New primitives: `StatusPill`, `PriorityBars`, `Avatar`, `AvatarStack`, `Breadcrumbs`, `DetailField`, `HistoryTimeline` (restyled), `Sep`, `Kbd`.
- New feature components (board, placeholder widgets): `Board`, `BoardCard`, `CommentsThread` (wraps existing `CommentList`), `TimeInStatus` (placeholder), `ProjectMiniProgress`, `ActivityFeed` (placeholder), `InboxStats` (placeholder), `Checklist` (placeholder).
- Accent-color picker + density selector added to `ConfigPage` → Profile/Appearance tab.
- i18n keys for all new strings (en-GB + pl).

**Out of scope (explicit)**
- `Tweaks` panel (dev-only in the design bundle — not shipped).
- Cmd-K command palette (design shows it, but user didn't request it; add as a follow-up if desired).
- Variation B.
- Backend/API changes for codes, watchers, due dates, checklist items, activity, "My work". These are placeholders only.
- Timeline/Insights per-project sub-tabs — wire the tab triggers but render "Coming soon" placeholders.

---

## Design tokens

Add to `frontend/src/index.css`:

```css
:root {
  --st-todo:  #94a3b8;
  --st-prog:  #6366f1;
  --st-rev:   #d97706;
  --st-test:  #db2777;
  --st-done:  #059669;
  --pr-low:   #94a3b8;
  --pr-med:   #d97706;
  --pr-high:  #dc2626;
  --accent:   #6366f1;
  --accent-soft: #eef2ff;
  --accent-text: #4338ca;
}
.dark { --accent-soft: #1e1b4b; --accent-text: #a5b4fc; }
```

Plus pill/priority-bar/focus-ring utility classes copied verbatim from `SPT Redesign.html` lines 15–97.

**Fonts**: add Geist + Geist Mono + Instrument Serif. Load via `<link>` in `frontend/index.html` (not `@import` — keeps Tailwind build fast).

**Accent runtime override**: new component `src/components/layout/ThemeStyle.tsx` (mirrors design's `ThemeStyle` at lines 346–361) injects `<style>` with the chosen accent's hex + soft + text variants. Accent choices: `indigo`, `violet`, `emerald`, `rose`, `amber`, `stone` (see design lines 338–345 for exact values).

**Persistence**: extend `ThemeContext` (currently just light/dark/system) to also hold `accent` and `density`. Persist via the existing `PATCH /api/v1/users/me/config` path if it accepts arbitrary JSON; otherwise fall back to `localStorage` only and leave a TODO. **Verify this** — `frontend/src/context/ThemeContext.tsx` and `backend/app/db/models/user_config.py`.

---

## App shell

**New file**: `frontend/src/components/layout/AppShell.tsx` — implements the sidebar from design lines 407–477.

Structure:
```
<div className="flex min-h-screen">
  <aside w=248px>              # sidebar
    <WorkspaceSwitcher />       # placeholder (no workspaces backend)
    <SearchTrigger />           # placeholder button, opens nothing yet
    <PrimaryNav />              # Home → /projects, Inbox → /invitations, My work → placeholder
    <ProjectsList />            # live: useProjects(), shows p.name + open-task count
    <Footer />                  # Settings link + current user avatar + role
  </aside>
  <main flex-1>
    <Outlet />
  </main>
</div>
```

Replace `ProtectedLayout` in `src/App.tsx` with `<AppShell />`. Remove `src/components/layout/NavBar.tsx` (or keep unused and delete once all pages migrate — recommend deletion after Step 4 below).

**Search trigger** renders as a ⌘K-style button but is inert (shows a toast "Search coming soon" on click). No Cmd-K palette built.

**Workspace switcher** shows a fixed label ("My workspace") + member count computed from an API call or hardcoded placeholder — this is one of the greyed placeholder regions.

---

## Per-page work

Reference: all line numbers refer to `docs/design plan/project/SPT Redesign.html`.

### 1. `LoginPage` (lines 1116–1183)

Split layout: form left, atmospheric preview right (shows mock task cards + testimonial). Keep existing form logic (`useAuth().login`), just restyle. "Continue with Google" and "SSO" buttons are placeholders — rendered but disabled with tooltip "Not yet supported". Right-rail preview uses real status/priority data from placeholder task list.

### 2. `ProjectsPage` (lines 603–662)

Replace current card grid with design's card layout: project key (placeholder — first 3 letters of name uppercased), status pill, name, 1-line desc, `ProjectMiniProgress` (segmented bar by status distribution — compute from `Project.stories` stats if available, else placeholder), member avatar stack, `{n} stories`, `{n} open`, priority bars. Header: title, subtitle ("{n} active"), Filters button, "New project" button (keep existing create flow).

### 3. `ProjectDetailPage` — becomes Project Board (lines 494–600)

This is the biggest change. Currently renders Stories/Members tabs. Redesign to:

- `ProjectHeader` — breadcrumbs, title, status pill, priority bars, description, member avatar stack, Invite button, New task button, overflow menu, **sub-tabs** (Board / List / Timeline / Insights / Members).
- **Board tab (default)**: kanban columns one per status (to_do → done), cards use `BoardCard` (lines 584–600). Card shows code (placeholder), priority bars, title, story code (placeholder), updated-at relative time, assignee avatar. Cards click through to `/stories/:storyId/tasks/:taskId`. Drag-and-drop **not** in this pass — cards are click-only; add `cursor-pointer` + hover lift only.
- **List tab**: flat table of all tasks in the project (group by status row headers).
- **Timeline / Insights tabs**: `EmptyState` with "Coming soon" icon.
- **Members tab**: keep existing member management UI, restyled as rows matching Settings › Members (lines 1010–1028).

Fetch: `useStories(projectId)` + for each story `useTasks(storyId)` already exists; flatten into `ALL_TASKS` equivalent client-side. If this is too many round-trips, check whether there's a `GET /api/v1/projects/:id/tasks` endpoint — if not, flag as a perf follow-up but accept it for now.

### 4. `StoryDetailPage` (lines 665–750)

Two-column layout: main content + right rail.

- Main: breadcrumbs, title, status pill, priority bars, assignee avatars (placeholder — backend has `Task.assignee_id`, may not have multi-assignee on stories → verify; fall back to "No assignees"), tasks list (rows styled per lines 700–711), description card (render existing `description` through `MarkdownEditor` in read mode), comments via `CommentsThread` (wraps existing `CommentList`).
- Right rail (`DetailField` rows): Status, Priority, Assignees, Project, Created, Updated, History (uses restyled `StatusHistoryTimeline` → rename to `HistoryTimeline` visually; keep the existing data flow).

### 5. `TaskDetailPage` (lines 806–918)

Same two-column shape. Main content: breadcrumbs, title, inline status/priority/assignee chips, description card, **Checklist** section (`Checklist` placeholder component — renders 4 static rows greyed out with "Sub-tasks coming soon" footer), comments (`CommentsThread`). Right rail: Status, Priority, Assignee, Story (link), Project, Created, **Time in status** widget (`TimeInStatus` — computes real data from `StatusHistoryEntry.elapsed_seconds` if available; falls back to placeholder bars if not). Watchers, Due, Linked = greyed placeholder rows.

### 6. `InvitationsPage` → "Inbox" (lines 1055–1112)

Two-column: left = Pending invitations (existing flow) + Recent activity (placeholder — a greyed "Activity feed coming soon" card with 3-5 mock rows dimmed to 40% opacity). Right rail = `InboxStats` card ("Your week: Open / Done / Overdue") — all placeholder zeros.

### 7. `ConfigPage` → Settings (lines 920–1044)

Left sidebar tabs: Profile / Notifications / Members / API keys / Billing.
- **Profile**: restyled user panel + Appearance section (theme + accent picker + density selector). Keep existing `ThemeSwitcher` + `LocaleSwitcher`, add new `AccentPicker` + `DensityPicker`.
- **Notifications**: placeholder rows with toggles that don't persist.
- **Members**: existing workspace-level concept doesn't exist — this page becomes **Members of workspace** placeholder OR routes to project-level members. Recommend: placeholder with "Workspace members coming soon" + link to any project's Members tab.
- **API keys**: keep existing `ApiKeyList`, restyle card.
- **Billing**: placeholder "Free plan · Upgrade" card (disabled button).

---

## Shared / primitive components (new files in `src/components/common/`)

| File | Source lines | Notes |
|---|---|---|
| `StatusPill.tsx` | 213–221 | Replaces `StatusBadge` (keep as alias for back-compat). |
| `PriorityBars.tsx` | 222–230 | Replaces `PriorityBadge` where the design calls for bars. Keep `PriorityBadge` for places that still need a labelled chip. |
| `Avatar.tsx` | 231–239 | Gradient-bg avatar from user name initials. Deterministic colour by hashing `user.id` → 1 of 6 gradients. |
| `AvatarStack.tsx` | 240–253 | +N overflow bubble. |
| `Breadcrumbs.tsx` | 497–501 | Reusable; takes an array of `{label, to}`. |
| `DetailField.tsx` | 751–758 | label/value row used in right rails. |
| `Sep.tsx` | 264 | Dot separator. |
| `Kbd.tsx` | 73–82 | Keyboard key chip. |
| `Placeholder.tsx` | n/a | Standard greyed wrapper. |

Update existing:
- `StatusHistoryTimeline.tsx` → restyle to match design's `HistoryTimeline` (dot uses status CSS var).
- `MarkdownEditor.tsx` → keep behaviour, match toolbar styling from comment composer (lines 772–787).
- `CommentList.tsx` → wrap with a new `CommentsThread.tsx` that adds the composer design from lines 771–786.

---

## Routing changes (`src/App.tsx`)

Mostly unchanged. Two additions:
- `/my-work` → placeholder page showing "My work — coming soon". Linked from sidebar.
- `/invitations` page title/copy updated to "Inbox".

Default `/` still redirects to `/projects`.

---

## i18n

All new strings go in `frontend/src/locales/en-GB.json` and `pl.json`. Group under:
- `shell.*` (sidebar labels, workspace, search, my work)
- `board.*` (column headers, add-task, filters)
- `placeholder.*` (coming soon variants)
- `settings.appearance.*` (accent, density labels)
- `inbox.*` (your week, recent activity)

Polish translations: use Google-translate seeds then mark unreviewed in a comment at top of `pl.json` for the user to proofread. (Matches existing practice — check current pl.json first.)

---

## Critical files to modify

**Rewrite / replace:**
- `frontend/src/App.tsx` — swap `ProtectedLayout` for `AppShell`.
- `frontend/src/index.css` — add tokens + utility classes.
- `frontend/index.html` — add Google Fonts link.
- `frontend/src/components/layout/NavBar.tsx` — **delete** after migration.
- `frontend/src/pages/ProjectsPage.tsx`
- `frontend/src/pages/ProjectDetailPage.tsx`
- `frontend/src/pages/StoryDetailPage.tsx`
- `frontend/src/pages/TaskDetailPage.tsx`
- `frontend/src/pages/InvitationsPage.tsx`
- `frontend/src/pages/ConfigPage.tsx`
- `frontend/src/pages/LoginPage.tsx`
- `frontend/src/pages/RegisterPage.tsx` (match Login split layout)
- `frontend/src/components/common/StatusBadge.tsx` → becomes `StatusPill.tsx` (keep old export as alias).
- `frontend/src/components/common/PriorityBadge.tsx` → add `PriorityBars.tsx` alongside.
- `frontend/src/components/status-history/StatusHistoryTimeline.tsx` — restyle.
- `frontend/src/context/ThemeContext.tsx` — extend with `accent`, `density`.

**New files:**
- `frontend/src/components/layout/AppShell.tsx`
- `frontend/src/components/layout/ThemeStyle.tsx`
- `frontend/src/components/common/{Avatar,AvatarStack,Breadcrumbs,DetailField,Sep,Kbd,Placeholder}.tsx`
- `frontend/src/components/board/{Board,BoardCard,ProjectHeader,ProjectMiniProgress}.tsx`
- `frontend/src/components/task/{Checklist,TimeInStatus,CommentsThread}.tsx`
- `frontend/src/components/inbox/{ActivityFeed,InboxStats}.tsx`
- `frontend/src/components/config/{AccentPicker,DensityPicker}.tsx`
- `frontend/src/pages/MyWorkPage.tsx` (placeholder)
- i18n entries in both locale files.

**Reuse (don't rewrite):**
- `src/hooks/{useProjects,useStories,useTasks,usePagination,useRole}.ts`
- `src/services/api.ts` — all entity types + axios wrapper stay as-is.
- `src/components/common/{MarkdownEditor,EmptyState,Skeleton,ConfirmDialog,LoadMoreButton}.tsx`
- `src/components/comments/CommentList.tsx` — wrapped by the new `CommentsThread`.
- `src/components/config/{LocaleSwitcher,ThemeSwitcher,ApiKeyList}.tsx`
- `src/context/{AuthContext,ToastContext}.tsx`

---

## Suggested implementation order

1. **Tokens + fonts** — `index.css`, `index.html`, `ThemeStyle` component. Verify dark mode still works.
2. **Primitives** — `Avatar`, `AvatarStack`, `StatusPill`, `PriorityBars`, `DetailField`, `Breadcrumbs`, `Placeholder`. Storybook-free; verify visually by dropping them into a scratch page.
3. **AppShell** — replace `ProtectedLayout`. At this stage all existing pages render inside the new shell even if they still look like the old design.
4. **Delete `NavBar.tsx`**, delete stale sidebar link in any component still importing it.
5. **ProjectsPage** — easy first page, validates tokens end-to-end.
6. **ProjectDetailPage** — biggest work; land Board first, then sub-tabs.
7. **Story / Task detail** — share primitives already built.
8. **Invitations, Settings, Login, Register** — cosmetic.
9. **ThemeContext extension + accent/density pickers**.
10. **i18n sweep** — pass over all new strings.

Land each step as a commit so it's easy to bisect if something regresses.

---

## Verification

Run both tiers:

**Build / type check:**
```
cd frontend
npm run build        # must succeed
npm run lint         # must pass (fix any new warnings)
```

**Manual browser check** — required because this is UI work:
```
cd backend && uv run python -m app.main     # start API
cd frontend && npm run dev                    # start dev server
```

Click through the golden path and confirm:
1. `/login` — split layout renders, login succeeds.
2. Sidebar — Home, Inbox, My work, Projects list, Settings all navigate correctly.
3. `/projects` — card grid matches design; click-through to project opens Board.
4. Project → Board — five columns rendered, cards styled, clicking a card opens task detail.
5. Project sub-tabs — switching to Timeline/Insights shows placeholder.
6. Story detail — main content + right rail render, history timeline dots coloured by status.
7. Task detail — Checklist, Watchers, Due, Linked render as greyed placeholders; Time-in-Status shows real data.
8. `/invitations` — pending invitations still accept/decline; activity feed + stats are greyed.
9. `/config` — accent picker changes accent live across the app; density picker updates spacing; all existing settings still work.
10. Dark mode — toggle via ThemeSwitcher, confirm tokens flip.
11. i18n — switch to Polish, confirm new strings are translated (flag any that fell back to English).
12. Responsive — sidebar collapses reasonably <768px (either hide behind a drawer or let it wrap — pick one and note the choice).

**Accessibility spot-check:**
- Tab through sidebar — focus ring visible.
- All buttons have accessible names (check sidebar icon-only buttons have `title` or `aria-label`).
- Colour contrast of status pills in both themes passes WCAG AA.

---

## Open questions (non-blocking)

- Does `PATCH /api/v1/users/me/config` accept arbitrary JSON, or only known fields? If the latter, accent + density persist only to `localStorage` until the backend adds a column — leave a TODO.
- Backend has `Task.assignee_id` (single). Design shows `story.assignees` as an array. For stories, we'll render an avatar stack of **unique task assignees in the story** as a reasonable derivation. Confirm that's acceptable, or fall back to a single placeholder avatar.
- Responsive behaviour of the sidebar — not specified in design. Suggest: hide behind a hamburger at `<md` breakpoint.

---

## TODOs — greyed placeholder elements

Every item below is rendered in the UI as a visually-muted placeholder (grey text, often with a "Coming soon" affordance) in this redesign pass. Each represents backend/API work needed to make the element functional. Grouped by screen.

### Global (AppShell sidebar)
- [ ] **Workspace switcher** — currently a static label ("My workspace") + placeholder member count. Requires a multi-tenant workspace concept (model, API, switching flow).
- [ ] **Search trigger (⌘K)** — inert button showing a toast. Requires cross-entity search API + command palette UI.
- [ ] **Inbox badge count** — placeholder "3". Requires unread-activity count endpoint.
- [ ] **My work personal view** — placeholder page. Requires `/api/v1/users/me/tasks` endpoint returning items assigned to the current user across projects.
- [ ] **Sidebar project open-task count** — shown as placeholder when not available. Requires aggregated count on `Project` list response.

### Projects list (`ProjectsPage`)
- [ ] **Project short key** (`ORB`, `PAY`) — client-derived from name initials. Requires a real `key` field on the `Project` model with uniqueness constraint.
- [ ] **Project mini-progress bar** — placeholder segments. Requires per-project status-distribution stats (count of tasks/stories in each status) on the list response.
- [ ] **Archived count in header subtitle** — "1 archived" is placeholder. Requires archived-count in the projects index response.

### Project detail / Board (`ProjectDetailPage`)
- [ ] **Item codes** (`ORB-101`, `ORB-12`) — derived from `id.slice(0,7)`. Requires auto-generated sequential codes on tasks/stories (e.g. `{PROJECT_KEY}-{seq}`).
- [ ] **Board drag-and-drop** — cards are click-only. Requires DnD library integration + status-update API calls.
- [ ] **Timeline sub-tab** — "Coming soon" placeholder. Requires date fields (start/due) and a Gantt/timeline component.
- [ ] **Insights sub-tab** — "Coming soon" placeholder. Requires aggregated analytics endpoints (throughput, cycle time, status distribution over time).
- [ ] **Board filter chips** — "Filter", "Group: Status", assignee chips rendered but inert. Requires filter state + query-param wiring.

### Story detail (`StoryDetailPage`)
- [ ] **Multiple story assignees** — placeholder avatar stack derived from task assignees. Requires a story→user many-to-many table and API.

### Task detail (`TaskDetailPage`)
- [ ] **Sub-tasks / Checklist** — 4 static rows dimmed with "Sub-tasks coming soon" footer. Requires a `checklist_items` table (task_id, label, done, order) and CRUD endpoints.
- [ ] **Watchers** — greyed placeholder row. Requires a `task_watchers` join table + subscribe/unsubscribe endpoints + notification plumbing.
- [ ] **Due date** — greyed "No due date" row. Requires a nullable `due_at` column on tasks + date-picker UI.
- [ ] **Linked items** — greyed placeholder rows. Requires a `task_links` table (from_task, to_task, relation) and API.
- [ ] **Time-in-status** — computed from real `StatusHistoryEntry.elapsed_seconds` where possible; falls back to placeholder bars if data is missing. No placeholder action required if StatusHistory is complete, but double-check coverage of legacy tasks.

### Inbox / Invitations (`InvitationsPage`)
- [ ] **Recent activity feed** — greyed mock rows at 40% opacity. Requires a cross-project activity stream endpoint (joins of status history, comments, invitations).
- [ ] **"Your week" stats card** — placeholder zeros for Open / Done / Overdue. Requires a `/api/v1/users/me/week-summary` (or similar) endpoint.

### Settings (`ConfigPage`)
- [ ] **Notifications preferences** — toggles that don't persist. Requires a notification-prefs model (per-event type: mentions, assignments, status changes, comments) and API.
- [ ] **Workspace Members tab** — placeholder "Workspace members coming soon". Requires the workspace concept above, or re-scope to per-project members only.
- [ ] **Billing tab** — placeholder "Free plan" card with disabled Upgrade button. Requires a billing integration (plans, Stripe, seat counting).
- [ ] **Accent color persistence** — may fall back to `localStorage` only if `PATCH /api/v1/users/me/config` doesn't accept arbitrary JSON. Verify and, if needed, add `accent` + `density` columns to `user_config`.

### Login / Register
- [ ] **Continue with Google** — button disabled with tooltip. Requires OAuth provider integration.
- [ ] **Continue with SSO** — button disabled with tooltip. Requires SAML/OIDC SSO integration.

### Nice-to-have (design-adjacent, not strictly placeholders)
- [ ] **Command palette (⌘K)** — design shows a full palette; we ship an inert trigger only. Promote to a full implementation once search API exists.
- [ ] **Avatar stored image / upload** — currently derives gradient + initials from name. Add avatar upload + CDN storage if/when needed.
