# Mobile UI Rework — Tickets

Source: `docs/superpowers/plans/2026-07-26-mobile-ui-rework.md`
Branch: `mobile-ui-rework` (base `925ec0b`)

---

## Ledger

| Ticket | Status | Commits | Review | Minor findings carried forward |
|---|---|---|---|---|
| T01 | ✅ COMPLETE | `2319960`, `f53ff74` | 1 round, APPROVED; 2 Important fixed (pointer media-query support, `act()` warning in the reference test) | `render.tsx` re-exports raw `render`, letting future tests bypass providers |
| T02 | ✅ COMPLETE | `9a08e79`, `9f060dc` | orchestrator-reviewed directly via built-CSS differential vs BASE (stronger than a diff read); 1 Important fixed (duplicate font-size declarations from a redundant `@utility` block) | **Invalid CSS emitted:** `.text-\[Npx\]{color:Npx}` — Tailwind's content scanner picks up the literal `text-[Npx]` from comments at `src/index.css:29` and `src/index.css.test.ts:268`. Inert but invalid. **Fix during T20**, whose subject matter these comments describe. |

| T03 | ✅ COMPLETE | `4fd892b`, `326714b`, `7e87ea9` | orchestrator-reviewed; 1 Important fixed (see below) | none |

| T04 | ✅ COMPLETE | `49b62ce`, `a572862`, `97cd456` | 1 round, CHANGES REQUIRED → fixed → green | (a) `ProjectDetailPage.tsx` now has **two** dropdown implementations — the new shared `Menu` and the older hand-rolled "New" dropdown (~line 697) whose private Escape listener bypasses the shared stack. Consolidate in **T13**, which already touches this file. (b) `Menu.tsx` carries one narrowly-scoped `eslint-disable react-hooks/refs` on the `cloneElement` ref line — justified (the ref is attached at commit time, not read during render) and commented, but re-check if that rule's behaviour changes. |

| T05 | ✅ COMPLETE | `7efac86`, `b4c0487` | 1 round, APPROVED with 1 Important → escalated as a plan contradiction, resolved by human decision, fixed | (a) `useDragSensors.ts`'s comment cannot name `PointerSensor` because the source-lint test greps all of `src/` including comments — the comment is vague as a result ("that other sensor"). Scope the lint to non-comment code. (b) `src/dragTouchSensors.sourceLint.test.ts` sits at `src/` root rather than co-located. (c) `BoardCard` (`ProjectDetailPage.tsx:150`) and `SprintView`'s `SortableTaskRow` also wrap a `<Link>` in drag listeners with **no** `drag-row` — they still have the iOS link-preview problem. **Apply `drag-row` to both in T07**, which already touches them. |

| T06 | ✅ COMPLETE | `9d8bf62`, `79a0200`, `81179ca` | 2 rounds. code-reviewer CHANGES REQUIRED (2 Important, both fixed); browser-reviewer CHANGES REQUIRED (1 Important — **adjudicated out of scope**, see below) | (a) **Every reorder PATCHes all rows, not just moved ones** — browser review measured 4 PATCHes for a single adjacent swap. This is *pre-existing* (the old `handleDrop` did the same); T06's scope was the unhandled rejection, not PATCH-count. Would want a diff-and-PATCH-only-changed-rows fix, or a bulk-reorder endpoint, as its own ticket. (b) `reorder()`'s `if (reordering) return` guard reads React state, so two calls in the same tick could both pass; the disabled buttons are the practical guard. A ref would be airtight. (c) **Live drag never verified** — neither synthetic mouse-drag nor synthetic touch triggers dnd-kit in the automation environment. Needs the device pass. |

