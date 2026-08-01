# Mobile UI Rework — Session Handoff

**Written:** 2026-07-27 · **Branch:** `mobile-ui-rework` · **Tree:** clean

---

## Start here

```
Continue the mobile UI rework in this repo. Branch: mobile-ui-rework.

Plan:    docs/superpowers/plans/2026-07-26-mobile-ui-rework.md
Tickets: docs/superpowers/plans/2026-07-26-mobile-ui-rework-tickets.md  <- read this first
Handoff: docs/superpowers/plans/2026-07-26-mobile-ui-rework-HANDOFF.md  <- and this

ALL TICKETS T01-T21 ARE COMPLETE (T15 was split a/b, T13 a/b/c; all done).
What remains is NOT a ticket: run the final whole-branch review on the
strongest available model (full 925ec0b..HEAD diff + the plan + the carried
Minor findings below), then superpowers:finishing-a-development-branch.

Use /plan-implementer. Route each ticket per its Type field: frontend ->
dev-frontend-loop. Copy the "Global constraints" section verbatim into
every dispatch.
```

**Read the tickets file's Ledger table first.** Every completed ticket has a
"the finding worth remembering" note under it. Those notes are the real
handoff — this file is just the operational wrapper.

---

## State

| Ticket | Status | Commits |
|---|---|---|
| T01–T07 | ✅ complete (earlier sessions) | see ledger |
| T08 Modal primitive | ✅ complete | `f4c1431`, `71f4c2b`, `f5111b3`, `6e73876` |
| T09 PageHeader + Breadcrumbs | ✅ complete | `a0e00ee`, `5233d01`, `bb9690d` |
| T10 Tabs + ConfigPage | ✅ complete | `8baca91`, `871f181`, `a84aac8` |
| T11 DetailRail + StoryDetailPage | ✅ complete | `ee4cab1`, `714391a` |
| T12 Mobile shell: drawer nav | ✅ complete | `7933b8a`, `5df5a67` |
| T13 ProjectDetailPage | ✅ complete — split a/b/c | `4d08c55`, `2589b68`, `e642531`, `abe0c1e` |
| T14 Stories table responsive rows | ✅ complete | `952a253`, `1d8e680` |
| T15a TaskDetailPage + PageHeader `meta` | ✅ complete | `93ebbb0`, `14a869d` |
| T15b SprintDetailPage | ✅ complete | `6a5c7ba`, `3cf0394` |
| T16 SprintView responsive pass | ✅ complete | `f5bcc23`, `85ea842` |
| T17 TimelineView responsive pass | ✅ complete | `0a5f291`, `1e101c9`, `16a0b6a` |
| T18 CommandPalette mobile | ✅ complete | `7d4e28f` |

