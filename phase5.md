# Phase 5: Frontend (UI) Implementation Plan

## Context

Phases 1–4 are complete: database, auth, API, and CLI layers are all implemented. The backend API is fully operational at `localhost:8000/api/v1` with all 40+ endpoints ready to consume. Phase 5 builds the React + TypeScript SPA that provides a browser-based interface for end users. The `frontend/` directory does not yet exist and must be created from scratch.

Reference: `implementation-ui.md`

---

## Implementation Order

### Step 1 — Scaffold & Configure

**Commands to run:**
```bash
cd /Users/lechowski/WebDev/simple-project-tool
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install tailwindcss @tailwindcss/vite react-router-dom axios i18next react-i18next
npm install -D @types/node
```

**Files to create/modify:**
- `frontend/vite.config.ts` — add `/api` → `http://localhost:8000` proxy
- `frontend/tailwind.config.js` — class-based dark mode, content paths
- `frontend/src/index.css` — Tailwind directives (`@tailwind base/components/utilities`)
- Remove Vite boilerplate (`App.css`, default `App.tsx` content)

---

### Step 2 — i18n & Utilities

**Files to create:**

**`frontend/src/locales/en-GB.json`** — Full English translation keys:
- nav.projects, nav.invitations, nav.settings, nav.logout
- status.{to_do,in_progress,in_review,in_testing,done}
- priority.{low,medium,high}, role.{manager,contributor}
- actions.{save,cancel,delete,archive,restore,confirm,load_more}
- tasks.count_one / tasks.count_other, time.{seconds,minutes,hours,days}

**`frontend/src/locales/pl.json`** — Polish with 4 plural forms (one/few/many/other)

**`frontend/src/i18n.ts`** — i18next init: loads both locales, default `en-GB`, fallback `en-GB`

**`frontend/src/utils/format.ts`** — two utilities:
- `formatDate(iso: string, locale: string): string` — uses `Intl.DateTimeFormat`
- `formatDuration(seconds: number, t: TFunction): string` — uses i18n time.* keys

---

### Step 3 — Auth Context & API Service

**`frontend/src/context/AuthContext.tsx`**
- State: `{ user: UserResponse | null, accessToken: string | null, isAuthenticated: boolean, isLoading: boolean }`
- On mount: check `localStorage` for refresh token → call `POST /auth/refresh` silently
- `login(email, password)` → stores access token in React state, refresh token in localStorage, loads user via `/auth/me`, calls `i18n.changeLanguage(user.config.locale)`
- `logout()` → clears state + localStorage
- `refreshToken()` → returns new access token, updates state

**`frontend/src/services/api.ts`**
- Axios instance: `baseURL: "/api/v1"`
- Request interceptor: attach `Authorization: Bearer <token>` + `Accept-Language: <locale>`
- Response interceptor: on 401 → silent refresh → retry once → redirect to `/login` on failure
- Grouped API objects: `authApi`, `projectsApi`, `storiesApi`, `tasksApi`, `commentsApi`, `invitationsApi`, `timeTrackingApi`, `configApi` — each with typed methods mapping to all backend endpoints

---

### Step 4 — Routing & Layout

**`frontend/src/App.tsx`** — BrowserRouter with:
- Public routes: `/login`, `/register`
- Protected routes (inside `<ProtectedRoute>`): `/`, `/projects`, `/projects/:id`, `/projects/:projectId/stories/:storyId`, `/stories/:storyId/tasks/:taskId`, `/invitations`, `/config`
- Wildcard: `*` → NotFoundPage

**`frontend/src/components/layout/ProtectedRoute.tsx`**
- Checks `isAuthenticated` from AuthContext
- Redirects to `/login` with `?next=<current-path>` if false
- Renders `<Outlet />` if authenticated

**`frontend/src/components/layout/NavBar.tsx`**
- Logo links to `/projects`
- Nav links: Projects, Invitations (with pending count badge)
- User menu (name, Settings link, Log out)

---

### Step 5 — Common Components

**`frontend/src/components/common/`**:
- `StatusBadge.tsx` — colored pill using `t("status.{status}")`, color map: to_do→grey, in_progress→blue, in_review→yellow, in_testing→orange, done→green
- `PriorityBadge.tsx` — low→grey, medium→yellow, high→red
- `ConfirmDialog.tsx` — modal with title, body, confirm/cancel; used before delete/archive/revoke
- `LoadMoreButton.tsx` — shows when `next_cursor` is non-null, calls `onLoadMore` callback
- `EmptyState.tsx` — "no items" placeholder with optional icon and message

---

### Step 6 — Custom Hooks

**`frontend/src/hooks/`**:
- `useProjects()` — fetches paginated project list, manages `cursor`, `items`, `hasMore`
- `useStories(projectId: string)` — fetches stories for a project, supports status/priority filters
- `useTasks(storyId: string)` — fetches tasks for a story, supports assignee/status filters
- `usePagination<T>()` — generic cursor pagination: `{ items, cursor, loadMore, isLoading }`
- `useRole(projectId?: string)` — fetches `/projects/{id}/members`, resolves current user's role → returns `{ isManager, canDelete, canInvite }`

---

### Step 7 — Pages

**`frontend/src/pages/LoginPage.tsx`**
- Email + password form; on submit calls `authApi.login`; shows error from API on failure; link to `/register`

