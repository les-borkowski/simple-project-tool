# Mobile UI Rework — Implementation Plan

## Context

The frontend of `simple-project-tool` was built desktop-first and never received a mobile pass. The app is unusable on a phone today, and the causes are structural rather than cosmetic.

Measured baseline:

- **9 responsive utility usages** across 43 components. Zero `sm:` utilities anywhere. Zero `@media` rules in `src/index.css`.
- `AppShell.tsx:137` renders a hard `w-[240px]` sidebar with no responsive variant — on a 375px phone that leaves ~135px for content.
- Several features are **functionally unreachable on touch**, not merely ugly: the project overflow menu is `hidden group-hover:block`; status reordering uses native HTML5 drag events that never fire on touch; the kanban's `PointerSensor` hijacks scrolling.
- All 23 form controls are 12–14px, so iOS Safari force-zooms on every field focus.
- There are **no shared layout primitives** — the modal overlay is hand-rolled in 13 places, the page header in 10, with four drifted padding recipes.
- There is **no frontend test infrastructure at all**.

Intended outcome: the app is genuinely usable one-handed on a phone, every feature is reachable by touch, and the repeated layout patterns are consolidated into primitives so mobile bugs are fixed once rather than thirteen times.

### Confirmed decisions

| Decision | Choice |
|---|---|
| Testing | Add Vitest + RTL + jsdom as ticket 1; failing-test-first thereafter |
| Refactor depth | Extract shared primitives first, then migrate pages |
| Mobile nav | Hamburger + slide-over drawer reusing existing sidebar content |
| Scope | All three tiers, including type-scale/tap-target tokenization |

**Ticket 0:** copy this plan to `docs/superpowers/plans/2026-07-26-mobile-ui-rework.md` (project convention) before execution.

---

## Architectural decisions

### Breakpoints and type scale (Tailwind v4)

Use **default Tailwind breakpoints**, no custom ones. Two project rules:
- **`lg` (1024px)** = the desktop-shell breakpoint. Above it: static sidebar, two-column detail pages. Below: drawer, collapsed rails.
- **`md` (768px)** = phone vs. not-phone. Governs tables, modal-vs-sheet, and the iOS font guard.

Type scale goes in `@theme` under a **private `--text-ui-*` namespace**. Namespacing is required: Tailwind's own `text-sm`/`text-xs`/`text-lg` *are* already used (`MarkdownEditor.tsx`, `ConfirmDialog.tsx`, `ToastContext.tsx`) and would silently shift if overridden.

```css
@theme {
  /* Namespaced so Tailwind's own text-sm/xs/lg keep default meaning.
     NOTE: font-size ONLY — no --text-ui-*--line-height companions, or the
     migration silently changes vertical rhythm across 347 sites. */
  --text-ui-2xs: 0.625rem;   /* 10px  <- 9, 9.5, 10        =  10 sites */
  --text-ui-xs:  0.6875rem;  /* 11px  <- 10.5, 11          =  67 sites */
  --text-ui-sm:  0.75rem;    /* 12px  <- 11.5, 12          =  90 sites */
  --text-ui-md:  0.8125rem;  /* 13px  <- 12.5, 13          = 122 sites */
  --text-ui-lg:  0.875rem;   /* 14px  <- 13.5, 14          =  23 sites */
  --text-ui-xl:  0.9375rem;  /* 15px  <- 15, 16            =  18 sites */
  --text-ui-2xl: 1.25rem;    /* 20px                       =   6 sites */
  --text-ui-3xl: 1.375rem;   /* 22px                       =  10 sites */
  --text-ui-4xl: 1.625rem;   /* 26px                       =   1 site  */

  --spacing-topbar: 3rem;    /* generates h-topbar / top-topbar */
}
```

16 ad-hoc values collapse to 9 monotonic steps; every site moves ≤0.5px except the two `text-[16px]` sites (shrink 1px, hand-review those).

**Also delete `frontend/tailwind.config.js`** — verified inert (`grep -rn "@config" src/` returns nothing; dark mode works via the `@custom-variant dark` line in `index.css`). Leaving it invites confusion.

### Global iOS zoom fix

A `@layer base` rule **will not work** — Tailwind v4 emits `@layer theme, base, components, utilities` and utilities always outrank base. The fix must be **unlayered**, since unlayered CSS outranks all layered CSS without `!important`.

In `src/index.css`, after `@import "tailwindcss"`, outside any `@layer`:

```css
/* ── iOS zoom guard ──────────────────────────────────────────────
   iOS Safari force-zooms when a focused control's font-size < 16px.
   Deliberately UNLAYERED: Tailwind v4 puts utilities in @layer utilities,
   and unlayered rules outrank every layered rule, so this beats
   text-[12px] / text-ui-sm without !important.
   Do NOT "fix" this by moving it into @layer base.                  */
@media (max-width: 767.98px) {
  input:not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="range"]):not([type="file"]),
  select,
  textarea { font-size: 16px; }
}
```

Excluding `color` matters specifically: `ProjectStatusManager.tsx:83-89` uses an invisible full-size `input[type=color]` overlay.

**Consequence:** every toolbar control becomes 16px on phones, so toolbars *must* gain `flex-wrap` in the same or an earlier ticket.

### dnd-kit touch strategy

Replace `PointerSensor` with **`MouseSensor` + `TouchSensor`**. Do not add `TouchSensor` alongside `PointerSensor` — `PointerSensor` handles both input types and takes precedence, so touch constraints would never apply.

New `src/hooks/useDragSensors.ts`:

```ts
export function useDragSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
}
```

`distance: 5` preserves today's desktop feel exactly. `delay: 250` means a swipe scrolls and a long-press drags. Plus a `drag-handle` utility (`touch-action: none; -webkit-touch-callout: none; user-select: none`) — the callout rule is required on `SortableStoriesTaskRow` (`ProjectDetailPage.tsx:193-194`) where drag listeners wrap a `<Link>`, or iOS's link-preview sheet hijacks the long-press.

**Non-drag fallback is required**, but not a `<select>` on every card. Make `BoardCard`'s `StatusPill` a button opening a status menu, calling the *same* handler as `onDragEnd` — this mirrors the app's existing tap-pill-to-edit idiom (`TaskDetailPage.tsx:277`, `StoryDetailPage.tsx:196`), so no new visual language.

### Detail-page right rail on mobile

**Disclosure panel rendered ABOVE the main content, open by default.** Not a bottom sheet.

`TaskDetailPage`'s rail is 7 editable fields plus history; people open a task on a phone to change status or assignee. A bottom sheet puts a tap in front of the primary action and nests native iOS `<select>` pickers inside a sheet — reliably janky.

- At `lg+`: renders today's exact aside. Zero desktop change.
- Below `lg`: grid order flip (`rail: order-1 lg:order-2`), `border-b lg:border-b-0 lg:border-l` (also fixes the current dangling `border-l`), fields 2-across.
- Status history in a **second, collapsed-by-default** disclosure.
- Normalise rail width: Story/Sprint use 280px, Task uses 300px → **use 300px everywhere**.
- **Trap to fix in the same ticket:** main columns are `overflow-y-auto` inside a `min-h-0` grid, creating a nested scroll region on mobile. Change to `overflow-visible lg:overflow-y-auto`.

### Primitives to build

Shared behaviour lives in three hooks so `Modal` and `Drawer` don't fork: `useFocusTrap`, `useBodyScrollLock` (ref-counted), `useEscapeKey`.

- **`useMediaQuery`** (`src/hooks/`) — `useSyncExternalStore` over `matchMedia`. **Discipline rule: behavioural branching only, never layout.** Layout is CSS variants.
- **`Modal`** — replaces all 13 overlays. Portal, `role="dialog" aria-modal`, Escape, focus trap + restore, ref-counted scroll lock, fixed header / `overflow-y-auto` body / fixed footer, `max-h-[85dvh]`. Mobile sheet variant via **CSS only**. `size` prop replaces `w-[min(90vw,_900px)] min-w-[67vw]` — **`min-w-[67vw]` is deleted, not made responsive.**
  - *Migration seam:* refactor `ConfirmDialog` to render `<Modal size="sm">` internally first. One file; its 6 existing call sites get max-height, Escape, focus trap and scroll lock with **zero call-site churn**.