**T13 was split**, using the licence in the ticket itself ("If this ticket
overruns, split it into (a) header/tabs/breadcrumbs, (b) modals, (c)
toolbars/board — in that order"). Taken up front rather than after an overrun:
six ACs across a 1354-line file produce a diff neither gate can scrutinise.

| Sub-ticket | Status | Commits |
|---|---|---|
| T13a header / breadcrumbs / tabs | ✅ complete | `4d08c55`, `2589b68` |
| T13b modals (3 inline + `CreateTaskModal`) | ✅ complete | `e642531` |
| T13c toolbars / board / 320px | ✅ complete | `abe0c1e` |

| T19 dvh + safe-area sweep | ✅ complete | `611f3e6`, `cf35934`, `b8034af` |
| T20 type-scale codemod | ✅ complete | `80501de`..`5c848c2` (10 commits) |
| T21 tap-target pass | ✅ complete | `1d07c46`, `2f2d125`, `8ebd896`, `fc3f9fb` |

**No tickets remain.** Next step is the final whole-branch review, then
`superpowers:finishing-a-development-branch`.

**Suite 686/686 (59 files), lint at the 24-problem baseline, build clean.**

**T21's lesson, because it will recur:** *hitting a size* and *fitting a
space* are different checks. Forcing `(pointer: coarse)` and measuring all 35
`tap-safe` adopters gave "zero under 44px" — and the feature was still broken,
because a 44px button sat in an 80px grid column. Any change that GROWS an
element needs its container measured too; fixed-width ancestors (grid tracks,
fixed heights, `w-[...]`) are where to look first.

**T20's mapping is documented in `docs/type-scale.md`** -- the 16-value -> 9-token
table, the two 1px moves, and the two Tailwind traps. **This matters because the
branch is squash-merged:** the ten per-bucket commit messages WERE the record of
what mapped to what, and squashing destroys them. Read that file before touching
font sizes.

**T20 left commits 1-5 RED (moot after squash merge).** The four T20 test files were all staged with the
first bucket commit, but `CommandPalette.test.tsx` only passes from bucket 6
(`9482f3d`). `git bisect run npm test` across `80501de..cb0b78a` will show five
false failures. Orchestrator error, recorded not rewritten. **If you build a
multi-commit codemod again, stage each test with the substitution that
satisfies it, not all at the front.**

**Follow-up ticket wanted: stop Tailwind scanning test files.** Its content
scanner reads test prose and assertions, so test-only utilities -- and even
`text-[Npx]` written inside a *comment* -- leak into the production stylesheet.
Three such dead rules ship today. A blanket `@source not "**/*.test.{ts,tsx}"`
cuts **1,266 bytes (~2.4%)**, measured. It was correctly rejected inside T20
because it also drops non-font-size rules, breaching that ticket's AC3.

**A THIRD review pass is now owed.** T18's `code-reviewer` AND `browser-reviewer`
both died mid-run on a **monthly spend limit**, so neither produced output. The
orchestrator reviewed `7d4e28f` by hand and measured every AC in the browser, but
no automated gate saw it. Owed reviews are now `e642531` (T13b), `abe0c1e` (T13c)
and `7d4e28f` (T18).

**T19 landed `viewport-fit=cover`, so the safe-area padding in `Drawer` and
`Modal` is now LIVE** on notched devices where it was previously inert. It is
still 0px in every desktop browser and in Chrome emulation, so nothing about it
has actually been observed running — see the device-pass list below.

**Do not trust a screenshot-only browser finding about scrolling.** T19's
`browser-reviewer` reported a Critical (top bar and `PageHeader` losing their
sticky pin), reproduced 3× across themes and viewports. It was an artifact: the
pane's real layout viewport was 1291px, not the 375×812 it requested, and the
page was exactly 1291px tall, so **the document never scrolled at all** and
sticky correctly never engaged. Check
`document.documentElement.scrollHeight > innerHeight` **first**, before
believing any scroll-related visual finding.

**Follow-up ticket wanted: consolidate the test suite's boilerplate.** The
branch added 14,311 lines of tests (65 files, 686 cases, 827 assertions)
against a net +3,303 production lines. The volume is mostly not padding --
71.8% is code, 11.7% comments -- but ~1,050 lines are mechanical duplication
that can be removed **without touching a single assertion**:

| duplication | blocks | lines | fix |
|---|---|---|---|
| `vi.mock('../services/api', ...)` setup | 27 | 508 | one shared `mockApi()` |
| inline `const member: MemberResponse = {...}` fixtures | 18 | 466 | `src/test/factories.ts` -- **already exists** |
| per-file recursive `readdirSync` walkers in source-lint tests | 5 | ~120 | one shared walker |

The root cause is structural, not sloppiness: **each ticket's
`frontend-test-writer` started cold** and could not know what earlier tickets
had built. `src/test/factories.ts` has 6 factories and is imported by only
**25 of 65** test files; the other 40 hand-rolled fixtures. The same dynamic
produced `dvhRootRecipe.ts`, `pageHeaderRecipe.ts` and `tapSafeRecipe.ts` as
three separate late inventions of one idea.

**Do NOT loosen the exact-className assertions.** There are only **5, all in
`AppShell.drawer.test.tsx`** -- far fewer than the T20 breakage suggested (of
the 6 assertions T20 broke, only 3 were that pattern). They pin the sidebar,
the most-reused component on the branch, and they are what makes global
constraint 4 enforceable rather than aspirational.

**The separate, higher-value half: a mutation-testing pass.** Of 827
assertions, ~49% are source-lint (they prove a string is absent, not that the
app works) and only ~37.5% are behavioural. This branch found three vacuous
ACs (T14, T15b, T18) one at a time, each by accident. Mutating systematically
-- revert a production line, confirm something goes red -- would find
survivors in one pass.

**Two process changes worth more than the cleanup:** give the test-writer an
explicit inventory of existing helpers in every dispatch and require it to
justify not reusing them; and make "this test fails when line X is reverted"
part of the RED report rather than an afterthought.

**New follow-up ticket wanted: portal the Gantt tooltip.** It renders inside
`TimelineView`'s `overflow-x-auto` container, so it is clipped near the viewport
edge. Pre-existing, but T17 made it reachable by tap so it surfaces far more
often. Per T07's lesson, positioning math inside a clipping ancestor cannot fix
this — it needs `createPortal` to `document.body` plus re-solved outside-click
and scroll-following.

**Check the ticket against the code before implementing it.** T16 shipped with
**two of its four ACs invalid**: one described a sprint-column snap-scrolling
layout that does not exist (no `overflow-x-auto` anywhere in `SprintView.tsx`),
and one was already satisfied before the ticket began. The remaining tickets were
written at the same time, so expect the same. Measure first, then dispatch.

**T15 was split a/b**, as T13 was, and both halves are done — the two detail pages
are now on the same pattern (`PageHeader` / `Breadcrumbs` / `DetailRail`).

**Two follow-ups T15 created, neither scheduled:**
1. `StoryDetailPage` still routes its status/priority cluster through `subtitle`
   while `TaskDetailPage` now uses the `meta` slot — **two mechanisms for one
   visual pattern**. Migrating T11's page closes it.
2. ~~`T19` owns `viewport-fit=cover`~~ -- **DONE**, landed in `611f3e6`.
   `env(safe-area-inset-*)` in `Drawer` and `Modal` is now live on notched
   devices, though still unobserved (see the device-pass list).

(Suite/lint/build totals are stated once, near the top of this section. Earlier
copies of this paragraph carried stale counts from T18 and T20; do not re-add
them here -- update the one at the top instead.)

**How to drive a dnd-kit drag when synthetic pointer events won't fire** (this
cost `browser-reviewer` a whole review on T14, and blocked T06's AC too). Use the
keyboard sensor instead — focus the `.drag-row`, then dispatch `Space`,
`ArrowDown`, `Space`:

```js
const row = document.querySelectorAll('.drag-row')[0]; row.focus();
const k = (t, key, code) => new KeyboardEvent(t, {key, code, bubbles: true, cancelable: true});
row.dispatchEvent(k('keydown', ' ', 'Space'));
await new Promise(r => setTimeout(r, 120));
document.dispatchEvent(k('keydown', 'ArrowDown', 'ArrowDown'));
await new Promise(r => setTimeout(r, 120));
document.dispatchEvent(k('keydown', ' ', 'Space'));
```

It runs the same `onDragEnd`, fires the same PATCHes, and persists through a
reload — verified on T14 at both 375px and 1280px. It is also the accessible
path a real keyboard user needs, so it is worth exercising regardless.

**Never verify a JS-media-query behaviour by resizing — reload at the target
width.** `resize_window` updates `matchMedia(...).matches` but **never dispatches
the `change` event** (proved on T15a: armed a listener, resized 1280→375,
`mqFiredCount: 0` while `.matches` flipped to `true`). React is therefore never
notified, and every `useMediaQuery`-driven UI — `Breadcrumbs`' collapse, the
`AppShell` drawer, `DetailRail`'s disclosure — stays frozen at whatever width the
page *loaded* at. This looks exactly like a broken hook and is not one. It is
almost certainly what produced T07's long-carried "`Menu` does not open at 375px"
and any similar report.

**ProjectDetailPage's horizontal overflow is CLOSED.** Measured after T13c:
`docOverflow: 0` and **zero** real overflowers at both **375px and 320px**, on the
Board *and* Stories tabs. `innerWidth` is back to the true viewport width. The
board scroller now computes `scroll-snap-type: x mandatory` with the
`scroll-fade-x` mask, and columns `scroll-snap-align: start`.

**Constraint 4 holds at the 1024px boundary** — the concern T09 raised when
`flex-wrap` changed ProjectsPage's toolbar there. Measured on the board toolbar
at 1024px: all five children share vertical centre 187, `barHeight: 53`
(32px control + 20px padding + border) — **single row, not wrapped**. Note that
`items-center` gives same-line children different `top` values, so group by
vertical **centre** when checking this; grouping by `top` falsely reports a wrap.

**T13c's `code-reviewer` never ran either** (T13b's died on a usage limit and the
budget was kept for the work). The orchestrator verified every AC by direct
browser measurement at 320/375/1024/1280, and the diff is class-only changes to
one file guarded by 26 tests including desktop assertions at both 1024 and 1280.
**A formal pass on `e642531` and `abe0c1e` remains cheap insurance.**