| T07 | ✅ COMPLETE | `72df026`, `0f404e3`, `c5cd324`, `9b46681` | 3 rounds. code-reviewer CHANGES REQUIRED (Escape regression); browser-reviewer CHANGES REQUIRED ×2 (4 defects, then 2 still broken); orchestrator diagnosed the last two directly in the browser | (a) **Keyboard Enter/Space activation of the status pill is UNCONFIRMED.** browser-reviewer reported it dead twice; orchestrator could not reproduce — real `Return`/`Escape` presses produced **zero** keydown events on the focused pill (keys never reached the page), and a synthetic Enter through the full React chain returned `defaultPrevented: false`. Evidence says tooling artifact, not defect. **Needs a human/device confirmation.** (b) `Menu` now portals to `body`; its position is recomputed on capture-phase scroll + resize. The flip-above branch and real ancestor-scroll following are unverifiable in jsdom. (c) 375px whole-page layout is still broken (sidebar doesn't collapse, horizontal overflow, heading overlaps Invite) — **pre-existing, and exactly what T12 fixes.** |

| T08 | ✅ COMPLETE | `f4c1431`, `71f4c2b`, `f5111b3`, `6e73876` | 3 rounds. code-reviewer CHANGES REQUIRED ×2 (3 Important, then 1 vacuous test); browser-reviewer APPROVED for desktop scope with mobile unverifiable; orchestrator reviewed the diff directly and measured the box model in-browser | (a) **T08's mobile ACs have no in-browser evidence** — no `ConfirmDialog` trigger is reachable at 375px because the app shell is still desktop-only. **T12 fixes this; re-run a 375px pass on `Modal` after T12.** (b) `useFocusTrap.ts:69` — a topmost trap with **no** focusables returns without `preventDefault()`, so Tab escapes entirely and no lower trap gets a look. Unreachable today; **raise against T12** when `Drawer` adopts the hook. (c) Trap-stack order is **mount order, not z-order** — a `Drawer` and a `Modal` flipped open by one `setState` would stack inner-below-outer and reintroduce the Tab bug, since child effects fire before parent. `useEscapeKey` has shared this since it landed. **T12 prerequisite.** (d) `useFocusTrap.ts:20` hidden-input rejection is case-sensitive (`getAttribute('type') === 'hidden'` misses `type="Hidden"`); `(el as HTMLInputElement).type` is DOM-normalised. (e) `Modal`'s `footer` is a **sibling** of `children`, so a `<form>` in the body cannot own a submit button in the footer without `form="<id>"`. **Decide the pattern in T09** — it affects ~12 overlays across T09/T10/T13/T16. (f) `env(safe-area-inset-bottom)` is inert until `index.html` gains `viewport-fit=cover` — **T19 owns that sweep**. (g) Backdrop right-click dismisses (matches the `CommandPalette.tsx:258` precedent). (h) `ConfirmDialog` title moved `h3`→`h2`, changing the page heading outline. (i) Browser review found T07's portalled `Menu` **does not open at 375px** once the page is horizontally scrolled — pre-existing, likely resolved by T12's shell fix; **re-check after T12**. |

| T09 | ✅ COMPLETE | `a0e00ee`, `5233d01`, `bb9690d` | 2 rounds. code-reviewer CHANGES REQUIRED (3 Important); browser-reviewer APPROVED; orchestrator found a **Critical dark-mode defect** the automated gates both missed, by measuring computed colour in the browser | (a) `Breadcrumbs`' `<nav>` has **no accessible name**, and `AppShell.tsx:164`'s sidebar `<nav>` is also unnamed — a screen-reader landmark list reads "navigation, navigation". Needs a locale key; **follow-up ticket**. (b) No `aria-expanded` on the `…` control (one-way disclosure that removes itself, so defensible). (c) `PageHeader` hardcodes `text-[22px]`/`text-[13px]` and the skeleton's crumb line hardcodes `text-[11.5px]` rather than T02's `--text-ui-*` tokens — **T20's codemod must absorb these**. (d) `PageHeader`'s root is a `<div>`, not `<header>`. (e) The edit overlay now discards an in-progress edit on Escape/backdrop (Modal's T08 canon, matches Cancel semantics). (f) `flex-wrap` on the header row **changes the ≥1024px toolbar layout** — at 1024px ProjectsPage's toolbar now wraps to a second line where it previously squashed. Almost certainly an improvement and unavoidable given the mechanism, but **add 1024px to the browser-review widths** for later tickets. (g) The skeleton's actions placeholder is a fixed `h-9`, so a taller actions cluster still jumps. (h) `/projects` fires `GET /projects?limit=25` **twice** on mount — StrictMode double-effect in dev; **confirm it does not double in production**. |

| T10 | ✅ COMPLETE | `8baca91`, `871f181`, `a84aac8` | 2 rounds. Both gates first died on a usage limit; `code-reviewer` was re-run and returned CHANGES REQUIRED (1 Important + 2 fold-ins), all fixed. **`browser-reviewer` never ran** — the orchestrator did that pass by hand instead (desktop 1280, 375, 320, dark theme, both tablists' ARIA, pill-scroller geometry, 320px overflow with the shell simulated away). | (a) `aria-controls` is set only on the **selected** tab (`Tabs.tsx:146`); APG has every tab point at its panel — defensible while only one panel is in the DOM. (b) The `scrollIntoView` effect also runs on **initial mount**, so a tablist below the fold could scroll the page on load; `nearest` makes it a no-op when already visible. (c) `TAB_CLASSES` hardcodes `text-[12.5px]`/`text-[13px]` — **T20's codemod must absorb these**. (d) `onChange` hands back `string`, so ConfigPage casts (`key as Tab`) — inherent to the API. (e) New file `src/utils/tabId.ts` exists because exporting the id helper from `Tabs.tsx` trips `react-refresh/only-export-components`, which constraint 5 forbids. (f) **AC7 could not be validated end-to-end**: the un-collapsed 240px sidebar leaves ConfigPage only 80px at 320px. With the sidebar hidden to simulate post-T12, `scrollWidth === clientWidth === 320` and there were **zero** unintended overflowers — so AC7 holds for T10's own content, but **re-confirm after T12**. |

**T10 — the finding worth remembering:** the orchestrator caught one real defect the ticket's own tests could not. `Tabs` set `tabIndex={key === value && !disabled ? 0 : -1}`, so if `value` ever named a **disabled** tab — or matched no tab at all — **no** tab carried `tabIndex=0` and the entire tablist lost its tab stop: Tab skipped the whole control and arrows could not rescue it, because arrows only fire on a tab that already has focus. Unreachable in ConfigPage (`api_keys` is statically disabled and `profile` is the default) but **live in T13**, which builds the 6-tab rail on this primitive *with reordering and hiding* — exactly when the selected tab stops being available. Fixed by computing a separate `tabStopKey` that falls back to the first enabled tab, deliberately **without** firing `onChange`: `Tabs` is controlled, and inventing a selection the parent did not ask for would be a worse bug. This is the third time on this branch that a primitive passed its whole spec and still broke on the *second* adopter — audit primitives against the next consumer, not only the current one.

| T11 | ✅ COMPLETE | `ee4cab1`, `714391a` | 1 round. code-reviewer CHANGES REQUIRED (2 Important + 1 escalated for an orchestrator decision), all resolved; the orchestrator ran the browser pass by hand and measured every AC. | (a) `PageHeader`'s `items-end` bottom-aligns the "New task" button against a two-line title block at ≥1024px (~30px drop vs today's `items-start`) — inherent to T09's canonical recipe, **the largest remaining ≥1024px delta**; eyeball it. (b) The story's meta row rides in `PageHeader`'s `subtitle`. HTML is valid (every child is phrasing content — verified, the `<p>` holds only a `<span>` and contains no interactive controls), but the row inherits `text-[13px] text-stone-500` and screen readers announce a control cluster as a paragraph. **A dedicated `meta` slot on `PageHeader` should land before T15 duplicates this shape twice.** (c) Loading→loaded header grows by ~one line because `subtitle` is omitted while loading. (d) The disclosure toggle's tap target is ~24px — **T21**. (e) `StatusHistoryTimeline` refetches on each mobile expand (the panel must leave the tree for a11y, so this is correct, not a bug). (f) Two task-title containers overflow their box by 3px at 375px — **re-measure after T12**, when the column is a real 375px. |

| T12 | ✅ COMPLETE | `7933b8a`, `5df5a67` | 1 round. code-reviewer CHANGES REQUIRED (2 Important, both confirmed by the orchestrator in the browser); browser-reviewer CHANGES REQUIRED (2 Critical — **one disproven as a tooling artifact**, one out of scope); orchestrator measured every AC directly. | (a) `aria-controls` on the hamburger references an id that does not exist while the drawer is closed, since `Drawer` unmounts — standard for `aria-expanded="false"` disclosures and required so the nav is not duplicated in the tab order. Left as-is. (b) **ProjectDetailPage overflows 283px at 375px** (`docScrollW 658` vs `clientW 375`); offenders are that page's own un-migrated tab strip (`pb-2 -mb-px … border-b-2`) and toolbar `<select>`s — **T13's scope**, and it is what made the browser reviewer's AC5 finding look real. Its header also overlaps at 375px. (c) The breakpoint gate is derived (`drawerOpen && !isDesktop`), so `drawerOpen` stays true across a crossing and rotating back to portrait **re-opens** the drawer. Visible state and `aria-expanded` stay consistent throughout; recorded, not fixed. (d) `CommandPalette` does not lock body scroll (pre-existing; `Modal`/`Drawer` do). (e) The sidebar `+` is labelled "New project" but is an `<a href="/projects">` — pre-existing, lifted verbatim. (f) StrictMode double-fires every mount request in dev — pre-existing baseline. |

| T13 | ✅ COMPLETE | `4d08c55`, `2589b68` (a) · `e642531` (b) · `abe0c1e` (c) | **Split a/b/c** per the ticket's own licence, taken up front. (a) code-reviewer CHANGES REQUIRED (1 Important + 8 Minor) + browser-reviewer CHANGES REQUIRED (3 findings, **all three adjudicated pre-existing or unverifiable**), fixed in `2589b68`. (b) **code-reviewer died on a usage limit; orchestrator did that pass by hand.** (c) orchestrator browser pass only. Every AC measured directly at 320/375/1024/1280. | (a) `Menu` emits **no `role="menu"`/`role="menuitem"`** — verified, `Menu.tsx` has no `role=` at all; pre-existing gap in the shared T04 primitive affecting **every** adopter, wants its own ticket. (b) Tab state is not persisted to the URL — `initialTab` reads `?tab=` on mount (`:262`) but `setTab` never writes back, so reload resets to Board and tabs cannot be deep-linked; pre-existing. (c) Switching tabs refetches project-scoped data (`/members` ×6, `/statuses` and `/projects/{id}` ×4 across three switches) — pre-existing, pairs with T06's all-rows-PATCH finding. (d) `idPrefix` is inert: no `panelId`, no `role="tabpanel"`, so six `role="tab"` elements have no associated panel. (e) `PriorityBars` renders a hard-coded English label in every locale, so its accessible name under `pl` won't match the visible text. (f) Unasserted desktop deltas from adopting `PageHeader`: row `gap-4→gap-2`, `items-start→items-end` (~20px actions drop — T11 flagged this as the largest remaining ≥1024px delta), subtitle `mt-1→mt-0.5`, header now `sticky z-10`, two stacked `border-b`. (g) The board *track* keeps `px-7` inside the scroller, so on a phone the board gutter (28px) is wider than the toolbar's (16px). (h) The tab rail sits outside the sticky header and scrolls away — intended; BASE had no sticky header. |

| T14 | ✅ COMPLETE | `952a253`, `1d8e680` | 1 round. code-reviewer CHANGES REQUIRED (1 Important — story title never clamped, **confirmed by orchestrator measurement**: a long title rendered **39px = two line boxes** at 375px against 20px for a short one); browser-reviewer APPROVED but **could not verify drag-to-reorder** and reported AC1 as met — the sandbox simply held no title long enough to wrap. Orchestrator measured every AC directly at 320/375/768/1280 and **proved the drag AC the gate could not**. | (a) **`SortableStoriesTaskRow` now destructures `children` positionally** (`Children.toArray` → `[title, status, priority, count, updated]`, `:242`). All five callers pass unconditional children today, so it is correct — but `Children.toArray` **drops nullish and boolean children**, so the first future `{cond && <Cell/>}` shifts every later cell one column left with no compile error and no warning. Named props would remove the trap. (b) Repo-wide inconsistency: five other files write an explicit `grid-cols-1` base where this one relies on implicit single-column auto-placement (spec-equivalent, but two conventions). (c) The task sub-row's `<a>` wraps title+status+priority+updated, so its accessible name is the whole row's concatenated text — pre-existing, and it forced the new tests onto substring matching. (d) **`code-simplifier` was not run** — the diff is Tailwind class strings plus one wrapper, and the only real simplification candidate is (a), which was deliberately scoped out. (e) StrictMode still double-fires every mount request in dev — pre-existing baseline.

| T15a | ✅ COMPLETE | `93ebbb0`, `14a869d` | **T15 split a/b** (a = TaskDetailPage, b = SprintDetailPage), as T13 was. 1 round. code-reviewer CHANGES REQUIRED (2 Important) — it **proved a false-guard test by mutation**, deleting the meta placeholder block in a throwaway worktree and watching the test still pass; browser-reviewer CHANGES REQUIRED (could not reach the 3-crumb no-story path — no story-less task exists and `CreateTaskModal` cannot create one). Orchestrator measured every AC directly and **found a broken breadcrumb link neither gate caught**. | (a) **`PageHeader` grew from one authorised prop to three.** `meta` was approved up front; `titleEditor` and `onTitleClick` were added unilaterally, then **kept by explicit human decision** once code-reviewer established both reproduce TaskDetailPage's *pre-existing* behaviour exactly (the old code already swapped the `<h1>` out for the `<input>` rather than nesting it, and already had `onClick` on the `<h1>`). Six-plus pages share this component; the additive guarantee was verified in both branches. (b) **`title="Click to edit"` was deliberately not restored** — it was a hardcoded English string (never i18n'd), so restoring it as-is reintroduces a constraint-3 violation and doing it properly costs a fourth prop for a hover-only hint; `cursor-text` plus the hover colour carry the affordance. (c) `TaskDetailPage` had **zero tests** before this ticket; the 26 new ones cover the migration surface only — every mutation handler and error path on the page is still untested. (d) `StoryDetailPage` still routes its status/priority cluster through `subtitle` while TaskDetailPage now uses `meta`, so **two mechanisms exist for one visual pattern** — migrating T11's page closes it. (e) Adopting `CONTAINER_CLASS` changes this page's desktop header padding `pt-5 pb-4` → `pt-5 pb-3` and drops `leading-tight` from the `<h1>` (22px line box **27.5px → 33px**) — the same already-accepted consequence every `PageHeader` adopter took. (f) `code-simplifier` was not run.

| T15b | ✅ COMPLETE | `6a5c7ba`, `3cf0394` | 1 round. code-reviewer **APPROVED** (no Critical/Important) — it independently re-ran the suite against a base-commit worktree to confirm the 10-pass/10-fail RED split, and **mutation-tested three production lines** (both `isManager` gates and the `?tab=sprints` query string) to prove the tests were load-bearing. Its one Minor was a demonstrated coverage gap, fixed in `3cf0394` with its own mutation evidence. Orchestrator measured every AC directly at 375/1280 including a forced-scroll sticky test. | (a) **The rail track widened 280px → 300px at desktop — a signed-off constraint-4 exception.** T15 AC3 requires it and AC6 ("1280px visually unchanged") contradicts it; AC3 governs, matching T11's identical exception for StoryDetailPage (pinned at `StoryDetailPage.detailRail.test.tsx:305-307`, which asserts 300 and explicitly asserts NOT 280). (b) `PageHeader`'s `CONTAINER_CLASS` changes this page's desktop header padding `pb-4` → `md:pb-3` and drops `leading-tight` from the `<h1>` — inherited from T09's recipe, same as every other adopter. (c) The hardcoded English `title="Click to edit"` tooltip was dropped, matching the T15a decision: it was never i18n'd, so restoring it violates constraint 3, and a prop for a hover-only hint is not worth the surface. `cursor-text` plus the hover colour carry the affordance. (d) `code-simplifier` was not run — fourth skipped simplifier stage on this branch.

| T16 | ✅ COMPLETE | `f5bcc23`, `85ea842` | 1 round. **Both gates ran and both returned CHANGES REQUIRED on the same finding** — the desktop dialog silently grew 480px → 512px. code-reviewer additionally **re-verified the orchestrator's two AC adjudications independently** (grepping base and head for any column/snap construct, and mutation-testing the AC2 grid class and the field-reset logic) rather than taking them on trust. `code-simplifier` ran — first time on this branch — and **correctly declined to touch production code**. Orchestrator measured every AC at 320/1280 before and after. | (a) **Desktop dialog width 480px → 512px, a signed-off constraint-4 exception.** `Modal` has three buckets — 384 / 512 / 768 — and none is 480px, so the drift was unavoidable once the migration used the shared component; T13b had already normalised the sibling page's overlays to these same buckets. Human decision: accept 512px rather than fork the primitive with a fourth bucket for one page's historical value. Measured: `max-width: 512px`, +32px, +6.7%. (b) **`handleCreateSprint` has no `catch`** (`:400-415`) — a failed create is an unhandled rejection with **no user-facing error**, unlike `handleDeleteSprint` which toasts. Pre-existing, confirmed present at BASE. The resulting behaviour (dialog stays open, input intact) is correct, but by omission rather than design. Wants its own ticket. (c) The implementer added `id`/`htmlFor` label associations the ticket never asked for, because `getByLabelText` needed them. Judged sound on review — the labels genuinely had none, the `cs-` ids match the codebase's static-id convention, and only one instance can mount — but it is a test driving a production change, the pattern T08 warns about. (d) Sprints-tab load fires `GET /sprints` twice — StrictMode double-invoke, pre-existing baseline.

| T17 | ✅ COMPLETE | `0a5f291`, `1e101c9`, `16a0b6a` | 1 round. code-reviewer **APPROVED** with 1 Important a11y gap; browser-reviewer **CHANGES REQUIRED** with 2 Important. Orchestrator confirmed both browser findings by measurement, **reclassified one as pre-existing and out of scope**, and fixed the rest in `1e101c9` with mutation evidence and emitted-CSS verification. `code-simplifier` ran and made two real behaviour-preserving changes. | (a) **Tooltip is clipped at the viewport edge** — it renders inside the Gantt's `overflow-x-auto` container, so it is cut off near the right edge. **Pre-existing** (the tooltip always lived there; T17 only made it reachable by tap). Per T07's recorded lesson, `transform` cannot rescue an element from a clipping ancestor — the only correct fix is `createPortal` to `document.body` with `position: fixed`, which also means re-solving outside-click and scroll-following. **Wants its own ticket.** (b) **Bars are ~20px tall** (`ROW_HEIGHT - 12`) at every viewport — under the ~44px touch-target guideline, and the 1-day bar is only 12px wide at 375px. Not an AC; **T21 owns tap targets**. (c) The **768–1023px band gets desktop metrics** (24/220), because the hook keys off `useIsMobile`'s 767.98px boundary. The ticket pinned only 375px and 1280px, so this was the implementer's call; both reviewers judged it defensible — it reuses the existing split rather than inventing a third tier. (d) **Enter/Space activation of a bar could not be verified** — synthetic key dispatch does not trigger native button activation, and a control test against an unrelated pre-existing button failed identically. The bars are real `<button type="button">` elements with `onClick`, so native activation follows by construction, but a device pass would confirm it. (e) StrictMode still double-fires the `/timeline` fetch in dev — pre-existing baseline.

| T18 | ✅ COMPLETE | `7d4e28f` | **Neither gate ran** — both `code-reviewer` and `browser-reviewer` were dispatched and both died mid-run on a **monthly spend limit**, so neither produced output. The orchestrator did the code review by hand (Escape stack composition, focus-trap element, body-scroll-lock ref-counting, the flex height cap) and measured **every AC** directly at 375/1280, forcing the one that the sandbox data could not exercise. | (a) **Removing the result list's `max-h-[360px]` changes the desktop palette's height with many results.** Before, the list was capped at 360px so the panel could not exceed ~415px at any viewport; now the *panel* owns the budget at `max-h-[80dvh]`, so at 1280×900 it can reach 720px — roughly 300px taller than before. This is an **intended consequence of AC1 as written** (a panel cap of 80dvh is dead code unless the list's fixed cap goes: 360+54 = 414 < 650 even at 812px), not an implementer error — but it is a real ≥1024px behaviour change and is recorded rather than silent. **Derived structurally from the diff, not measured** — the sandbox has only 3 matching items, far too few to make either cap bind at desktop. (b) `useBodyScrollLock` was added beyond the ACs, closing the gap T12 recorded; verified locking on open and restoring on close. (c) The palette is still **not portalled** and still renders inside `#root` — deliberately unchanged, per T12's examination. (d) `code-simplifier` did not run — the spend limit stopped all subagent dispatch.

| T19 | ✅ COMPLETE | `611f3e6`, `cf35934`, `b8034af` | 1 round. `code-reviewer` **APPROVED** (0 Critical, 0 Important, 4 Minor) and verified the box model, the `env()` pattern and the cascade against the **compiled CSS** rather than the source. `browser-reviewer` returned **CHANGES REQUIRED** on a Critical that the orchestrator measured and **refuted as a tooling artifact** (see below). Orchestrator independently measured every AC in-browser and mutation-checked the simplifier's shared helper. | (a) **The browser gate's Critical was a false positive, and the mechanism is worth knowing.** It reported the mobile top bar and `PageHeader` both scrolling out of view instead of staying pinned, reproduced 3× across themes and viewports. Measurement showed the pane's layout viewport was **1291px tall, not the 375×812 it had requested**, and the page content is exactly 1291px — so `canScroll: false` and `scrollY` stayed `0` even for an explicit `scrollTo(0,400)`. **The document never scrolled**; the screenshots were cropped to 812px of a 1291px non-scrolling page, so the bar left the *screenshot* while never leaving the *viewport*. Sticky correctly never engaged. With a genuinely scrollable document: at scroll 600 the bar holds `top: 0`/`bottom: 48` and the header sits at `top: 48` — **gap 0, flush, AC2 met**. The reviewer was explicit that it had no JS-eval access, could not read a single computed style, and could not find a root cause; it was right to flag rather than pass, but **a screenshot-only gate cannot distinguish 'element unpinned' from 'viewport never scrolled'**. (b) **AC1's literal grep does not return nothing** — `grep -rnE "min-h-screen|h-screen" src/` still matches inside test files (the pre-existing DOM-absence assertion at `AppShell.drawer.test.tsx:364`, plus the lint's own comments). The lint is deliberately scoped to non-test files, because that DOM-absence assertion *must* contain the literal to do its job. Production is genuinely clean; the AC's **wording** is unmet, its **intent** is met. Deliberate deviation, not an oversight. (c) **`MarkdownEditor`'s `maxHeight` still defaults to `'75vh'`** (`MarkdownEditor.tsx:14`), reaching **six** call sites that pass `autoExpand` without an explicit value — wider than the two sites T19 fixed. **CORRECTION (whole-branch review):** this said "mitigated because all six sit inside modals already capped at `max-h-[85dvh]`". **Five are; one is not.** `StoryDetailPage.tsx:446` sits in a hand-rolled `fixed inset-0` overlay (`:434-457`) that never got migrated to `Modal` — no `role="dialog"`, no focus trap, no Escape, no scroll lock, **no max-height and no scroller**. So a 75vh editor plus title, heading and footer overflows a short phone symmetrically off both ends and **Save/Cancel become unreachable** — verbatim the bug T08 exists to fix, still live. The other five (`ProjectsPage:294,:338`, `CreateTaskModal:126`, `ProjectDetailPage:1253,:1348`) are genuinely inside `Modal`. **Not folded in** (scope was extended once, by explicit decision, for the two named sites only). (d) The top bar handles only `env(safe-area-inset-top)`; a phone in **landscape** has non-zero left/right insets and the bar has only fixed `px-2`. `env(safe-area-inset-*)` read across all four insets is only partly true. (e) `NotFoundPage.tsx:7`'s `min-h-[60vh]` and `CommandPalette.tsx:266`'s `pt-[10vh] md:pt-[20vh]` are **deliberate, approved exceptions** — the lint needle is `100vh` specifically so it does not flag them. (f) Three tests are green-by-construction (`topbarToken.coupling.test.tsx`, and the second case in each of `MobileTopBar.test.tsx` / `index.html.test.ts`) — falsifiable, so regression insurance rather than vacuous, but they validate nothing T19 introduced. |

| T20 | ✅ COMPLETE | `80501de`, `5d408ad`, `ebead6f`, `016f58d`, `cb0b78a`, `9482f3d`, `91d66a1`, `7a9fece`, `93ead72`, `5c848c2` | 1 round, both gates **APPROVED**. `code-reviewer`: 1 Important + 2 Minor, none blocking; it re-derived commit purity and bucketing by its own script and **checked out each bucket commit to run the suite**. `browser-reviewer`: 0 findings attributable to T20; denied `javascript_tool`, it **built the pre-T20 commit in a worktree on a second port and did pixel-for-pixel before/after comparison** rather than eyeballing. Orchestrator verified purity programmatically and ran a **differential production build**. | (a) **ORCHESTRATOR ERROR — commits 1-5 are red.** The dispatch told the implementer to stage all four test files with the **first** commit "so the suite is coherent from the start". That was wrong: `CommandPalette.test.tsx` asserts `text-ui-xl`, which does not land until **bucket 6** (`9482f3d`), so `80501de` through `cb0b78a` fail that one test — and `80501de`'s own commit message claims the opposite. `git bisect run npm test` across this window shows five red commits with no defect in them. No shipped-code risk; it weakens the bisectability the nine-commit structure exists to buy. **Not rewritten** — interactive rebase is unavailable in this environment and the branch is unmerged. The implementer independently got the *other* hand-review site right (the 9px avatar test landed with its own substitution). (b) **Three arbitrary rules still ship in the built CSS** — `.text-\[9px\]`, `.text-\[13px\]`, `.text-\[16px\]` — emitted because **Tailwind's content scanner reads test-file prose and assertions**, not production code. The `13px` one traces to `PageHeader.meta.test.tsx:19` (a T15a comment). The implementer's two targeted `@source not` exclusions caught only two of the leaking files. **Follow-up ticket wanted:** a blanket `@source not "**/*.test.{ts,tsx}"` cuts **1,266 bytes (~2.4%)** of dead CSS — measured, not estimated. Correctly rejected *for T20* because it also drops test-only utilities, breaching AC3's "font-size changes only". (c) `src/index.css`'s comment still says **"347 existing sites"**; the real count is **323**. Stale since T02. (d) Two `text-ui-*` classes land on `<input>`s (`CommandPalette.tsx:280`, `ConfigPage.tsx:394`) where T02's unlayered iOS guard forces 16px below 768px — but both are **zero-delta** substitutions (14→14, 13→13), so no new mobile/desktop divergence. (e) A **~5px cumulative vertical page offset** exists at 1280px from many ≤0.5px growths stacking through the header/tabs/filter region — **not** a per-row density change; row heights were pixel-identical pre/post (Board identical, Stories ~51/49/60px, Settings ~77px). (f) `.st-pill`'s hard-coded `font-size: 11px` is plain CSS, not a utility, and is correctly untouched. (g) **`code-simplifier` was deliberately skipped** — 323 mechanical class swaps offer it nothing, and running it would risk churn across 30+ reviewed files. (h) Pre-existing, confirmed by the pre-T20 control build: task-row titles wrap to 3 lines at 375px on `StoryDetailPage`. Not T20's. |

| T21 | ✅ COMPLETE | `1d07c46`, `2f2d125`, `8ebd896`, `fc3f9fb` | 2 rounds. `code-reviewer` **CHANGES REQUIRED** (2 Important, both real, both fixed) → re-review **APPROVED**, verified against the *built* stylesheet with headless Chrome, the real webfont and the `pl` locale. `browser-reviewer` **CHANGES REQUIRED with zero findings** — it had no JS-eval or touch emulation and so could not verify AC1 at all; the orchestrator verified AC1 directly instead. Orchestrator measured every adopter, found 2 in-scope misses before the gates ran, and corrected its own column-width figure. | (a) **The gate caught what the orchestrator's sweep was structurally blind to.** I verified every adopter *reaches* 44px (14 on `/projects`, 21 on project detail, 0 under) — but never whether the surrounding fixed-width grid could *hold* one. The stories table's last column is **80px** and under coarse pointer the cell needs `timestamp + 8 + 96` (Edit 44 + gap 8 + Delete 44) = **122.7–150.2px**, so the buttons bled left into the Tasks column. Bites only at **≥768px with a coarse pointer** (tablet portrait): below `md` T14's grid collapses, and at `pointer: fine` the rule never fires. **Checking that a control hits its target size is a different question from checking that its container still fits it — the second does not follow from the first.** (b) **I sized the fix wrong first.** I picked 140px from a single sampled row whose timestamp was 18.7px. Measuring every string `formatRelative()` can emit gave a worst case of `"100y ago"` at 46.2px → 150.2px required; at 140px the widest timestamp *already present in the sandbox* left **1.1px** of slack. Corrected to 160px (9.8px headroom) in `fc3f9fb`. **One observed row is not a measurement of the worst case.** (c) Fixed via an **unlayered** `@media (pointer: coarse) and (width >= 48rem)` rule on a shared `stories-grid` class applied to **all three** grid sites, so header/story/task rows stay aligned. Both media halves are load-bearing: without the width half the rule would fire below `md` and break T14's mobile cards. `48rem` is exactly Tailwind's compiled `md:` breakpoint. Verified in the built CSS that the rule sits at depth 1 outside `@layer` while `md:grid-cols-[...]` sits inside `@layer utilities` — unlayered wins per the cascade-layers spec, no `!important`. (d) **`ProjectsPage.tsx:181` was skipped** while two byte-identical siblings (`ProjectDetailPage.tsx:710`, `:1159`) got `tap-safe` — the same control at two sizes across sibling pages. Fixed. (e) I found two further in-scope misses **before** dispatching the gates: the members-table row Delete (~16.5px) and the members-tab Invite (~30px). The implementer had done the *stories* table's row actions but not the *members* table's. (f) **Deliberately left out of scope:** the stories-tab sort-direction toggle (`ProjectDetailPage.tsx:~1015`, icon-only `↑`/`↓`, ~30px). A genuine tap-target problem, but not a nav row, tab, row action or modal footer. (g) `.tap-safe` sets `min-width` as well as `min-height`, which is why icon-only controls work — but it also means **a narrow text button in a fixed-width container is where this utility bites**. (h) `formatRelative()` (`src/utils/time.ts`) emits **hard-coded English** (`"5d ago"`, `"just now"`) and never passes through i18next — so the `pl` UI shows English relative times. Pre-existing, outside T21, **worth its own ticket** given global constraint 3. |


**T13 — the finding worth remembering:** a horizontally-overflowing page **silently breaks every fixed-position overlay on it**, and the overlay looks like the bug. T13b's migrated modals measured **658px wide on a 375px screen** on ProjectDetailPage while measuring a correct 375px on `/projects`. Cause: `position: fixed` resolves against the **layout viewport**, which the page's remaining 283px of overflow had expanded — `innerWidth` read **658** there against **375** on the clean page. Nothing was wrong with `Modal`; T13c's overflow fix took the same modal to exactly 375px with no change to overlay code. **Two rules follow.** First, fix horizontal overflow *before* trusting any overlay measurement on that page. Second, **measure against `documentElement.clientWidth`, never `innerWidth`** — `clientWidth` stays at the true visual width (375) while `innerWidth` inflates. Media queries are unaffected: they still evaluate against 375, which is why `sm:grid-cols-2` correctly collapsed to one column even while `innerWidth` reported 658.

**T14 — the finding worth remembering:** the two gates reached **opposite** conclusions on the same acceptance criterion, and both were wrong in instructive ways. `code-reviewer` said AC1's "title on one line" was unmet, reasoning correctly from the CSS that nothing clamps the story title. `browser-reviewer` said it was met — it had *looked*, but the sandbox contained no title long enough to wrap, so it verified a criterion its data could not exercise. Measuring settled it in one call: 39px against a 20px single-line baseline. **A browser gate is only as good as the fixture it runs against — "I saw it work" is not evidence when the input never reached the boundary.** The reviewer's prescribed fix was also wrong: bare `truncate` would have ellipsized long titles at 1280px, where they wrap today, breaking global constraint 4 — the fix had to be `line-clamp-1 md:line-clamp-none`, mobile-scoped, plus `min-w-0` (the link is a *flex item*, so its default `min-width: auto` resolves to min-content and a long unbroken word would otherwise refuse to shrink and never show the ellipsis). **The second lesson is about the drag AC.** `browser-reviewer` could not make dnd-kit fire and reported the AC unverified — correctly noting the same gesture also failed at the untouched 1280px baseline, so it suspected its own tooling. It was right, and the way through was the **keyboard sensor**: focus the row, dispatch `Space` → `ArrowDown` → `Space`. Order went `C,A,B` → `A,C,B`, survived a reload, and repeated at 1280px. **When synthetic pointer events won't drive a drag library, drive its keyboard sensor instead** — it exercises the same `onDragEnd` and persists through the same request, and it is the accessible path a real user needs anyway.

**T15a — the finding worth remembering:** the orchestrator's own browser pass found the only broken thing on the page, and it was **pre-existing code that the ticket had faithfully copied**. The story breadcrumb built its href from the `storyId` **route param**, while `story` itself is fetched from the **task's** `story_id` — two independent sources. Open a task through the project-level route `/projects/:projectId/tasks/:taskId` and the crumb renders `href="/projects/<id>/stories/undefined"`. The same bug fires on the ordinary route after reassigning a task's story, since the param then names the old one. Both gates missed it: `code-reviewer` flagged the crumb rewrite as *the* place a wrong `to=` would hide and still could not see it statically, and `browser-reviewer` never reached that route. **A faithful migration faithfully migrates the bugs — re-derive what the old expression actually referenced instead of preserving it.** 

**T15b — the finding worth remembering:** two of this session's would-be findings were **my own unscoped `document.querySelector`**, not defects. Checking whether `DetailRail` renders before the main column, `querySelector('aside')` returned **AppShell's 240px sidebar** — the first `<aside>` in the document — and reported `railBeforeMain: false`. Scoping to the grid's own children showed the rail *is* the first child, exactly as intended. The same trap had already produced a bogus breadcrumb reading, where `querySelector('nav')` grabbed the sidebar nav and returned the whole navigation tree as "the crumb trail". **On a page inside an app shell, every landmark tag you want (`aside`, `nav`, `header`, `main`) also exists in the shell — always scope the query to the subtree under test before believing the result.** Both misreads pointed at *real-looking* regressions in the exact area under review, which is what makes them dangerous.

**T16 — the finding worth remembering:** **two of the ticket's four acceptance criteria did not survive contact with the code, and measuring first is what revealed it.** AC3 — "sprint columns size to the viewport at 375px with snap scrolling" — describes a layout that **does not exist**: sprints render as a vertical `space-y-3` stack of full-width cards, and `SprintView.tsx` contains no `overflow-x-auto` anywhere. It is a mis-scoped duplicate of T13c's kanban work, which had already landed on the real board in `ProjectDetailPage`. AC4 — "no horizontal body scroll at 320px" — was **already satisfied before the ticket started** (`docOverflowX: 0`, zero offenders, overlay open *and* closed). Had the loop been run against the ticket text alone, one AC would have produced an invented layout and another a change with nothing to fix. **Measure the current state before implementing, not only after** — a plan written weeks ahead describes the code as its author remembered it. Both the RED writer and `code-reviewer` were asked to challenge the ruling and both independently confirmed it.

**T17 — the finding worth remembering:** a shared utility applied to a container **also masks that container's `sticky` descendants**, and that is how T17 nearly shipped the exact defect its own ticket warned about. `scroll-fade-x` (T02's mask, adopted unchanged from T13c's kanban board) makes the first and last 24px transparent. On the board that was correct. On the Gantt the **left 24px is permanently occupied by the pinned title column**, so the mask faded the task titles it was supposed to leave opaque — a transparent sticky column produced by a mask rather than by a background-colour bug, which is why the implementer's careful opaque backgrounds did not prevent it. Measured: sticky column at offset **1px** inside a **24px** transparent zone. The same class was also applied unconditionally, so at 1280px — where the Gantt does **not** overflow (`clientW 990 == scrollW 990`) — it faded a container that never scrolls, breaching constraint 4. Fixed with a new **right-edge-only** sibling utility disabled at `lg`, leaving `.scroll-fade-x` byte-identical for the board. **Before reusing a mask/filter/opacity utility, ask what is pinned or positioned inside the element you are putting it on** — those properties reach descendants that ordinary layout utilities do not.

**T18 — the finding worth remembering:** this is the **third ticket running** where an acceptance criterion could not be proven because the fixture never reached the boundary, and it is now a named technique rather than an observation. T14's title AC passed vacuously because no sandbox title was long enough to wrap; T15b's sticky-header AC was untestable because the page fit the viewport (`docScrollable: false`); T18's `max-h-[80dvh]` never bound because three search results make a 184px panel against a 336px cap. **The fix each time was to move the boundary to the data rather than the data to the boundary** — shrink the viewport until the constraint engages. At 375×200 the cap binds exactly (`cap80dvh: 160`, `panelHeight: 160`), the list scrolls internally (`scrollableBy: 24`), and — the assertion that actually matters — `inputRowPinned: true` proves the search field does not scroll away with the results. An unrealistic viewport is fine when you are testing a *mechanism*; say plainly that you forced it.

**T19 — the finding worth remembering:** an automated gate that can only *look* cannot tell **“the element came unpinned”** from **“the viewport never scrolled.”** The browser reviewer reproduced its Critical three times, across two themes and two viewports, and was still wrong — not through carelessness, but because every one of those reproductions shared the same invisible defect: a pane whose real layout viewport (1291px) silently ignored the 375×812 it was asked for, on a page that happened to be exactly 1291px tall. Three consistent reproductions of the same artifact look exactly like three confirmations of a bug. **The distinguishing measurement is one line** — `document.documentElement.scrollHeight > innerHeight` — and it is the *first* thing to check before believing any scroll-related visual finding. This is the mirror image of T14/T15b/T18's vacuous-AC lesson: there, the fixture never reached the boundary and the AC passed for free; here, the fixture never reached the boundary and the AC *failed* for free. **Both failure modes come from not measuring whether the precondition the test depends on actually held.** The gate was right to escalate rather than pass on a technicality, and it stated its own blindness plainly — that honesty is what made the artifact cheap to find.

**T20 — the finding worth remembering:** when a gate loses the tool it needs, the right move is to **build a control, not to guess**. T19's browser reviewer, denied JS eval, fell back to screenshots and produced a confident false Critical. T20's browser reviewer, denied the same tool, instead checked out the pre-change commit into a worktree, served it on a second port, and compared the two builds pixel-for-pixel at matched viewports — turning "I cannot measure the after" into "I can measure the *difference*", which is what the ticket actually asked about. That is strictly stronger than the `getComputedStyle` reads it was denied, because a single absolute measurement cannot distinguish "13px, as intended" from "13px, and it was always 13px". **The same substitution works for any ticket whose ACs are differential** ("no visual change at 1280px", "built-CSS diff shows font-size changes only"): if you cannot measure the state, measure the delta against a build of the parent commit. The reciprocal lesson is mine — I told the implementer to stage every test with the first commit, which silently made five of the nine commits red; **a nine-commit structure whose value is per-commit greenness needs each test staged with the substitution that satisfies it**, not batched at the front.

**T21 — the finding worth remembering:** *hitting a size* and *fitting a space* are two different checks, and passing the first tells you nothing about the second. I forced `(pointer: coarse)`, measured all 35 adopters across two pages, got "zero under 44px", and concluded AC1 was met. It was — and the feature was still broken, because a 44px button had been dropped into an 80px column. The gate found it by asking the question I hadn't: not "is the control big enough?" but "does the thing around it still work?" **Any change that grows an element needs its container measured too, and a fixed-width ancestor — a grid track, a fixed height, a `w-[...]` — is where to look first.** The corollary bit me twice in one ticket: having accepted the finding, I sized the fix from a single observed row and was 10px short of the real worst case, which only surfaced when I enumerated every string the formatter could produce rather than reading the one on screen. **Sample the extremes, not the instance in front of you.** Both errors share a shape — reasoning from the case I happened to be looking at instead of the case that has to work.

**A second, structural lesson:** the flex height cap only works because `min-h-0` sits on the scrolling child while the input row and divider carry `shrink-0`. A flex child's default `min-height: auto` refuses to shrink below its content, so without `min-h-0` the panel would overflow its own `max-h` instead of scrolling — the same automatic-minimum-size trap that T14 hit on grid items with `min-w-0`. **Whenever a cap is applied to a flex or grid container, the child meant to absorb the overflow needs its automatic minimum size defeated explicitly.**

**And a measurement trap I fell into myself.** My first tooltip check read the DOM **synchronously** after dispatching a click. React had not re-rendered, so every path reported dead and it looked like 15 passing tests were concealing a broken feature. A 150ms wait showed all four transitions working. **A synchronous assertion after a React event is a guaranteed false negative** — the fourth measurement trap on this branch, and the second where my own tooling error impersonated a real defect.

**The second lesson is about where a constraint breach hides.** Adopting a shared primitive silently resized the desktop dialog, and **the orchestrator's own measurement missed it** — the 320px pass showed the sheet variant filling the screen, where all three of `Modal`'s size buckets are indistinguishable. Only the ≥`sm` centred variant reveals the width. **When a component's mobile and desktop variants differ, a mobile-only measurement cannot prove a desktop constraint** — both gates caught what one viewport could not.

**The other lesson is about what a short page cannot prove.** The first 375px pass reported `docScrollable: false` — with two tasks and six rail fields the page fits the viewport, so the sticky-header AC ("the sticky header does not detach") was **untestable on the data present** and would have passed vacuously. Shrinking the viewport to 375×420 forced a 158px scroll range and let the header be measured at four positions, pinned at 48px throughout. **A layout assertion that never reaches its boundary is not evidence** — the same shape as T14, where `browser-reviewer` called the title AC met because no title in the sandbox was long enough to wrap.

**And the tooling lesson that voids a whole class of false findings.** At 1280px the breadcrumb still showed its collapsed `…` form even though `matchMedia('(max-width: 767px)').matches` read `false`. That looks exactly like a broken `useMediaQuery`. It is not: arming a `change` listener and resizing showed **`mqFiredCount: 0`** — this automation's `resize_window` updates `.matches` but **never dispatches the `change` event**, so React is never notified and every JS-media-query-driven UI (`Breadcrumbs` collapse, the `AppShell` drawer, `DetailRail`'s disclosure) freezes at whatever width the page *loaded* at. **Never verify a JS-media-query behaviour by resizing — reload at the target width.** A fresh load at 1280px gave the full four-crumb trail immediately.

**T13 — the measurement lesson (nearly published a false finding):** attributing document overflow by filtering on `getBoundingClientRect().right > viewport` returned **68** "overflowers" on this page, most of them tabs — reading as though T13a's new tab rail had made things worse. But an element inside an `overflow-x: auto` scroller extends past the viewport **by design**; it scrolls rather than pushing the document. Walking each candidate's ancestors and excluding anything inside a scroller cut 68 → **3**, and those three (the board toolbar's filter `<select>`s and a count span) were the real cause, exactly T13c's AC2. **Always exclude scrolled content before attributing document overflow** — and note the same trap bit a second time when `items-center` gave same-line children different `top` values, making a single-row toolbar look wrapped; group by vertical *centre*, not `top`.

**T11 — the finding worth remembering:** the ticket's own acceptance criterion produced a control too narrow to use, and only measurement found it. AC2 asks for the rail's fields "two across" at 375px — but each cell is a `DetailField`, itself `grid grid-cols-[80px_1fr]` with a **fixed 80px label track**, and T02's unlayered iOS-zoom guard forces every `select` to **16px** below 768px. Measured in the browser: rail inner width 335px → cells 160px → label 80px → **select 68px at 16px font**, i.e. about four characters, so "In Progress" rendered as "In P…". Notably the symptom was **truncation, not overflow** (`scrollWidth === clientWidth === 375`), which is why a horizontal-overflow check would have passed it. Fixed by stacking `DetailField` below `lg` (`grid-cols-1 lg:grid-cols-[80px_1fr]`), taking the select from **68px → 160px** while leaving `lg` byte-identical. **The general lesson: a fixed-width track inside a responsive grid is invisible until you multiply it out at the target width — and an unrelated global rule (the 16px zoom guard) can be what tips it over.**

**T12 — the finding worth remembering:** the two overlay primitives disagreed about *where they render*, and nothing in either one's own spec could reveal it. `Modal` and the new `Drawer` both `createPortal` to `document.body`; `CommandPalette` does not — it renders inside `#root`. Both overlays compute `z-index: 50` in the same root stacking context, so **DOM order decides**, and the portalled drawer always paints on top. Opening the palette from inside the drawer (its own full-width "Search…" control, which no test covered) produced **two simultaneous `aria-modal` dialogs** with the palette buried: measured `document.elementFromPoint` at the palette's own top-centre returned an `<a>` belonging to the drawer, so the first tap on a palette row hit a nav link; focus sat in the palette's input while the **drawer** owned Tab as topmost trap; one Escape closed both. **A z-index is only comparable within a stacking context, so "same z-50" tells you nothing once one sibling portals and the other does not** — the portal decision, not the z-index, is the ordering. Fixed by making opening the palette close the drawer, on both the button and the ⌘K paths. Second lesson from the same ticket: **literal compliance with a correct-when-written AC can create the bug.** AC6 said `min-h-screen` becomes `min-h-dvh` on two lines, and it did — but line 135 also had to gain `flex-col` for the new top bar, so below `lg` the 48px header and a `min-height: 100dvh` main **stacked** (`min-height` is a floor and beats `flex-grow`). Measured `scrollHeight 860` vs `clientHeight 812` — exactly the top bar — on *every* phone page. Harmless before T12 only because the root was a flex **row**, where the two `min-h-screen`s overlapped instead of summing. Scoping it to `lg:min-h-dvh` honours the AC's letter and restores `deadScroll: 0`.

**T12 — the environment lesson:** `browser-reviewer` reported as **Critical** that the top bar's search icon does not open the CommandPalette, and that ⌘K was dead too. Both were false. The agent had **no JS evaluation available** (its `playwright-core` install was denied) and was working from screenshots and the a11y tree, and it clicked while on ProjectDetailPage — which overflows 283px horizontally. `sticky top-0` pins **vertically only**, so once the document is scrolled right the header travels with the content and every coordinate click misses; `left_click` by `ref` resolves to a coordinate too, so "clicked by ref" is not an independent check. Verified the button is fine by arming a click counter and clicking at the measured centre: `clicksSeenByButton: 1`, palette opened. **This is the same artifact already recorded against T07's `Menu` ("does not open at 375px once the page is horizontally scrolled") — that finding is now explained and should be considered void.** General rule: a negative click result on a horizontally-overflowing page is worthless; measure `elementFromPoint` at the target's centre before believing a control is dead.

**T11 — the second finding worth remembering:** the rail used `order-1 lg:order-2` and worked *only* because the page also put `order-2 lg:order-1` on the main column — an undocumented, untested obligation that T15 would have silently broken, putting the rail below the entire comment thread. Separately, at `<lg` the rail was painted first but was still **last in the DOM**, so screen-reader and keyboard users traversed the description, task list and every comment before reaching it — the ticket's goal unmet for exactly the users least able to work around it. Both were fixed with one change: **put the rail first in the DOM and give it `lg:order-last`**. Below `lg` no `order` is set anywhere, so DOM order *is* visual order; at `lg`, `order-last` (`order: 9999`) beats the sibling's default `order: 0` regardless of what the adopter does. **Prefer an ordering rule that cannot be broken by a consumer over one that has to be documented.**

**T10 — the second finding worth remembering:** `code-reviewer` caught that adding `focus-ring` to the tab buttons was a **net accessibility regression**. `.focus-ring:focus` (`index.css:191`) sets `outline: none` and paints a 3px `box-shadow` *outside* the border box — but the tablist is `overflow-x-auto` with no padding, and `overflow-x: auto` forces `overflow-y` to `auto` too, so painting clips to the padding box. Measured: `listHeight 31 === tabHeight 31`, `listPadding 0px` — **zero clearance**, so the ring was clipped away almost entirely. Worse, the pre-T10 markup was bare `<button>`s that still had Chrome's default `:focus-visible` outline, so T10 made the tablist a *single* tab stop via roving tabindex and simultaneously removed its visible focus indicator. Fixed with an **inset** outline (`focus:outline-2 focus:-outline-offset-2`) rather than padding the list: outlines do not affect layout, so desktop geometry is provably unchanged, and a negative offset paints inside the border box where overflow cannot reach it. **The general lesson: a `box-shadow` focus ring and an `overflow` scroller are mutually exclusive** — check every scroll container you put focusable children into, and prefer `outline` with a negative `outline-offset` inside one. Two API contracts came out of the same round and bind T13: `items` passed to `Tabs` **must have stable identity** (the scroll-into-view effect now depends on it, so a freshly-built array re-scrolls the strip on every parent render — ConfigPage memoises its arrays), and tab ids now derive from an optional `idPrefix`/`useId()` rather than from `panelId`, because two tablists sharing a `panelId` shared an id namespace and would have collided the moment their key sets overlapped.

**T10 — the environment lesson (costly, do not relearn):** the browser pane's `resize_window` changes the viewport **without dispatching `resize` or `matchMedia` `change` events**. Measured directly: after a resize across the `lg` boundary, `matchMedia('(min-width: 1024px)').matches` had flipped and the CSS had re-evaluated (`flex-direction` went `row`→`column`), yet listener counters showed `mqFired: 0` and `resizeFired: 0`. Consequently **any correctly-written `useMediaQuery` looks stale under this tool** — `Tabs`' `aria-orientation` appeared wrong at 375px and was in fact fine, confirmed by reloading at that width. **Always reload after resizing when verifying responsive behaviour here; never resize-and-observe.** Any past or future "responsive value didn't update" finding made by resizing in this pane is void until re-checked with a reload.

**T09 — the finding worth remembering:** both automated gates passed the ticket, and the defect that mattered most was still live in the running app. `code-reviewer` cannot see rendered colour and `browser-reviewer` ran out of budget before reaching the dark-theme overlay, so the orchestrator caught it only by opening the modal in dark mode and reading `getComputedStyle`. **`AppShell.tsx:135` sets the app's base text colour on a wrapper `<div>`, and `index.css`'s `html, body` rule set font but no `color`** — so anything `createPortal`-ed to `document.body` inherited the user-agent default **black**. The create overlay's name input rendered black-on-`stone-950`: invisible. `ConfirmDialog` had escaped this purely by accident, because every text node in it happens to carry an explicit `dark:` colour class. **The general lesson: portalling changes what a subtree inherits, not just where it paints.** When a codebase sets base typography or colour on an app wrapper rather than on `body`, the first portal is fine only by luck and the second one ships a bug. Fixed systemically — `body { color }` + `.dark body { color }` using the same tokens the utilities emit, so in-shell rendering is byte-identical (verified in both themes: light `oklch(0.216…)`, dark `oklch(0.97…)`, matching the wrapper exactly). Two corollaries worth keeping: a jsdom test **cannot** prove inherited colour, so the regression guard is a built-CSS assertion and says so; and the audit turned up `dark:bg-stone-750` in `MarkdownEditor.tsx` — **`stone-750` is not a Tailwind step**, so the class emitted nothing and the toolbar had been a white strip in dark mode all along, everywhere it was used.

**T08 — the finding worth remembering:** the primitive passed its whole spec twice and was still broken twice, both times in ways only a *composition* question exposed. (1) The first implementation avoided `useId` because a test compared raw `outerHTML` across two mounts — so it hand-rolled a module-level `Set` id allocator, which under `StrictMode` leaks an index on every mount (the double-render calls the `useState` initialiser twice, React keeps one) and mutates module state *during render*. The test was over-specified, not the idiom: **when a test forces you away from the framework's own primitive, suspect the test.** (2) `useFocusTrap` attached a **document-level** listener per active trap, so with a portalled nested modal the outer trap read every inner keystroke as "focus escaped" and yanked focus back — five Tabs gave `["A","A","A","A","A"]` and **middle controls were unreachable entirely**. `useEscapeKey` had already solved exactly this with a topmost-only stack; the trap simply never got one. The general lesson: **a portalled overlay is not a DOM descendant of what opened it, so every `container.contains(activeElement)` check in the codebase is a latent bug the moment two of them coexist** — audit those together, not one primitive at a time. Also worth keeping: the final blocking finding was a *vacuous test* — the one case claiming to cover the new stack's deregistration path never activated the inner trap, and had been reported as red-verified when it was not. Mutation testing (swap `splice` for `pop`, invert the guard) is what finally proved the coverage real.

**T07 — the finding worth remembering:** the menu-clipping bug was misdiagnosed twice before being measured. `Menu`'s panel was `absolute` inside the board's `div.flex-1.overflow-x-auto` column container. The first fix nudged the panel with `translateX` when it escaped the **viewport** — but live measurement showed panel `left: 196` against a clipping ancestor at `left: 240`, so the viewport check never fired (196 ≫ 8). More fundamentally, **`transform` cannot rescue an element from a clipping ancestor** — translating it just slides it under a different part of the same clip rect. The only correct fix is to `createPortal` the panel to `document.body` with `position: fixed`. Two consequences worth remembering: portalling breaks outside-click detection (the panel is no longer a DOM descendant of the trigger's container, so clicking an item reads as an outside click — must be explicitly handled), and it breaks tab order (needed a Tab-forwarding effect). **The general lesson: when a popover renders wrong near an edge, measure the panel rect against its actual clipping ancestor before theorising — and check whether an `overflow` ancestor exists at all, because if it does, no amount of positioning math inside it will work.**

**T06 — the finding worth remembering:** the first fix satisfied all four ACs literally and still had two real defects, both found by asking "what happens when PATCH 3 of 5 fails" and "what if two reorders overlap". (1) `reorder()` captured `previous` in its closure, so an *earlier* batch failing *after* a later batch succeeded would restore the stale snapshot and silently discard the user's successful second reorder. (2) Rolling back client-side after a partial failure **displays an order the server does not have** — PATCHes 1/2/4/5 already committed. Fix: serialize reorders behind an in-flight guard (buttons disabled while pending) and, on failure, call `refresh()` to re-sync from server truth instead of restoring a client-invented "previous". Re-syncing from truth beats a locally-invented rollback whenever the write is non-atomic. Note the existing rollback test kept its user-visible assertion — only its mock mechanism changed.

**T05 — the finding worth remembering:** `code-reviewer` caught that `.drag-handle`'s `touch-action: none`, applied to the *full-width* story row, disables native panning for any touch starting on that row — decided by the browser at `touchstart`, before dnd-kit's 250ms delay can elapse. T05 would have shipped **not meeting its own primary goal** ("sortable lists scroll normally on touch"). This was a genuine contradiction inside the plan: the plan mandated `drag-handle` on story rows, but its *stated reason* was only the `-webkit-touch-callout` rule — `touch-action: none` rode along from bundling. It also contradicts dnd-kit's own guidance (with a `delay` activation constraint, never set `touch-action: none`; the sensor calls `preventDefault()` itself once a drag activates). Human decision: **split the utility.** `.drag-handle` (unchanged, `touch-action: none`) for small grip glyphs where killing scroll is correct; new `.drag-row` (callout + user-select only) for full-row/card draggables that must stay scrollable. T02's `index.css.test.ts` gained a **negative** assertion — `.drag-row` must NOT set `touch-action` — as the regression guard, because this is exactly the kind of thing a later tidy-up would re-merge.

**T04 — the finding worth remembering:** `code-reviewer` empirically demonstrated (via scratch tests) that `Menu` dropped focus to `document.body` on *every* close path, because the content unmounts while holding focus. A keyboard user pressing Escape was dumped at the top of the document. Fixed by restoring focus to the trigger — while deliberately NOT restoring it when the close was caused by clicking another focusable element, so focus follows the user's actual intent. This mattered disproportionately because `Menu` is the foundation T07's board-card status menus reuse.

**T03 — the finding worth remembering:** the implementer flagged `useFocusTrap` needing a `focusin` + `queueMicrotask` capture window. Investigation showed **the test was wrong, not the implementation**: it mounted the trap as a *child* of the component whose effect focused the trigger, and React runs child effects before parent effects, so the trigger wasn't focused yet at activation. Real overlays mount in a later commit, in response to a user action. The test was rewritten to model that; the hook lost 23 lines of machinery that would otherwise have let any outside focus change within one microtask silently redirect the restore target — in the foundation both `Modal` (T08) and `Drawer` (T12) build on.

**Verification notes for T02:** built-CSS diff vs BASE showed 606 → 622 rules, nothing removed, all additions expected. `tap-safe` confirmed correctly wrapped in `@media (pointer:coarse)` — desktop density untouched. `.text-ui-*` utilities emit as `font-size:var(--token)` with zero `line-height`, which is the invariant protecting T20's codemod.

---

## Global constraints

**Copied verbatim into every ticket. Binding on all of them.**

1. **TypeScript is strict in ways that bite generated code.** `tsconfig.app.json` sets `verbatimModuleSyntax: true`, `erasableSyntaxOnly: true`, `noUnusedLocals: true`, `noUnusedParameters: true`. Therefore: type-only imports **must** use `import type { X } from '...'`; no `enum`, no `namespace`, no constructor parameter properties; no unused variables or parameters. `npm run build` runs `tsc -b` and will fail on any of these.
2. **Tailwind v4, default breakpoints.** `lg` (1024px) is the desktop-shell boundary; `md` (768px) is the phone boundary. **Layout is expressed with CSS variants only** — never branch layout on a JS media query. `useMediaQuery` is for behavioural branching only (does a drawer exist, which numeric metric to use).
3. **i18n:** any new user-facing string requires a key in **both** `src/locales/en-GB.json` and `src/locales/pl.json`. The `pl` file legitimately has more keys than `en-GB` (Polish plural forms `_few`/`_many`) — this is correct, do not "fix" it.
4. **Desktop appearance at ≥1024px must not change** unless the ticket explicitly says otherwise. Where a ticket refactors a component used on desktop, assert the desktop class output is unchanged.
5. `npm run lint` and `npm run build` must both pass.
6. **No new runtime dependencies.** New devDependencies only in T01.

### Amendment to constraint 4 (added at branch close)

Constraint 4 said "desktop appearance at ≥1024px must not change." **As written,
the branch does not satisfy it, and could not have.** Nine categories of desktop
change shipped. Most were individually signed off; five were not recorded at the
time. The constraint is therefore restated as an *amendment list*: desktop is
unchanged at ≥1024px **except** for the following, which are accepted.

**Measured directly against `925ec0b` at branch close:**

| # | Change | Before → after | Ticket | Was it recorded? |
|---|---|---|---|---|
| 1 | create-story dialog | 900 → **768px** (−132) | T13b | ❌ no |
| 2 | `CreateTaskModal` | 900 → **768px** (−132) | T13b | ❌ no |
| 3 | invite dialog | 448 → **512px** (+64) | T13b | ❌ no |
| 4 | edit-story dialog | 448 → **512px** (+64) | T13b | ❌ no |
| 5 | create-sprint dialog | 480 → **512px** (+32) | T16 | ✅ human sign-off |
| 6 | `StoryDetailPage` rail | 280 → **300px** (+20) | T11/T15 | ✅ |
| 7 | board scroller | gained `snap-x snap-mandatory` + `scroll-fade-x` | T13c | ❌ no |
| 8 | sidebar `+` link | gained unconditional `inline-flex items-center justify-center` | T21 | ❌ no |

`min-w-[67vw]` was also removed from #1 and #2 — that one **was** an explicit
T13 acceptance criterion, so it is authorised rather than an exception.

`TaskDetailPage` and `SprintDetailPage` also render 300px rails, but those are
**new** adopters with no prior rail; they are not changes.

**Reported by the whole-branch review, not independently re-measured here:**

| # | Change | Ticket |
|---|---|---|
| 9 | `PageHeader` adopters: `pb-4` → `md:pb-3`, and loss of `leading-tight` (22px line box 27.5 → 33px) | T09 |
| 10 | `items-end` drops action clusters ~20–30px on five pages | T13a/T15/T16 |
| 11 | tabs: underline → pill | T10 |
| 12 | toolbars wrap at 1024px | T13c |
| 13 | ~5px cumulative vertical offset on dense pages from many ≤0.5px font growths | T20 |

**Why #1–#4 matter more than their size.** The *identical* class of change in
T16 (#5, a 32px width shift) was flagged CHANGES REQUIRED by **both** gates and
required explicit human sign-off before it could land. T13b's four shipped with
no gate, no measurement and no record — and two of them are four times larger
than the one that needed sign-off. The defect was not the width change; it was
that a usage limit removed the gates and nothing replaced them. **A ticket that
cannot be gated should not be treated as a ticket that does not need gating.**

**The 900 → 768px shrink is the one to revisit first** if any dialog now feels
cramped: `Modal`'s `lg` is `max-w-3xl`, and the two affected dialogs are the
ones with the most form content (create story, create task). Widening means
either changing `SIZE_CLASSES.lg` for every `lg` consumer, or adding an `xl`
step -- prefer the latter.


---

## T01 — Vitest + RTL test harness

**Type:** frontend (route via `dev-loop`, not `dev-frontend-loop` — nothing renders to review)
**Goal:** `npm test` runs, with a provider-aware render helper and a controllable viewport, so every later ticket can write failing tests first.
**Difficulty:** medium
**Depends on:** none

**Acceptance criteria:**
- [ ] `npm test` passes with at least two real tests
- [ ] `renderWithProviders(ui, { route, path, auth })` mounts a component inside the real i18n instance, ThemeProvider, ToastProvider and a MemoryRouter, with no network calls
- [ ] `setViewportWidth(375)` makes `matchMedia('(max-width: 767.98px)').matches` true and notifies registered listeners
- [ ] A plural-aware locale parity test passes: strip `_zero|_one|_two|_few|_many|_other` suffixes, then assert en-GB and pl have identical key sets
- [ ] `npm run lint` and `npm run build` pass

**Files in scope:**
- `package.json` — add devDeps `vitest`, `@vitest/coverage-v8`, `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`, `@testing-library/user-event`; scripts `test`, `test:watch`, `test:coverage`
- `vitest.config.ts` (new) — separate from `vite.config.ts` so tests skip the Tailwind plugin. `environment: 'jsdom'`, `globals: true`, `setupFiles: ['./src/test/setup.ts']`, `css: false`, `restoreMocks`, `clearMocks`
- `tsconfig.app.json` — `types: ["vite/client", "vitest/globals"]`
- `tsconfig.node.json` — **`include` is currently `["vite.config.ts"]`; add `"vitest.config.ts"`** or the new config escapes type-checking
- `eslint.config.js` — block for `src/**/*.{test,spec}.{ts,tsx}` and `src/test/**` with `globals.vitest` and `react-refresh/only-export-components: off`
- `src/test/setup.ts` (new) — `@testing-library/jest-dom/vitest`; a controllable `matchMedia` stub exporting `setViewportWidth(px)`; stubs for `ResizeObserver`, `IntersectionObserver`, `Element.prototype.scrollIntoView`, `HTMLElement.prototype.{has,set,release}PointerCapture`
- `src/test/render.tsx` (new), `src/test/factories.ts` (new) — `makeUser`, `makeProject`, `makeStory`, `makeTask`, `makeProjectStatus`
- `src/context/AuthContext.tsx` — **add `export { AuthContext }` only.** `AuthContext` is a non-exported `const` at line 31 and `AuthProvider` fires network calls on mount, so there is no other way to inject a fake user. Change nothing else in this file.
- `src/components/common/ConfirmDialog.test.tsx`, `src/components/layout/AppShell.test.tsx` (new)

**Constraints:** global constraints 1, 5, 6.
The `matchMedia` stub is load-bearing: jsdom provides none, and `AuthContext.tsx:41` plus `utils/theme.ts:8` already call it, so *every* test rendering through `AuthProvider` crashes without it. It must be installed globally in setup, not per-test.

**Verification:** `npm test`, `npm run lint`, `npm run build`.
**Out of scope:** any component behaviour change; backfilling coverage for existing code.

---

## T02 — Responsive CSS foundation

**Type:** frontend
**Goal:** Design tokens, the iOS zoom guard and shared utilities exist, so no later ticket has to invent them — with no visual change on desktop.
**Difficulty:** medium
**Depends on:** T01

**Acceptance criteria:**
- [ ] Built CSS contains `.text-ui-md{font-size:.8125rem}` **with no `line-height`** in the rule
- [ ] The iOS guard media block appears in built CSS **outside any `@layer`**
- [ ] `drag-handle`, `tap-safe`, `scroll-fade-x` utilities are available
- [ ] Deleting `tailwind.config.js` produces a byte-identical built CSS bundle
- [ ] No call sites change; no visual diff at any width except form-control font size below 768px

**Files in scope:**
- `src/index.css` — the `@theme` block (9 `--text-ui-*` steps + `--spacing-topbar: 3rem`), the unlayered iOS guard, three `@utility` rules
- `tailwind.config.js` — **delete.** Verified inert: `grep -rn "@config" src/` is empty and dark mode works via the `@custom-variant dark` line in `index.css`
- `src/index.css.test.ts` (new) — source assertions

**Constraints:** global 1–6, plus:
- Tokens must be namespaced `--text-ui-*`. Do **not** override Tailwind's `--text-sm` / `--text-xs` / `--text-lg` — those are already used by `MarkdownEditor.tsx`, `ConfirmDialog.tsx` and `ToastContext.tsx` and would shift silently.
- Tokens set **font-size only**. Adding `--text-ui-*--line-height` companions would change vertical rhythm on 347 sites during T22.
- The iOS guard **must be unlayered**. Tailwind v4 emits `@layer theme, base, components, utilities`; a `@layer base` rule loses to `text-[12px]`. Unlayered CSS outranks all layered CSS without `!important`. Exact selector:
  ```css
  @media (max-width: 767.98px) {
    input:not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="range"]):not([type="file"]),
    select, textarea { font-size: 16px; }
  }
  ```
  Excluding `color` is required: `ProjectStatusManager.tsx:83-89` uses an invisible full-size `input[type=color]` overlay.
- If `@utility` with a nested `@media` is unsupported by the installed Tailwind, fall back to a plain unlayered class and confirm by grepping built CSS.

**Verification:** `npm run build`, then grep the emitted CSS for each assertion above. Browser review at 375/768/1280 confirming no layout change.
**Out of scope:** replacing any `text-[Npx]` call site (that is T22).

---

## T03 — useMediaQuery + overlay hooks

**Type:** frontend (route via `dev-loop` — hooks only, nothing renders)
**Goal:** The shared behaviour that `Modal` and `Drawer` both need exists once, so they cannot fork.
**Difficulty:** easy
**Depends on:** T01

**Acceptance criteria:**
- [ ] `useMediaQuery` re-renders its consumer when `setViewportWidth` changes the match
- [ ] `useBodyScrollLock` is ref-counted: with two consumers mounted, unmounting one leaves `body` still locked; unmounting both restores the original overflow **and** any scrollbar-width compensation
- [ ] `useFocusTrap` cycles Tab and Shift+Tab within its container and restores focus to the previously-focused element on unmount
- [ ] `useEscapeKey` fires only for the topmost consumer when several are mounted

**Files in scope:** `src/hooks/useMediaQuery.ts` (exporting `useMediaQuery`, `useIsMobile`, `useIsDesktopShell`), `useFocusTrap.ts`, `useBodyScrollLock.ts`, `useEscapeKey.ts`, plus a test per hook.

**Constraints:** global 1–6. Implement `useMediaQuery` with `useSyncExternalStore` over `window.matchMedia` (React 19) so there is no mount flash.
**Verification:** `npm test`.
**Out of scope:** any consumer of these hooks.

---

## T04 — Make hover-only controls reachable on touch

**Type:** frontend
**Goal:** Archive, delete and row actions can be reached on a phone — they currently cannot be reached at all.
**Difficulty:** medium
**Depends on:** T01

**Acceptance criteria:**
- [ ] With no pointer/hover events, clicking the project overflow button reveals Archive and Delete
- [ ] That menu closes on Escape and on outside click, and sets `aria-haspopup` / `aria-expanded`
- [ ] At 375px, ProjectsPage card actions and ProjectStatusManager row delete are visible without hover
- [ ] At 1280px those actions remain hover-revealed, and are now also reachable by keyboard focus

**Files in scope:**
- `src/components/common/Menu.tsx` (new) — modelled on the **already-correct** click-toggle dropdown at `ProjectDetailPage.tsx:697-722`
- `src/pages/ProjectDetailPage.tsx:723-739` — replace `hidden group-hover:block` with `Menu`
- `src/pages/ProjectsPage.tsx:218` and `src/components/config/ProjectStatusManager.tsx:130` — `opacity-0 group-hover:opacity-100` → `opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100`

**Constraints:** global 1–6.
**Verification:** `npm test`; browser review at 375px with touch emulation confirming both menus operate.
**Out of scope:** the board card status menu (T07).

---

## T05 — dnd-kit touch sensors

**Type:** frontend
**Goal:** Boards and sortable lists scroll normally on touch instead of dragging a card the moment a finger moves.
**Difficulty:** medium
**Depends on:** T02

**Acceptance criteria:**
- [ ] `grep -rn "PointerSensor" src/` returns nothing
- [ ] `useDragSensors()` returns exactly `MouseSensor{distance:5}`, `TouchSensor{delay:250,tolerance:8}`, `KeyboardSensor{sortableKeyboardCoordinates}`
- [ ] Story rows carry `drag-handle` and their `<Link>` has `draggable={false}`
- [ ] Desktop drag behaviour is unchanged (5px threshold preserved)

**Files in scope:** `src/hooks/useDragSensors.ts` (new); `src/pages/ProjectDetailPage.tsx:262` and `:193-194`; `src/pages/SprintView.tsx:304`; `src/components/settings/TabConfigPanel.tsx:100`

**Constraints:** global 1–6, plus:
Use `MouseSensor` + `TouchSensor`. **Do not** add `TouchSensor` alongside `PointerSensor` — `PointerSensor` handles both input types and takes precedence, so the touch activation constraint would never apply. The `drag-handle` utility must include `-webkit-touch-callout: none`, or iOS's link-preview sheet hijacks the long-press on story rows where drag listeners wrap a `<Link>`.

**Verification:** `npm test`; browser review with touch emulation — a vertical swipe over the board scrolls, a 250ms hold starts a drag, a tap on a story row navigates.
**Out of scope:** ProjectStatusManager's HTML5 drag (T06).

---

## T06 — ProjectStatusManager: HTML5 drag → dnd-kit, plus reorder buttons

**Type:** frontend
**Goal:** Project statuses can be reordered on a phone and by keyboard — today they cannot be reordered by touch at all.
**Difficulty:** medium
**Depends on:** T05

**Acceptance criteria:**
- [ ] Reordering works via keyboard (dnd-kit KeyboardSensor) and via per-row ↑/↓ buttons
- [ ] No `draggable` / `onDragStart` / `onDragOver` / `onDrop` props remain in the file
- [ ] A rejected reorder PATCH rolls the list back to its prior order and shows an error toast
- [ ] ↑ is disabled on the first row and ↓ on the last

**Files in scope:** `src/components/config/ProjectStatusManager.tsx` (drag props ~22-35 and 62-67, `handleDrop` at 247-263, list container ~283-285), plus new i18n keys in both locale files.

**Constraints:** global 1–6, plus:
**Fix the verified bug at `ProjectStatusManager.tsx:247-263`:** `handleDrop` issues N parallel PATCHes inside `await Promise.all(...)` with **no try/catch**, so a partial failure is an unhandled rejection that silently leaves inconsistent server-side ordering. Replace with optimistic local state plus rollback and a toast, matching the existing pattern in `TabConfigPanel.tsx`.

**Verification:** `npm test` including a rejected-PATCH rollback test; browser review reordering by touch, keyboard and buttons.
**Out of scope:** restyling the settings page (T10).

---

## T07 — Board card status menu (non-drag fallback)

**Type:** frontend
**Goal:** A task's status can be changed from the board with taps only, so touch users are not dependent on long-press drag.
**Difficulty:** medium
**Depends on:** T04, T05

**Acceptance criteria:**
- [ ] Tapping a board card's status pill opens a menu of the project's statuses; choosing one updates the task
- [ ] The update routes through the **same handler** as `onDragEnd` — no second code path
- [ ] The equivalent works for sprint reassignment on SprintView cards
- [ ] Dragging still works unchanged

**Files in scope:** `src/pages/ProjectDetailPage.tsx` (`BoardCard`), `src/pages/SprintView.tsx` (sprint card), reusing `Menu` from T04.

**Constraints:** global 1–6. Use the app's existing tap-pill-to-edit idiom (`TaskDetailPage.tsx:277`, `StoryDetailPage.tsx:196`) rather than introducing a new control. Do **not** add a `<select>` to every card.
**Verification:** `npm test`; browser review changing status by tap at 375px.
**Out of scope:** board column sizing (T14).

---

## T08 — Modal primitive, adopted by ConfirmDialog

**Type:** frontend
**Goal:** Dialogs stay on screen and are dismissable on a phone — today a tall dialog's submit button is unreachable.
**Difficulty:** hard
**Depends on:** T02, T03

**Acceptance criteria:**
- [ ] Escape closes; focus is trapped inside and restored to the trigger on close; body scroll locks and unlocks correctly when nested
- [ ] A 40-item body scrolls internally while the container stays within `max-h-[85dvh]`
- [ ] At 375px the sheet variant is bottom-anchored with `rounded-t-2xl` and safe-area padding; at 1280px it is a centred dialog
- [ ] `ConfirmDialog`'s public props are unchanged, so its **6 existing call sites need no edit** and all gain the new behaviour
- [ ] `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` wired to the title

**Files in scope:** `src/components/common/Modal.tsx` (new), `src/components/common/ConfirmDialog.tsx` (render `<Modal size="sm">` internally), tests.

**Constraints:** global 1–6, plus:
- The mobile sheet variant is **CSS-only** (`md:` variants). Do not branch on `useMediaQuery`.
- The `size` prop replaces `w-[min(90vw,_900px)] min-w-[67vw]`. **`min-w-[67vw]` is deleted, not made responsive** — it is actively harmful on phones.
- Hand-rolled, not Radix. If more overlay surface later justifies a headless library, that is a separate explicit decision.

**Verification:** `npm test`; browser review of a confirm dialog at 375/768/1280 in both themes.
**Out of scope:** migrating the other 12 inline overlays (their own page tickets).

---

## T09 — PageHeader + Breadcrumbs, adopted by the simple pages

**Type:** frontend
**Goal:** Page headers stop crushing their titles on narrow screens, starting with the three simplest pages.
**Difficulty:** medium
**Depends on:** T02

**Acceptance criteria:**
- [ ] `PageHeader` renders one canonical padding recipe `px-4 pt-4 pb-3 md:px-7 md:pt-5 md:pb-3`, replacing the four drifted combos
- [ ] Its `loading` prop renders a skeleton whose container className is **byte-identical** to the loaded state, so there is no layout jump
- [ ] At 375px the actions cluster wraps onto its own line instead of shrinking the title
- [ ] With 4 crumbs at 375px, `Breadcrumbs` collapses to `first / … / parent / current`, and the `…` expands in place on click
- [ ] SearchResultsPage, InvitationsPage and ProjectsPage use it, with their toolbars wrapping at 375px
- [ ] ProjectsPage's two inline overlays use `Modal`

**Files in scope:** `src/components/layout/PageHeader.tsx` (new), `src/components/common/Breadcrumbs.tsx` (new), `src/pages/SearchResultsPage.tsx`, `src/pages/InvitationsPage.tsx`, `src/pages/ProjectsPage.tsx`, plus `nav.show_all_crumbs` in both locale files.

**Constraints:** global 1–6. Sticky offset must use the `--spacing-topbar` token so the header sits below the mobile top bar added in T12 and flush at `lg`.
**Verification:** `npm test`; browser review of all three pages at 375/768/1280, both themes, no horizontal scroll at 320px.
**Out of scope:** detail pages (T11, T15) and ProjectDetailPage (T14).

---

## T10 — Tabs primitive + ConfigPage responsive rework

**Type:** frontend
**Goal:** Settings becomes usable on a phone — it is currently the worst single offender, with a 200px nav column and no mobile fallback at any width.
**Difficulty:** hard
**Depends on:** T08, T09

**Acceptance criteria:**
- [ ] `Tabs` exposes `role="tablist"` with roving tabindex (Arrow/Home/End move focus) — today these are bare buttons with no tab semantics
- [ ] Changing the active tab scrolls it into view, so an off-screen tab is always reachable
- [ ] `orientation="vertical-lg"` renders a horizontal pill scroller below `lg` and a vertical nav at `lg+`
- [ ] `ConfigPage.tsx:159`'s `flex-1 grid grid-cols-[200px_1fr]` becomes `flex-1 flex flex-col lg:grid lg:grid-cols-[200px_1fr]`
- [ ] Body padding `px-8 py-6` becomes `px-4 py-5 md:px-8 md:py-6`
- [ ] The password-changed overlay at `ConfigPage.tsx:304` uses `Modal`
- [ ] Nothing overflows horizontally at 320px

**Files in scope:** `src/components/common/Tabs.tsx` (new), `src/pages/ConfigPage.tsx` (top tabs at :141, vertical nav at :160, grid at :159, modal at :304).

**Constraints:** global 1–6. Desktop layout at ≥1024px must be visually unchanged.
**Verification:** `npm test`; browser review of both settings sub-tabs at 320/375/768/1280.
**Out of scope:** ProjectDetailPage's 6-tab rail (T14).

---

## T11 — DetailRail primitive + StoryDetailPage

**Type:** frontend
**Goal:** On a phone, a story's status and priority controls are reachable without scrolling past the whole description and comment thread.
**Difficulty:** medium
**Depends on:** T02, T03, T09

**Acceptance criteria:**
- [ ] At 1280px the rendered rail markup and classes match today's `<aside>` exactly (assert on className)
- [ ] At 375px the rail appears **above** the main content, uses `border-b` not `border-l`, and lays its fields two across
- [ ] Status history sits in a second disclosure that is **collapsed by default** on mobile
- [ ] The main column is `overflow-visible lg:overflow-y-auto`, so the mobile page scrolls as one document
- [ ] StoryDetailPage uses `PageHeader` (including its `loading` branch) and `Breadcrumbs`

**Files in scope:** `src/components/common/DetailRail.tsx` (new), `src/pages/StoryDetailPage.tsx` (grid :228, aside :366, loading header :154, breadcrumb :170, modal :412), plus `detail.details` in both locale files.

**Constraints:** global 1–6. Grid becomes `lg:grid-cols-[1fr_300px]` — normalising Story/Sprint's 280px to Task's 300px.
**Verification:** `npm test`; browser review at 375/768/1280.
**Out of scope:** Task and Sprint detail pages (T15).

---

## T12 — Mobile shell: drawer navigation

**Type:** frontend
**Goal:** The 240px sidebar stops consuming 64% of a phone screen; navigation moves into a drawer behind a hamburger.
**Difficulty:** hard
**Depends on:** T03, T08

**Acceptance criteria:**
- [ ] At 375px no `<aside>` renders, and a hamburger with `aria-expanded` / `aria-controls` does
- [ ] Opening the drawer traps focus and locks body scroll; Escape and backdrop tap close it
- [ ] Tapping a project link both navigates **and** closes the drawer
- [ ] At 1280px no hamburger exists and the sidebar is static — appearance unchanged from today
- [ ] The `⌘K` hint is hidden below `lg`; the top bar's search icon opens the CommandPalette
- [ ] `min-h-screen` becomes `min-h-dvh` on `AppShell.tsx` lines 135 and 281

**Files in scope:** `src/components/layout/SidebarNav.tsx` (new — lines 139-276 of AppShell extracted **verbatim** as a presentational component taking `onNavigate`), `Drawer.tsx` (new — left-anchored sibling of `Modal`, reusing the T03 hooks), `MobileTopBar.tsx` (new — `lg:hidden sticky top-0 z-30 h-topbar`), `src/components/layout/AppShell.tsx`, plus `nav.open_menu` in both locale files.

**Constraints:** global 1–6. `AppShell` renders `SidebarNav` twice — once inside `<aside className="hidden lg:flex ...">` and once inside `<Drawer>`. Do not fork the markup. Auto-close on `useLocation().pathname` change.
**Verification:** `npm test`; browser review at 375/768/1280 in both themes; keyboard-only drawer operation.
**Out of scope:** page-level headers (T09).

---

## T13 — ProjectDetailPage: header, tabs, modals, toolbars, board

**Type:** frontend
**Goal:** The main project screen — board, tabs and toolbars — works on a phone.
**Difficulty:** hard
**Depends on:** T08, T09, T10, T12

**Acceptance criteria:**
- [ ] The 6-tab rail scrolls horizontally at 375px with the active tab auto-scrolled into view; the Settings tab is reachable
- [ ] Board and stories toolbars wrap at 375px with nothing clipped (they must, since T02 makes every control 16px there)
- [ ] The kanban snaps one column per swipe with a visible edge fade; `.scroll-hidden` is replaced by `scroll-fade-x`
- [ ] All three inline overlays use `Modal`; `min-w-[67vw]` is gone from `:1162`; `grid-cols-2` at `:1181` becomes `sm:grid-cols-2`
- [ ] Page uses `PageHeader` (including `loading`) and `Breadcrumbs`
- [ ] No horizontal body scroll at 320px

**Files in scope:** `src/pages/ProjectDetailPage.tsx` — header :639-745, tabs :746, board toolbar :776, board :817-869, stories toolbar :909, modals :1161/:1219/:1253.

**Constraints:** global 1–6. Tab reordering/hiding logic (`tabOrder`, `hiddenTabs`) is untouched — `Tabs` receives the already-computed array.
**Verification:** `npm test`; browser review at 320/375/768/1280, both themes.
**Out of scope:** the stories table rows (T14). **If this ticket overruns, split it into (a) header/tabs/breadcrumbs, (b) modals, (c) toolbars/board — in that order.**

---

## T14 — Stories table responsive rows

**Type:** frontend
**Goal:** The stories table stops demanding 400px of fixed columns on a 375px screen.
**Difficulty:** medium
**Depends on:** T05, T13

**Acceptance criteria:**
- [ ] At 375px each story row shows its title on one line and status/priority/count/updated wrapped beneath
- [ ] At `md`+ the rendered grid is **byte-identical** to today's `grid-cols-[1fr_120px_100px_100px_80px]`
- [ ] Drag-to-reorder still works at both widths
- [ ] Task sub-rows get the same treatment

**Files in scope:** `src/pages/ProjectDetailPage.tsx:194` (`SortableStoriesTaskRow`), `:971`, `:982`.

**Constraints:** global 1–6, plus:
Use **one markup tree with `md:contents`**, not two conditional renders — two renders would duplicate the `SortableContext` / `DragOverlay` wiring, which is where bugs live. The mobile wrapper carries `col-span-2 flex flex-wrap ... md:contents` so it vanishes at `md` and its children land back in the grid columns.

**Verification:** `npm test`; browser review at 375/768/1280 including a drag at each.
**Out of scope:** board columns (T13).

---

## T15 — Task and Sprint detail pages

**Type:** frontend
**Goal:** A task's status, priority and assignee are reachable on a phone without scrolling past the description and the entire comment thread.
**Difficulty:** hard
**Depends on:** T11

**Acceptance criteria:**
- [ ] At 375px on TaskDetailPage, status/priority/assignee are visible above the description, with no horizontal scroll
- [ ] Both pages use `DetailRail`, `PageHeader` (including `loading`) and `Breadcrumbs`
- [ ] Both grids are `lg:grid-cols-[1fr_300px]`
- [ ] Main columns are `overflow-visible lg:overflow-y-auto`
- [ ] TaskDetailPage's 4-level breadcrumb collapses at 375px
- [ ] At 1280px both pages are visually unchanged

**Files in scope:** `src/pages/TaskDetailPage.tsx` (grid :311, aside :344, header :223, breadcrumb :224, loading :211), `src/pages/SprintDetailPage.tsx` (grid :143, aside :177, header :110, breadcrumb :111, loading :95).

**Constraints:** global 1–6, plus:
**This is the trickiest layout change in the plan.** Today's `overflow-y-auto` main column inside a `min-h-0` grid, plus a newly sticky header, plus a stacked rail, is three interacting scroll behaviours. Verify there is exactly one scroll container on mobile and that the sticky header does not detach.

**Verification:** `npm test`; browser review at 375/768/1280 in both themes, scrolling a long task with many comments.
**Out of scope:** SprintView (T16).

---

## T16 — SprintView responsive pass

**Type:** frontend
**Goal:** The sprint board and its create-sprint dialog work at phone width.
**Difficulty:** medium
**Depends on:** T05, T08

**Acceptance criteria:**
- [ ] The create/edit overlay at `:547` uses `Modal`
- [ ] `grid-cols-2` at `:563` becomes `sm:grid-cols-2`
- [ ] Sprint columns size to the viewport at 375px with snap scrolling
- [ ] No horizontal body scroll at 320px

**Files in scope:** `src/pages/SprintView.tsx`.
**Constraints:** global 1–6.
**Verification:** `npm test`; browser review at 320/375/768/1280.
**Out of scope:** sprint card status menus (T07).

---

## T17 — TimelineView responsive pass

**Type:** frontend
**Goal:** The Gantt is legible and navigable on a phone, and its tooltip works on touch.
**Difficulty:** medium
**Depends on:** T03

**Acceptance criteria:**
- [ ] At 375px `dayWidth` is 12 and `leftCol` is 120 (assert via `setViewportWidth`); at 1280px they are 24 and 220
- [ ] The left title column is `sticky left-0` and stays visible while the canvas scrolls horizontally
- [ ] Tapping a bar opens its tooltip; tapping elsewhere or pressing Escape closes it
- [ ] Hover-to-open is preserved under `(pointer: fine)`
- [ ] The horizontal scroll container has a visible edge fade

**Files in scope:** `src/pages/TimelineView.tsx` — constants :15-16, container :175-176, bars/rows :180/:210/:220, tooltip :252-253, plus `src/hooks/useTimelineMetrics.ts` (new).

**Constraints:** global 1–6, plus:
This is the one place `useMediaQuery` may drive numbers, because bar positions are computed in JS and CSS cannot rescale them. Layout still uses CSS variants.
**Un-flagged touch bug being fixed here:** the tooltip at `:252-253` is `onMouseEnter`/`onMouseLeave` only, so on touch it either never fires or fires once and sticks.

**Verification:** `npm test`; browser review at 375/768/1280 with touch emulation.
**Out of scope:** building a separate mobile agenda view — deliberately rejected.

---

## T18 — CommandPalette mobile

**Type:** frontend
**Goal:** Search is usable on a phone, where a `pt-[20vh]` offset wastes a fifth of the screen.
**Difficulty:** easy
**Depends on:** T08

**Acceptance criteria:**
- [ ] `pt-[20vh]` becomes `pt-[10vh] md:pt-[20vh]`; panel is `max-h-[80dvh]` with an internally scrolling result list
- [ ] Escape and backdrop tap close it; focus is trapped while open
- [ ] Opens from the T12 top-bar search icon at 375px

**Files in scope:** `src/components/layout/CommandPalette.tsx` (:257, :262).
**Constraints:** global 1–6. Keep its `items-start` positioning — it is not a centred dialog. Reuse the T03 hooks rather than `Modal`'s centring.
**Verification:** `npm test`; browser review at 375/1280.
**Out of scope:** search behaviour or ranking.

---

## T19 — dvh + safe-area sweep

**Type:** frontend
**Goal:** Content stops being clipped by mobile browser chrome and device insets.
**Difficulty:** easy
**Depends on:** T13, T14, T15, T16, T17, T18

**Acceptance criteria:**
- [ ] `grep -rnE "min-h-screen|h-screen" src/` returns nothing, enforced by a source-lint test
- [ ] Drawer footer, mobile sheets and the top bar carry `env(safe-area-inset-*)` padding
- [ ] No visual change at 1280px

**Files in scope:** all remaining `min-h-screen` / `h-screen` sites (10 total, including `LoginPage.tsx:56` and `AppShell.tsx:135,281`), plus a source-lint test.
**Constraints:** global 1–6.
**Verification:** `npm test`; browser review. **Genuine `dvh` and safe-area behaviour cannot be verified in Chrome emulation — flag for a device pass.**
**Out of scope:** font sizes (T20).

---

## T20 — Type-scale codemod

**Type:** frontend
**Goal:** 347 ad-hoc font sizes across 16 values collapse onto the 9-step scale defined in T02.
**Difficulty:** medium
**Depends on:** T19

**Acceptance criteria:**
- [ ] `grep -rE 'text-\[[0-9.]+px\]' src` returns nothing, enforced by a source-lint test
- [ ] The two `text-[16px]` sites (`CommandPalette` clear button, `ConfigPage.tsx:306`) are reviewed by hand — they shrink 1px, every other site moves ≤0.5px
- [ ] The built-CSS diff shows font-size changes only

**Files in scope:** every file containing `text-[Npx]`, plus a source-lint test.
**Constraints:** global 1–6, plus:
Land as **nine commits, one per bucket**, each a pure `sed`, so each commit's risk is a single describable statement ("everything that was 11.5px is now 12px").

**Verification:** `npm test`; `npm run build`; browser review spot-checking three dense screens at 1280px for unintended density change.
**Out of scope:** tap targets (T21).
**Note:** this is the lowest value-per-risk ticket in the plan — it buys consistency, not responsiveness. **Cut it first if the effort runs long.**

---

## T21 — Tap-target pass

**Type:** frontend
**Goal:** Primary controls meet the 44px touch guidance instead of the current ~26–30px.
**Difficulty:** easy
**Depends on:** T20

**Acceptance criteria:**
- [ ] Drawer/sidebar nav rows, the ProjectDetail tab rail, table row actions and modal footer buttons measure ≥44px under `(pointer: coarse)`
- [ ] Desktop density is byte-identical — no `tap-safe` rule applies at `(pointer: fine)`

**Files in scope:** nav rows in `SidebarNav.tsx`, tab rail in `Tabs.tsx`, row actions in `ProjectDetailPage.tsx` / `ProjectsPage.tsx`, `Modal.tsx` footer.
**Constraints:** global 1–6.
**Verification:** `npm test`; browser review measuring hit areas at 375px.
**Out of scope:** anything not listed above.