- **`PageHeader`** (`src/components/layout/`) — one canonical padding recipe `px-4 pt-4 pb-3 md:px-7 md:pt-5 md:pb-3` replacing four drifted combos. A **`loading` prop** renders the skeleton branch with identical padding — this is the fix for the four out-of-sync skeleton headers (`ProjectDetailPage:626`, `StoryDetailPage:154`, `TaskDetailPage:211`, `SprintDetailPage:95`) that cause layout jump. Title row gains `flex-wrap` so actions wrap instead of crushing the title.
- **`Tabs`** — `role="tablist"` + roving tabindex (currently bare buttons, no tab semantics). Horizontally scrollable with `scroll-fade-x`. **Auto-scrolls the active tab into view** — mandatory, or the always-appended Settings tab is invisible on a phone. `orientation="vertical-lg"` variant is what fixes ConfigPage.
- **`Breadcrumbs`** — `<nav><ol>` with `aria-current`. Below `md` with >3 crumbs, collapse middle to `first / … / parent / current` (drives the `TaskDetailPage:224` 4-level case).
- **`DetailRail`** — per above.
- **`SidebarNav` / `Drawer` / `MobileTopBar`** (`src/components/layout/`).

### TimelineView and the stories table

**Timeline — make the Gantt honest, don't build a second view.** A second mobile rendering doubles the surface area of a tab phone users will skim.

1. Positions are computed in JS, so CSS can't rescale them. `useTimelineMetrics()` returns `{ leftCol: 120, dayWidth: 12 }` below `md`, `{ leftCol: 220, dayWidth: 24 }` above. `LEFT_COL`/`DAY_WIDTH` (`TimelineView.tsx:15-16`) become hook-provided.
2. **Make the left title column `sticky left-0`** — this is the real usability failure today; titles scroll away and bars become anonymous. Bigger win than the width change.
3. **Un-flagged Tier-1 bug:** the tooltip (`TimelineView.tsx:252-253`) is `onMouseEnter`/`onMouseLeave` only — on touch it never fires or sticks. Convert to click-to-open popover, keep hover under `(pointer: fine)`.

**Stories table — one markup tree using `md:contents`, not two renders.** Two renders would duplicate the `SortableContext`/`DragOverlay` wiring, which is where bugs live.

```tsx
<div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-4 py-2.5
                md:grid-cols-[1fr_120px_100px_100px_80px] md:gap-0 md:items-center">
  <div className="min-w-0">{/* title cell, unchanged */}</div>
  <div className="col-span-2 flex flex-wrap items-center gap-2 md:contents">
    {/* status / priority / count / updated */}
  </div>
</div>
```

`display: contents` makes the mobile wrapper vanish at `md`, so cells land back in their grid columns and the desktop table is byte-identical.

**Kanban:** replace `.scroll-hidden` (`index.css:90`) with `scroll-fade-x` + `snap-x snap-mandatory`; columns get `snap-start w-[85vw] max-w-[272px] sm:w-[272px]`.

### Test harness

devDeps: `vitest`, `@vitest/coverage-v8`, `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`, `@testing-library/user-event`.