**T13b's `code-reviewer` never ran** — it died on a session usage limit before
producing output. The orchestrator did that pass by hand instead and found no
blocking issues: both private Escape listeners are gone (`ProjectDetailPage`
`:321-334` and `CreateTaskModal` `:71-77`), `closeCreateStory` resets all four
story fields on every close path (`onClose`, Cancel, successful submit), invite's
non-reset-on-cancel matches BASE exactly, `editStory`'s `open={editStory !== null}`
plus body guard has no null-deref window, `tsc` is clean so the removals left no
unused locals, and focus lands on `INPUT[Title]` confirming the dropped
`autoFocus` was genuinely redundant. **A formal pass would still be cheap
insurance.**

### T13c must re-verify T13b's overlays

`position: fixed` sizes against the **layout viewport**, which a horizontally
overflowing page expands. ProjectDetailPage is still 283px over, so `innerWidth`
reads **658** there against **375** on `/projects`, and every `fixed inset-0`
overlay on it currently renders **658px wide on a 375px screen**, running off the
edge. Not a T13b defect — it resolves when T13c removes the overflow. **Re-measure
the four overlays on ProjectDetailPage once T13c lands**; today they can only be
proven on a clean page. General rule: measure against
`documentElement.clientWidth` (stays at the true 375), never `innerWidth` (inflates).
Media queries are unaffected — they still evaluate against 375.

