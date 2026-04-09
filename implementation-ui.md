# Implementation Plan: Frontend (UI)

**Module**: `frontend/`
**Depends on**: API layer (must be running at `/api/v1`)
**Used by**: End users via browser

---

## Overview

The frontend is a React + TypeScript single-page application built with Vite. It is completely decoupled from the backend — all data access goes through the REST API. Key concerns: authentication state management, locale-aware rendering (en-GB / pl), role-based UI visibility, cursor-based pagination, and a minimalist design via Tailwind CSS.

---

## 1. Setup & Scaffolding

### 1.1 Create project
```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
```

### 1.2 Install dependencies
```bash
# Styling
npm install tailwindcss @tailwindcss/vite

# Routing
npm install react-router-dom

# HTTP client
npm install axios

# i18n
npm install i18next react-i18next

# Dev only
npm install -D @types/node
```

### 1.3 Tailwind configuration (`tailwind.config.js`)
```js
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",      // class-based dark mode (controlled by theme setting)
  theme: { extend: {} },
  plugins: [],
}
```

### 1.4 Vite configuration (`vite.config.ts`)
```ts
// Proxy all /api requests to backend in development
server: {
  proxy: {
    "/api": "http://localhost:8000",
  },
},
```

### 1.5 File structure
```
frontend/src/
├── i18n.ts                    # i18next initialisation
├── main.tsx                   # React root, wrap with providers
├── App.tsx                    # Router configuration
├── locales/
│   ├── en-GB.json
│   └── pl.json
├── context/
│   ├── AuthContext.tsx
│   └── LocaleContext.tsx
├── services/
│   └── api.ts                 # Axios instance + all API calls
├── hooks/
│   ├── useProjects.ts
│   ├── useStories.ts
│   ├── useTasks.ts
│   └── usePagination.ts
├── components/
│   ├── layout/
│   │   ├── NavBar.tsx
│   │   └── ProtectedRoute.tsx
│   ├── common/
│   │   ├── StatusBadge.tsx
│   │   ├── PriorityBadge.tsx
│   │   ├── ConfirmDialog.tsx
│   │   ├── LoadMoreButton.tsx
│   │   └── EmptyState.tsx
│   ├── comments/
│   │   ├── CommentList.tsx
│   │   └── CommentForm.tsx
│   ├── status-history/
│   │   └── StatusHistoryTimeline.tsx
│   └── config/
│       ├── LocaleSwitcher.tsx
│       ├── ThemeSwitcher.tsx
│       └── ApiKeyList.tsx
└── pages/
    ├── LoginPage.tsx
    ├── RegisterPage.tsx
    ├── ProjectsPage.tsx
    ├── ProjectDetailPage.tsx
    ├── StoryDetailPage.tsx
    ├── TaskDetailPage.tsx
    ├── InvitationsPage.tsx
    ├── ConfigPage.tsx
    └── NotFoundPage.tsx
```

---

## 2. i18n Setup (`src/i18n.ts`)

```ts
import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import enGB from "./locales/en-GB.json"
import pl from "./locales/pl.json"

i18n.use(initReactI18next).init({
  resources: {
    "en-GB": { translation: enGB },
    pl: { translation: pl },
  },
  lng: "en-GB",           // default, overridden from UserConfig after login
  fallbackLng: "en-GB",
  interpolation: { escapeValue: false },
})

export default i18n
```

### Changing locale at runtime
After login and when UserConfig is loaded:
```ts
i18n.changeLanguage(user.config.locale)
```