**`frontend/src/pages/RegisterPage.tsx`**
- Name + email + password form; calls `authApi.register` then auto-login; navigates to `/projects`

**`frontend/src/pages/ProjectsPage.tsx`**
- Fetches projects with `useProjects()`
- Filter bar: status dropdown, priority dropdown, archived toggle, text search
- Project cards: name, StatusBadge, PriorityBadge, description snippet
- "New project" button (Manager only, via `useRole()`)
- LoadMoreButton when `next_cursor` is present

**`frontend/src/pages/ProjectDetailPage.tsx`**
- Project header: name, status (inline editable select), priority, archive/delete buttons (Manager only)
- Two tabs: **Stories** | **Members**
- Stories tab: story list with status/priority filters, "New story" button
- Members tab: member list with role, "Invite by email" button (Manager only), remove button per member

**`frontend/src/pages/StoryDetailPage.tsx`**
- Story header: title, status select, priority, breadcrumb → project
- Task list with filters (status, priority, assignee)
- "New task" button
- Comment section (CommentList + CommentForm)
- StatusHistoryTimeline at bottom

**`frontend/src/pages/TaskDetailPage.tsx`**
- Task header: title, status select, priority, breadcrumb → story
- Assignee picker (dropdown of project members, nullable)
- Editable description (inline textarea)
- Comment section
- StatusHistoryTimeline with elapsed time per status

**`frontend/src/pages/InvitationsPage.tsx`**
- Fetches `/invitations/mine`
- Lists pending invitations: project name, inviting user, role offered, expiry date
- Accept / Decline buttons per invitation

**`frontend/src/pages/ConfigPage.tsx`** — three tabs:
1. **Profile**: LocaleSwitcher, ThemeSwitcher
2. **API Keys**: ApiKeyList (create key → show raw once in modal, list non-revoked, revoke with confirm)
3. **Security**: password change placeholder (future v2)

**`frontend/src/pages/NotFoundPage.tsx`**
- Simple 404 message + link back to `/projects`

---

### Step 8 — Feature Components

**`frontend/src/components/comments/CommentList.tsx`**
- Fetches comments for given item (`projectId`, `storyId`, or `taskId`)
- Renders author name, localised date, body
- Edit/delete buttons for own comments (delete for Manager on any)

**`frontend/src/components/comments/CommentForm.tsx`**
- Textarea + submit; calls `commentsApi.create`; appends to list on success

**`frontend/src/components/status-history/StatusHistoryTimeline.tsx`**
- Fetches `/status-history` for item
- Vertical timeline: from_status → to_status, changed by name, date, elapsed time using `formatDuration`

**`frontend/src/components/config/LocaleSwitcher.tsx`**
- Dropdown: "English (UK)" | "Polski"
- On change: `PATCH /config {locale}` → `i18n.changeLanguage(locale)`

**`frontend/src/components/config/ThemeSwitcher.tsx`**
- Three-option toggle: light / dark / system
- On change: `PATCH /config {theme}` → applies/removes `dark` class on `<html>`

**`frontend/src/components/config/ApiKeyList.tsx`**
- Fetches `/config/api-keys`
- "Create new key" form: label + scope checkboxes → shows raw key once in modal
- Revoke button with ConfirmDialog per key

---

### Step 9 — Wiring & Polish

- `frontend/src/main.tsx` — wrap app with `AuthContext.Provider`, `I18nextProvider`
- Apply system/user theme preference on `AuthContext` load (add/remove `dark` class to `<html>`)
- Ensure all pages have proper `<title>` via document.title or a `useDocumentTitle` hook
- Add loading spinners where data is being fetched
- Add toast/error messages for failed API calls

---

## Critical Files

| File | Purpose |
|------|---------|
| `frontend/src/services/api.ts` | All API calls + auth interceptors |
| `frontend/src/context/AuthContext.tsx` | Global auth state, token management |
| `frontend/src/App.tsx` | Route definitions |
| `frontend/src/i18n.ts` | i18next configuration |
| `frontend/src/utils/format.ts` | Date/duration formatting with Intl API |
| `frontend/src/components/layout/ProtectedRoute.tsx` | Auth guard |
| `frontend/src/hooks/useRole.ts` | Role-based UI visibility |

---

## Verification Checklist

All items from `dev-plan1.md` Phase 5 testing milestone:
- [ ] `npm run dev` starts Vite on localhost:5173
- [ ] Login form submits, redirects to /projects
- [ ] Wrong credentials show error (no crash)
- [ ] Page refresh restores session via silent token refresh
- [ ] /projects shows paginated list; "Load more" appends (not replaces)
- [ ] Status/priority filters reduce list correctly
- [ ] Locale switcher: change to Polish → page re-renders immediately
- [ ] Polish dates DD.MM.YYYY; numbers use space as thousands separator
- [ ] Polish plural: "1 zadanie", "2 zadania", "5 zadań"
- [ ] Manager sees delete buttons; Contributor does not
- [ ] StatusHistoryTimeline shows chronological list with elapsed time
- [ ] CommentForm submits, comment appears without reload
- [ ] Invite flow: Manager can invite, Contributor cannot see button
- [ ] API key creation: raw key shown once in modal; not on list
- [ ] 401 from any request triggers silent refresh + retry
- [ ] Dark mode toggle applies `dark` class to `<html>`
- [ ] Unknown routes render NotFoundPage