**Two human decisions were taken during T13a — carry them forward.**
1. `PageHeader` gained an additive **`titleAdornment`** slot so the `<h1>` keeps
   text only while the status/priority controls render beside it. Passing them
   through `title` would have put `<button>`s inside the heading; `subtitle`
   would have moved them below it and broken constraint 4. **T15 should use this
   slot** rather than repeating T11's meta-row-in-`subtitle` shape.
2. The desktop tab styling changes **underline → pill**. This is a *signed-off
   constraint-4 exception*: ConfigPage already shipped the pill style in T10, so
   this unifies the app on one tab language rather than leaving two.

**`CreateTaskModal.tsx` was folded into T13b by decision** — it is an
un-migrated overlay reachable from this page that **no ticket owned** (T16
covers SprintView, not this).

**Why it stopped:** T12 was the last of the batch the previous session was asked
to run (T08–T12).

**The phone shell now works, so deferred visual checks are finally possible.**
At 375px the sidebar is `display:none`, the hamburger opens a 280px drawer, and
`/projects` measures `scrollWidth === clientWidth === 375` with `deadScroll: 0`.
Still owed, and now unblocked:

- **T08:** re-run a 375px pass on `Modal` / `ConfirmDialog` — its mobile ACs
  still have no in-browser evidence.
- **T11:** re-screenshot StoryDetailPage's stacked rail at a real 375px, and
  re-measure the two task-title containers that overflowed their box by 3px.
- **T10:** re-confirm AC7 (320px, ConfigPage) now that the shell does not eat
  240px.
- **T07:** the `Menu`-does-not-open-at-375px finding is **explained and void** —
  see the environment lesson in the T12 ledger row. Re-check anyway once T13
  removes ProjectDetailPage's horizontal overflow.