### Locale JSON structure (`src/locales/en-GB.json`)
```json
{
  "nav.projects": "Projects",
  "nav.invitations": "Invitations",
  "nav.settings": "Settings",
  "nav.logout": "Log out",

  "projects.title": "Projects",
  "projects.create": "New project",
  "projects.empty": "No projects yet",

  "status.to_do": "To do",
  "status.in_progress": "In progress",
  "status.in_review": "In review",
  "status.in_testing": "In testing",
  "status.done": "Done",

  "priority.low": "Low",
  "priority.medium": "Medium",
  "priority.high": "High",

  "role.manager": "Manager",
  "role.contributor": "Contributor",

  "actions.save": "Save",
  "actions.cancel": "Cancel",
  "actions.delete": "Delete",
  "actions.archive": "Archive",
  "actions.restore": "Restore",
  "actions.confirm": "Are you sure?",
  "actions.load_more": "Load more",

  "tasks.count_one": "{{count}} task",
  "tasks.count_other": "{{count}} tasks",

  "time.seconds": "{{count}}s",
  "time.minutes": "{{count}}m",
  "time.hours": "{{count}}h",
  "time.days": "{{count}}d"
}
```

### `src/locales/pl.json` (Polish)
```json
{
  "nav.projects": "Projekty",
  "nav.invitations": "Zaproszenia",
  "nav.settings": "Ustawienia",
  "nav.logout": "Wyloguj",

  "status.to_do": "Do zrobienia",
  "status.in_progress": "W toku",
  "status.in_review": "W przeglądzie",
  "status.in_testing": "W testach",
  "status.done": "Gotowe",

  "priority.low": "Niski",
  "priority.medium": "Średni",
  "priority.high": "Wysoki",

  "role.manager": "Menedżer",
  "role.contributor": "Współpracownik",

  "tasks.count_one": "{{count}} zadanie",
  "tasks.count_few": "{{count}} zadania",
  "tasks.count_many": "{{count}} zadań",

  "time.seconds": "{{count}}s",
  "time.minutes": "{{count}} min",
  "time.hours": "{{count}} godz.",
  "time.days": "{{count}} dni"
}
```
Note: Polish uses 4 plural forms (`one`, `few`, `many`, `other`). i18next handles this automatically for `pl` locale.

### Date/Number Formatting
Do **not** use i18next for dates and numbers. Use the browser's built-in `Intl` API:
```ts
// In a shared utility: src/utils/format.ts
export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit", month: "2-digit", year: "numeric",
  }).format(new Date(iso))
  // en-GB → "09/04/2026"
  // pl → "09.04.2026"
}

export function formatDuration(seconds: number, t: TFunction): string {
  if (seconds < 60) return t("time.seconds", { count: Math.round(seconds) })
  if (seconds < 3600) return t("time.minutes", { count: Math.round(seconds / 60) })
  if (seconds < 86400) return t("time.hours", { count: Math.round(seconds / 3600) })
  return t("time.days", { count: Math.round(seconds / 86400) })
}
```

---

## 3. Auth Context (`src/context/AuthContext.tsx`)

State:
```ts
interface AuthState {
  user: UserResponse | null
  accessToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
}
```

Actions:
```ts
login(email: string, password: string) -> Promise<void>
  // POST /auth/login → store access token in memory (React state)
  // Store refresh token in localStorage (or httpOnly cookie if server supports it)
  // Load user config: GET /auth/me
  // Change i18n locale to user.config.locale

logout() -> Promise<void>
  // POST /auth/logout
  // Clear state + localStorage

refreshToken() -> Promise<string>
  // POST /auth/refresh with refresh token from localStorage
  // Update access token in state
  // Called automatically by axios interceptor
```

**Token storage decision**:
- Access token: in-memory (React state) — lost on page refresh → triggers silent refresh
- Refresh token: `localStorage` (acceptable for v1; move to httpOnly cookie later)

**On page load**: Check `localStorage` for refresh token → if present, call `POST /auth/refresh` silently to restore session.

---

## 4. API Client (`src/services/api.ts`)

```ts
import axios from "axios"

const api = axios.create({
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
})

// Request interceptor: attach Bearer token
api.interceptors.request.use((config) => {
  const token = getAccessToken()     // from AuthContext
  if (token) config.headers.Authorization = `Bearer ${token}`
  const locale = i18n.language
  config.headers["Accept-Language"] = locale
  return config
})

// Response interceptor: handle 401 → token refresh → retry once
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retried) {
      error.config._retried = true
      const newToken = await refreshToken()
      if (newToken) {
        error.config.headers.Authorization = `Bearer ${newToken}`
        return api(error.config)   // retry
      }
      // Refresh failed → redirect to login
      navigate("/login")
    }
    return Promise.reject(error)
  }
)
```