Separate `vitest.config.ts` (not the `test` key in `vite.config.ts`, so tests don't pay the Tailwind compile cost): `environment: 'jsdom'`, `globals: true`, `setupFiles: ['./src/test/setup.ts']`, `css: false`. Scripts: `test`, `test:watch`, `test:coverage`. Add `"vitest/globals"` to `tsconfig.app.json` `types` (currently `["vite/client"]`) — tests live under `src/`, so `tsc -b` type-checks them, and `noUnusedLocals` is on.

**`src/test/setup.ts` is the load-bearing file.** A controllable `window.matchMedia` stub is the single most important piece: jsdom has none, and `AuthContext.tsx:41` + `utils/theme.ts:8` already call it — so *every* test rendering through `AuthProvider` crashes without it. Export `setViewportWidth(px)` which parses `(max-width: Npx)`/`(min-width: Npx)`, recomputes `matches` and notifies listeners. Also stub `ResizeObserver`, `IntersectionObserver`, `scrollIntoView` (needed by `Tabs`), and `HTMLElement.prototype.{has,set,release}PointerCapture` (needed by dnd-kit + user-event).

**`src/test/render.tsx`** — `renderWithProviders(ui, { route, path, auth })` wrapping in `I18nextProvider` with the **real** `src/i18n.ts` (so tests assert real en-GB strings and a missing key fails), `ThemeProvider`, `ToastProvider`, and `MemoryRouter` + `Route` when `path` is given (pages use `useParams`).

**One production change the harness needs:** `AuthContext` is a non-exported `const` (`AuthContext.tsx:31`) and `AuthProvider` fires network calls on mount, so there's no way to inject a fake user. Add `export { AuthContext }` — a one-line seam, far cleaner than mocking axios in every page test.

**i18n parity guard — must be plural-aware.** Verified counts: en-GB 277 keys, pl 285. The 8 extra are legitimate Polish plural forms (`tasks.count_few`, `toolbar.done_count_many`, …). A naive set-equality test fails on day one. Strip `_zero|_one|_two|_few|_many|_other` suffixes before comparing.

---

## Tickets

Difficulty: **E**asy / **M**edium / **H**ard. `→` = hard dependency.

### Phase 0 — Foundation

**T01 — Vitest + RTL + jsdom harness** (M)
Files: `package.json`, `vitest.config.ts` (new), `tsconfig.app.json`, `eslint.config.js` (test-file block with `globals.vitest`, `react-refresh/only-export-components: off`), `src/test/{setup.ts,render.tsx,factories.ts}` (new), `src/context/AuthContext.tsx` (export seam only), plus `ConfirmDialog.test.tsx` and `AppShell.test.tsx`.
**AC:** `npm test` passes with ≥2 tests; `npm run build` and `npm run lint` still pass; the AppShell test renders with fake auth and mocked `services/api` (no network); `setViewportWidth(375)` flips a `(max-width: 767.98px)` result and fires listeners; plural-aware locale parity test passes.

**T02 — Responsive CSS foundation** (M) → T01
Files: `src/index.css`, delete `tailwind.config.js`, new source-assertion test.
The `@theme` block, the unlayered iOS guard, and `@utility drag-handle | tap-safe | scroll-fade-x`. **Zero call-site changes**; except the iOS guard, zero visual diff.
**AC:** built CSS contains `.text-ui-md{font-size:.8125rem}` with **no** `line-height`; the iOS media block exists outside any `@layer`; byte-compare built CSS before/after deleting the config file shows no change.
*If `@utility` + nested `@media` isn't supported by the installed version, fall back to a plain unlayered class and confirm by grepping built CSS.*

**T03 — `useMediaQuery` + overlay hooks** (E) → T01
`useMediaQuery`, `useFocusTrap`, `useBodyScrollLock`, `useEscapeKey` (+ tests).
**AC:** `useMediaQuery` re-renders on `setViewportWidth`; scroll lock is ref-counted (two consumers, unmount one, `body` stays locked); focus trap cycles Tab/Shift+Tab and restores focus on unmount.

*T02 ‖ T03.*

### Phase 1 — Touch-broken bugs (ship early; independent of primitives)

**T04 — Hover-only reveals → touch-reachable** (M) → T01
Files: `ProjectDetailPage.tsx:723-739`, `ProjectsPage.tsx:218`, `ProjectStatusManager.tsx:130`.
Extract a small `Menu` modelled on the **already-correct** "New" dropdown at `ProjectDetailPage.tsx:697-722`. For the two `opacity-0 group-hover:opacity-100` cases use `opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100` — always visible on phones, hover-revealed *and now keyboard-reachable* on desktop.
**AC:** with no pointer events at all, clicking the overflow button reveals Archive and Delete; Escape and outside-click close; at 375px the ProjectsPage card actions are visible without hover.

**T05 — dnd-kit touch sensors** (M) → T02
Files: `useDragSensors.ts` (new), `ProjectDetailPage.tsx:262` + `:193-194`, `SprintView.tsx:304`, `TabConfigPanel.tsx:100`.
**AC:** `grep -rn "PointerSensor" src/` returns nothing; on device a vertical swipe over the board scrolls, a 250ms hold picks a card up, a tap on a story row navigates.

**T06 — ProjectStatusManager: HTML5 DnD → dnd-kit + ↑/↓ buttons** (M) → T05
Delete `draggable`/`onDragStart`/`onDragOver`/`onDrop` and the two ref cursors; wrap in `DndContext`/`SortableContext`. Add ↑/↓ buttons per row — for a ~5-item settings list they beat long-press and give a keyboard/AT path free.
**Also fix the verified bug at `ProjectStatusManager.tsx:247-263`:** `handleDrop` fires N parallel PATCHes inside `await Promise.all(...)` with **no try/catch**, so a partial failure is an unhandled rejection that silently leaves inconsistent orders. Add optimistic state + rollback + toast, matching `TabConfigPanel`'s existing pattern.
**AC:** reorder works via keyboard and ↑/↓; a rejected PATCH rolls back and toasts; new i18n keys in **both** locale files.

**T07 — Board card status menu (non-drag fallback)** (M) → T04, T05
**AC:** a task's status can be changed from the board with taps only, routed through the same handler as `onDragEnd`. Same for sprint reassignment in `SprintView`.

*T04 ‖ T05. T05 → T06 → T07 sequential.*

### Phase 2 — Primitives

**T08 — `Modal` + `ConfirmDialog` refactor** (H) → T02, T03
**T09 — `Breadcrumbs` + `PageHeader`** (M) → T02
**T10 — `Tabs`** (M) → T02
**T11 — `DetailRail`** (M) → T02, T03

All four **parallelise** — four independent new files, **no page migrations** (that's what makes them independently shippable).

- **T08 AC:** Escape closes; focus trapped and restored; body scroll locks/unlocks including nested; a 40-item body scrolls internally while the container stays ≤85dvh; at 375px the sheet is bottom-anchored; `ConfirmDialog`'s public props unchanged so its 6 call sites need no edit.
- **T09 AC:** `loading` renders a skeleton with byte-identical padding classes to the loaded state (assert on className); actions wrap below the title at 375px; 4 crumbs collapse at 375px and expand on click.
- **T10 AC:** Arrow/Home/End move focus within the tablist; changing `value` calls `scrollIntoView`; `vertical-lg` renders a pill scroller at 375px and a vertical nav at 1280px.
- **T11 AC:** at 1280px classes match today's aside exactly (regression-lock via className assertion); at 375px the rail precedes main content, uses `border-b`, lays fields 2-across, `secondary` starts collapsed.

**T12 — Mobile shell: SidebarNav + Drawer + MobileTopBar** (H) → T03, T08
Extract `AppShell.tsx:139-276` **verbatim** into a presentational `SidebarNav({ onNavigate })`; `AppShell` renders it twice — inside `<aside className="hidden lg:flex ...">` and inside `<Drawer>`. Auto-close on `useLocation().pathname` change. `MobileTopBar` (`lg:hidden sticky top-0 z-30 h-topbar`) holds hamburger + workspace name + search icon opening the CommandPalette. Hide the `⌘K` hint below `lg`. `min-h-screen` → `min-h-dvh` on lines 135 and 281.
**AC:** at 375px no `<aside>` renders and a hamburger with `aria-expanded`/`aria-controls` does; opening traps focus and locks scroll; Escape and backdrop-tap close; clicking a project link navigates **and** closes; at 1280px no hamburger and the sidebar is static.

### Phase 3 — Page migrations

One page per ticket; conflicts confined to each file.

| # | Ticket | Diff | Deps |
|---|---|---|---|
| **T13** | ProjectsPage + InvitationsPage + SearchResultsPage → PageHeader/Modal; toolbar wrap | M | T08, T09 |
| **T14** | ProjectDetailPage: PageHeader + Tabs + Breadcrumbs + 3 modals + toolbars + kanban snap | H | T08–T10, T12 |
| **T15** | Story/Task/Sprint detail: PageHeader + Breadcrumbs + DetailRail + Modal | H | T08, T09, T11 |
| **T16** | Stories table `md:contents` responsive rows | M | T05, T14 |
| **T17** | SprintView: Modal, `grid-cols-2` → `sm:grid-cols-2`, column widths | M | T08, T05 |
| **T18** | TimelineView: responsive metrics, sticky left column, tap tooltip, scroll fade | M | T03 |
| **T19** | ConfigPage responsive rework (worst single offender) | M | T08–T10 |
| **T20** | CommandPalette mobile (`pt-[10vh] md:pt-[20vh]`, `max-h-[80dvh]`) | E | T08 |

Selected AC:
- **T14:** the 6-tab rail scrolls at 375px with the active tab auto-scrolled in and Settings reachable; both toolbars wrap; kanban snaps one column per swipe; `min-w-[67vw]` gone from `:1162`; all three inline overlays are `Modal`; `grid-cols-2` at `:1181` → `sm:grid-cols-2`.
- **T15:** all three grids `lg:grid-cols-[1fr_300px]`; at 375px on TaskDetailPage status/priority/assignee are visible above the description with no horizontal scroll; main column `overflow-visible lg:overflow-y-auto`; loading branch goes through `PageHeader loading`.
- **T19:** `flex-1 grid grid-cols-[200px_1fr]` (`ConfigPage.tsx:159`, verified — no mobile fallback) → `flex-1 flex flex-col lg:grid lg:grid-cols-[200px_1fr]`, 3-item nav as a horizontal pill scroller below `lg`; body `px-8 py-6` → `px-4 py-5 md:px-8 md:py-6`; nothing overflows at 320px.
- **T18:** at 375px `dayWidth` is 12 and `leftCol` 120 (assert via `setViewportWidth`); title column stays fixed while the canvas scrolls; tapping a bar opens the tooltip, tapping elsewhere closes it.

*T13 ‖ T17 ‖ T18 ‖ T19 ‖ T20.*

### Phase 4 — Mechanical sweeps (LAST, strictly in order)

**T21 — `min-h-screen`/`h-screen` → `dvh` + safe-area insets** (E) → all of Phase 3
**AC:** grep returns zero, enforced by a source-lint test; `env(safe-area-inset-bottom)` padding on drawer footer, mobile sheets, top bar.

**T22 — Type-scale codemod: 347 `text-[Npx]` → `text-ui-*`** (M) → T21
Nine commits, **one per bucket**, each a pure `sed`, so each commit's risk is one describable statement. Guardrail: a source-lint test asserting zero matches of `/text-\[[\d.]+px\]/`.
**AC:** grep returns zero; the two `text-[16px]` sites hand-reviewed; built-CSS diff shows only font-size changes.

**T23 — Tap-target pass: apply `tap-safe`** (E) → T22
**AC:** nav rows, tab rail, row actions and modal footer buttons measure ≥44px under `(pointer: coarse)`; desktop density byte-identical.

---

## Ordering

**Critical path:** T01 → T02/T03 → T08 → T12 → T14 → T16 → T21 → T22 → T23.

**Parallel:** T02‖T03 · T04‖T05 · T08‖T09‖T10‖T11 · T13‖T17‖T18‖T19‖T20.

**Strictly sequential:** T05→T06→T07 · T14→T16 (same file, large diff) · T21→T22→T23 (whole-tree sweeps; overlapping guarantees conflicts) · all of Phase 3 before Phase 4.

---

## Verification

**Per ticket (dev-frontend-loop):** `npm test` (failing-test-first), then `npm run lint`, then `npm run build` (`tsc -b` type-checks tests too).

**Browser review gate** — `browser-reviewer` drives the running app via `npm run dev`:
- Widths **375 / 768 / 1280**; light and dark.
- Zero console errors, zero failed network calls.
- **No horizontal body scroll at 320px** on every page.
- Keyboard: Tab reaches every action; Escape closes overlays; focus visible.

**Whole-branch, end-to-end on a phone-sized viewport:** log in → open drawer → navigate to a project → switch all 6 tabs → drag a card *and* change status via the tap menu → open a task, change status and assignee from the rail → add a comment → reorder statuses in Config via both drag and ↑/↓ → open and submit a create-task modal.

**Cannot be verified in this loop — needs a real iOS Simulator or device:**
jsdom evaluates no cascade or media queries, and **Chrome device emulation does not reproduce iOS zoom-on-focus**, `dvh` toolbar behaviour, or safe-area insets. T02, T21 and T08's sheet variant need a device pass or explicit acceptance on the strength of the CSS. State this in the tickets rather than letting a green suite imply coverage.

---

## Risks

1. **T22 is the lowest value-per-risk item here.** It buys consistency, not responsiveness — no user feels it. Ship last; be willing to cut entirely. If cut, still land T02's tokens so new code converges.
2. **T14 restructures a 1303-line file in one ticket** — most likely to blow its estimate. If it slips, split into (a) header/breadcrumbs/tabs, (b) modals, (c) toolbars/kanban. Don't split T14/T16 differently; they touch overlapping regions.
3. **Hand-rolled primitives vs Radix.** Recommending hand-rolled: 43-component app, three primitives, and adding a headless-UI dependency mid-rework changes the architecture on the way past. If more overlay/menu/combobox surface is expected, Radix is defensible — **decide explicitly in T08, don't drift into it in T14.**
4. **Nested scroll containers in T15** are the trickiest change: today's `overflow-y-auto` main column inside a `min-h-0` grid, plus a newly sticky header, plus a stacked rail = three interacting scroll behaviours. Budget extra review.
5. **~7,300 lines of untested UI today.** This plan adds tests for new and touched code only. Do **not** backfill whole-app coverage here — separate initiative.
6. **Every string-adding ticket touches both `en-GB.json` and `pl.json`.** New keys: `nav.open_menu`, `nav.show_all_crumbs`, `detail.details`, plus two in T06.