**T13 inherits a measured defect.** ProjectDetailPage overflows **283px** at
375px (`docScrollW 658` vs `clientW 375`). Measured offenders: that page's own
un-migrated tab strip (`pb-2 -mb-px … border-b-2` buttons) and its toolbar
`<select>`s. Its header also overlaps at that width. This is pre-existing and
squarely T13's scope — and note it is what made T12's browser reviewer report a
false Critical, because `sticky top-0` pins vertically only, so a
horizontally-scrolled page moves the top bar out from under every coordinate
click.

---

## T10 — review status

T10 is complete. `code-reviewer` was re-run after the limit and returned
CHANGES REQUIRED (clipped focus ring, plus two fold-ins for T13); all were
fixed in `a84aac8`.

**`browser-reviewer` never ran on T10.** The orchestrator did that pass by hand
instead and covered: both tablists' roles/labels/`aria-orientation`/roving
tabindex, desktop unchanged at 1280, the pill scroller at 375 and 320, 320px
overflow with the shell sidebar simulated away (`scrollWidth === clientWidth
=== 320`, zero unintended overflowers), and dark theme at 1280. A formal
browser-reviewer run would still be cheap insurance but is not blocking.

## Environment — may need re-establishing

```bash
open -a Docker                                    # wait ~20s for the daemon
docker compose up -d postgres                     # container: spt_postgres
cd backend && uv run python -m app.main           # :8000, run in background
cd frontend && npm run dev                        # :5173
```

`.claude/launch.json` (committed) has the frontend dev-server config.

### Review credentials — already seeded

- `claude-review@example.com` / `ReviewBot!2026x` (manager, `email_confirmed`
  set directly in the dev DB)
- owns project **"Review Sandbox"** (`da5f4b7f-de8a-40ad-9820-4240d4895ecb`)

**Do not let agents touch projects "simple-project-tool" or "test"** — the repo
owner's real data. Only Review Sandbox is visible to the bot account. Delete
the bot account and sandbox project when the branch is done.

---

## Corrections to the plan — carry these forward

**1. Global constraint 5 is false as written.** The repo has never been
lint-clean. The enforceable reading is **"introduces no NEW lint problems."**
Baseline is now **exactly 24 (10 errors, 14 warnings)** — it was 25 at branch
base; T08 incidentally removed one. State this in every dispatch.

**2. `drag-handle` was split into two utilities** (human decision during T05).
`.drag-handle` (`touch-action: none`) for small grip glyphs only; `.drag-row`
(callout + user-select, deliberately **no** `touch-action`) for full-row/card
draggables that must stay scrollable. `index.css.test.ts` carries a negative
assertion guarding this. Never put `drag-handle` on a full row.

**3. The tickets file is authoritative** where it and the plan file disagree
(T13 = ProjectDetailPage there, T14 in the plan).

**4. `Modal` gained an optional `onSubmit`** (orchestrator decision in T09).
Its `footer` is a *sibling* of `children`, so a footer submit button would sit
outside a `<form>` in the body. `onSubmit` wraps the panel contents in a form
instead. **Use this for every overlay migrated in T13/T16** rather than
threading `id` + `form="…"` pairs.

---

## Gotchas that cost real time

**`resize_window` does not fire `resize` or `matchMedia` change events.**
Measured: after crossing the `lg` boundary, `matchMedia().matches` had flipped
and the CSS had re-evaluated, but listener counters read `mqFired: 0`,
`resizeFired: 0`. **Any correctly-written `useMediaQuery` therefore looks stale
under this tool.** Always **reload after resizing** when verifying responsive
behaviour; never resize-and-observe. This cost a false "T10 `aria-orientation`
is broken" finding that turned out to be fine.

**Portalling changes what a subtree inherits, not just where it paints.** T09's
Critical bug: `AppShell` set base text colour on a wrapper `<div>` and
`html, body` had no `color`, so everything portalled to `document.body`
inherited UA-default **black** — invisible inputs in dark mode. Now fixed at
`body` level. Check inherited colour, not just layout, whenever you portal.