### Typed API functions (all in `api.ts`)
Group by domain:
```ts
// Auth
export const authApi = {
  login: (email, password) => api.post("/auth/login", { email, password }),
  register: (email, name, password) => api.post("/auth/register", { email, name, password }),
  me: () => api.get<UserResponse>("/auth/me"),
  logout: () => api.post("/auth/logout"),
  refresh: (token) => api.post("/auth/refresh", { refresh_token: token }),
}

// Projects
export const projectsApi = {
  list: (params) => api.get<Paginated<ProjectResponse>>("/projects", { params }),
  create: (data) => api.post<ProjectResponse>("/projects", data),
  get: (id) => api.get<ProjectResponse>(`/projects/${id}`),
  update: (id, data) => api.patch<ProjectResponse>(`/projects/${id}`, data),
  delete: (id) => api.delete(`/projects/${id}`),
  archive: (id) => api.post(`/projects/${id}/archive`),
  restore: (id) => api.post(`/projects/${id}/restore`),
  listMembers: (id) => api.get(`/projects/${id}/members`),
  addMember: (id, data) => api.post(`/projects/${id}/members`, data),
  updateMember: (id, userId, data) => api.patch(`/projects/${id}/members/${userId}`, data),
  removeMember: (id, userId) => api.delete(`/projects/${id}/members/${userId}`),
}

// ... stories, tasks, comments, invitations, timeTracking, config — same pattern
```

---

## 5. Routing (`src/App.tsx`)

```tsx
<BrowserRouter>
  <Routes>
    {/* Public */}
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/invitations/:id/accept" element={<InvitationAcceptPage />} />

    {/* Protected */}
    <Route element={<ProtectedRoute />}>
      <Route path="/" element={<Navigate to="/projects" />} />
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/projects/:id" element={<ProjectDetailPage />} />
      <Route path="/projects/:projectId/stories/:storyId" element={<StoryDetailPage />} />
      <Route path="/stories/:storyId/tasks/:taskId" element={<TaskDetailPage />} />
      <Route path="/invitations" element={<InvitationsPage />} />
      <Route path="/config" element={<ConfigPage />} />
    </Route>

    <Route path="*" element={<NotFoundPage />} />
  </Routes>
</BrowserRouter>
```

`ProtectedRoute` — checks `isAuthenticated`; if false, redirects to `/login` and saves intended URL for post-login redirect.

---

## 6. Pages

### `LoginPage`
- Email + password form
- On submit: `authApi.login` → success → navigate to `/projects`
- Show error message on failure (from API error response)
- Link to `/register`

### `RegisterPage`
- Name + email + password form
- On submit: `authApi.register` → auto-login → navigate to `/projects`

### `ProjectsPage`
- Fetch projects list with cursor pagination
- Filter bar: status dropdown, priority dropdown, archived toggle, text search input
- Project cards: name, status badge, priority badge, description snippet
- "New project" button (visible only to Managers)
- "Load more" button using `next_cursor`

### `ProjectDetailPage`
- Project header: name, status (editable inline), priority, archive/delete buttons (Manager only)
- Two tabs: **Stories** | **Members**
- Stories tab: list with status/priority filters, "New story" button
- Members tab: list of members with role, "Invite" button (Manager only), remove member button

### `StoryDetailPage`
- Story header: title, status (editable), priority, project breadcrumb
- Task list with assignee/status/priority filters
- "New task" button
- Comment section (CommentList + CommentForm)
- Status history timeline (StatusHistoryTimeline)

### `TaskDetailPage`
- Task header: title, status (editable), priority, story breadcrumb
- Assignee picker (search project members)
- Description (editable inline)
- Comment section
- Status history timeline with elapsed time per status