**Both automated gates can pass and still miss a live defect.** That dark-mode
bug survived `code-reviewer` (cannot see rendered colour) and
`browser-reviewer` (ran out of budget before the dark step). The orchestrator
found it by opening the overlay and reading `getComputedStyle`.

**Audit a primitive against its *next* consumer, not its current one.** Three
times now a primitive passed its whole spec and broke on the second adopter:
T08's focus trap (nested modals), T10's `Tabs` (disabled active tab), T09's
`Breadcrumbs` (would have eaten a desktop crumb at T15).

**A jsdom test passing is not evidence the real browser agrees**, and jsdom
computes **no layout** — `getBoundingClientRect()` returns zeros. Wrapping,
overflow and scroll behaviour are class-presence assertions only.

**Live drag is still not verifiable in this environment** (from T05/T06).
Cover it with source-lint guards and defer to the device pass.

**`browser-reviewer` is expensive.** Give it a tight numbered checklist, tell
it the app is *already running*, set a tool-call ceiling, and tell it dark mode
is class-driven (`document.documentElement.classList.toggle('dark')`), not
`prefers-color-scheme`.

**`browser-reviewer` has no JS evaluation.** Its toolset excludes
`javascript_tool`, and installing a driver is denied by the permission
classifier — so it cannot read `getComputedStyle`, `document.activeElement`, or
`document.body.style.overflow`, which is most of what an overlay ticket needs.
It works from screenshots and the a11y tree, which also does not expose
`aria-expanded` or `aria-controls`. **Ask it for rendered-output observations
and do the measurement yourself.** In T12 this produced a false **Critical**
(a working button reported dead). The orchestrator *does* have `javascript_tool`.

**A negative click result on a horizontally-overflowing page is worthless.**
`sticky top-0` pins vertically only, so once the document is scrolled right a
sticky header travels with the content and every coordinate click lands
somewhere else. `left_click` by `ref` resolves to a coordinate too, so "I also
tried by ref" is not an independent check. Arm a click counter and call
`document.elementFromPoint` at the target's measured centre before believing a
control is broken.

**A z-index only orders siblings within one stacking context.** Two overlays
both at `z-50` are ordered by **DOM position** if they share the root stacking
context — so the moment one portals to `document.body` and the other does not,
the portalled one always wins regardless of which opened last. `Modal` and
`Drawer` portal; `CommandPalette` does **not**. Check the portal decision, not
the z-index, whenever two overlays can be open together.

---

## Carried-forward minor findings

Full detail per ticket in the ledger. Feed these to the final whole-branch
review.

- **T02:** invalid `.text-\[Npx\]{color:Npx}` emitted from literals in comments.
  **Fix during T20.**
- **T04:** `ProjectDetailPage.tsx` still has **two** dropdown implementations.
  **Consolidate in T13.**
- **T05:** the source-lint test greps comments too; `dragTouchSensors.sourceLint.test.ts`
  sits at `src/` root rather than co-located.
- **T06:** every reorder PATCHes **all** rows (4 PATCHes for one swap) —
  pre-existing; wants its own ticket. `reorder()`'s guard reads React state.
- **T07:** `Menu`'s portalled flip-above and ancestor-scroll following are
  unverifiable in jsdom. Browser review also found **`Menu` does not open at
  375px once the page is horizontally scrolled** — **re-check after T12.**
- **T08:** **mobile ACs have no in-browser evidence** — no `ConfirmDialog`
  trigger is reachable at 375px until T12. **Re-run a 375px pass after T12.**
  Also: `useFocusTrap.ts:69` lets Tab escape a topmost trap with no focusables;
  trap-stack order is mount-order not z-order (**T12 prerequisite**); the
  hidden-input rejection is case-sensitive.
- **T09:** `Breadcrumbs`' `<nav>` and `AppShell.tsx:164`'s sidebar `<nav>` are
  both unnamed landmarks. `flex-wrap` changed the ≥1024px toolbar layout — **add
  1024px to browser-review widths.** `/projects` fires its list request twice
  (StrictMode in dev — confirm it does not double in prod).
- **T10:** see the ledger row; chiefly that it owes both review gates.
- **T09/T10:** several new files hardcode `text-[Npx]` — **T20's codemod must
  absorb them**, not just the 347 pre-existing sites.