### `InvitationsPage`
- List of pending invitations showing project name, inviter, role offered
- Accept / Decline buttons per invitation

### `ConfigPage`
Three tabs:
1. **Profile**: locale switcher (en-GB / pl), theme switcher (light / dark / system)
2. **API Keys**: list of non-revoked keys (label, scopes, last used); "Create new key" flow; revoke button with confirm dialog
3. **Security**: password change form (future)

### `NotFoundPage`
- Simple 404 message + link back to `/projects`

---

## 7. Shared Components

### `StatusBadge`
```tsx
// Colour mapping per status:
// to_do → grey, in_progress → blue, in_review → yellow,
// in_testing → orange, done → green
<span className={`px-2 py-1 rounded-full text-xs font-medium ${colourClass}`}>
  {t(`status.${status}`)}
</span>
```

### `PriorityBadge`
```tsx
// low → grey, medium → yellow, high → red
```

### `CommentList` + `CommentForm`
- `CommentList`: fetches comments for a given `itemType` + `itemId`; renders list with author name, localised date, edit/delete for own comments
- `CommentForm`: textarea + submit button; calls `commentsApi.create(...)`
- Both share state via a local `useComments` hook that handles CRUD and re-renders

### `StatusHistoryTimeline`
- Fetches `/status-history` for the item
- Displays as a vertical timeline: `from_status → to_status`, changed by, date, elapsed time in that status
- Uses `formatDuration` util for elapsed time display

### `CursorPagination` / `LoadMoreButton`
```tsx
// Receives next_cursor and onLoadMore callback
// Renders a "Load more" button that appends (not replaces) results
// Hidden when next_cursor is null
```

### `ConfirmDialog`
```tsx
// Modal with title, description, confirm button, cancel button
// Used for: delete project, delete story, delete task, revoke API key, remove member
```

### `LocaleSwitcher`
```tsx
// Dropdown: English (UK) | Polski
// On change: PATCH /config {locale: "pl"} → i18n.changeLanguage("pl")
```

### `NavBar`
- Logo / app name (links to `/projects`)
- "Projects" nav link
- "Invitations" nav link (badge with pending count)
- User menu: name, Settings link, Log out

---

## 8. Role-Based UI Visibility

Use a `useRole` hook:
```ts
function useRole(projectId?: string): {
  isManager: boolean
  canDelete: boolean
  canInvite: boolean
}
```
- Fetches project members to determine per-project role
- Falls back to global user role when no project context

Use this to conditionally render buttons:
```tsx
{isManager && <Button onClick={handleDeleteProject}>Delete</Button>}
```

Never rely on client-side role checks for security — that's enforced by the API. Client checks are only for UX (hiding buttons).

---

## 9. Testing Checklist

- [ ] Login form submits and redirects to `/projects`
- [ ] Incorrect credentials shows error message (not crashes)
- [ ] After page refresh, session is restored via silent token refresh
- [ ] `/projects` shows paginated list; "Load more" appends (does not replace)
- [ ] Status filter on `/projects` reduces list correctly
- [ ] Locale switcher: change to Polish → page re-renders in Polish immediately
- [ ] Polish locale: dates show as DD.MM.YYYY; large numbers use space as thousands separator
- [ ] Polish plural: "1 zadanie", "2 zadania", "5 zadań"
- [ ] Manager sees "Delete project" button; Contributor does not
- [ ] StatusHistoryTimeline shows correct chronological list with elapsed time
- [ ] CommentForm submits and comment appears without page reload
- [ ] Invite flow: Manager enters email → invitation created; Contributor does not see invite button
- [ ] API key creation: raw key shown once in modal; not shown on subsequent list view
- [ ] 401 from any API call triggers silent refresh + retry
- [ ] Dark mode toggle applies `dark` class to `<html>`; Tailwind dark: variants apply
- [ ] `NotFoundPage` renders for unknown routes