- **T12:** `aria-controls` on the hamburger dangles while the drawer is closed
  (`Drawer` unmounts, which is required so the nav is not duplicated in the tab
  order). The breakpoint gate is derived, so `drawerOpen` survives a crossing
  and rotating back to portrait **re-opens** the drawer — visible state and
  `aria-expanded` stay consistent throughout, so it was recorded rather than
  fixed. `CommandPalette` does not lock body scroll, unlike `Modal`/`Drawer`
  (pre-existing). The sidebar `+` is labelled "New project" but links to
  `/projects` (pre-existing, lifted verbatim into `SidebarNav`).

---

## Device pass — still owed

Cannot be verified in Chrome emulation; needs a real iOS device or Simulator:

- iOS zoom-on-focus (T02's unlayered 16px guard)
### ✅ DEVICE PASS DONE for the blocking item (iPhone 17 Pro, iOS 26.5, Safari)

Measured on a real simulator against the app's **actual built stylesheet**, using
`MobileTopBar`'s and `PageHeader`'s real classes:

```
--spacing-topbar (raw): calc(3rem + 0px)
bar height 48px · bar padding-top 0px · header top 48px · content box 48px
TOKEN RESOLVES: YES        HEADER PINS BELOW BAR: YES
```

**`env()` inside a `@theme` custom property DOES substitute on real WebKit.**
The feared total-failure mode -- token invalid, `height` falls back to `auto`,
top bar collapses, page headers stop pinning -- **does not occur.** This was the
one merge blocker and it is closed.

### ⚠️ BUT: all four insets measured **0px** on a Dynamic Island device

`top=0 bottom=0 left=0 right=0` in normal Safari **tab browsing**. This is not a
bug -- Safari's own chrome occupies the notch and home-indicator areas, so the
page never extends under them.

**Consequence: T19's safe-area padding is inert in the app's current delivery
mode.** `pt-[env(safe-area-inset-top)]` on the top bar and
`pb-[env(safe-area-inset-bottom)]` on `Drawer`/`Modal` all compute to 0 in
Safari. They are not wrong and cost nothing -- but they only do work in
**standalone/PWA mode** (added to Home Screen), where the web view genuinely
extends under the notch. **Not tested; the app has no manifest today.**

So the remaining device-pass items below are **not owed verification** -- they
are **conditional on shipping as an installable PWA**. Reprioritise accordingly.
Landscape rotation was not testable here (the Simulator's rotate menu needs
assistive-access permission), and would not have exercised `inset-top` anyway.

- `dvh` behaviour under browser chrome, safe-area insets (T19). `viewport-fit=cover`
  **has now landed**, so this is live but **entirely unobserved**: in Chrome
  `env(safe-area-inset-top)` resolves to `0px`, the token computes as
  `calc(3rem + 0px)` = 48px, and every code path stays byte-identical to pre-T19.
  What a device pass must confirm, in order of risk:
  1. `env()` inside a `@theme` custom property resolves on real iOS Safari —
     `--spacing-topbar: calc(3rem + env(safe-area-inset-top))`. If it does not,
     **T19's top-bar work is silently inert** (the reviewer found no citable
     broken version, and it is WebKit's own documented pattern, but it is unproven here).
  2. The top bar's content clears the notch and the sticky `PageHeader` still
     lands flush at the bar's bottom — the two are coupled through that one token,
     so they fail together or not at all.
  3. `Drawer`/`Modal` bottom padding clears the home indicator.
  4. **Landscape left/right insets are NOT handled** — the top bar has only fixed
     `px-2`. Expect the hamburger to sit under the notch in landscape.
- `Modal`'s mobile sheet variant (T08)
- Actual touch drag vs scroll on story rows, board cards, status list
- `Menu`'s portalled positioning while an ancestor scrolls

## Open question for a human

**Keyboard activation of the board card status pill (T07) is UNCONFIRMED.**
Evidence points to a tooling artifact rather than a defect, but it is unproven.
→ **Tab to a board card's status pill and press Enter.** One manual check
closes it.
