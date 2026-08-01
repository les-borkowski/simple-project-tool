# UI type scale

Reference for `--text-ui-*`, the nine-step font-size scale that replaced 323
ad-hoc `text-[Npx]` sites across the frontend.

**Why this document exists:** the migration landed as ten commits, one per
bucket, precisely so the mapping would be legible in `git log`. The branch was
then **squash-merged**, which collapses those ten messages into one. This file
is the surviving record. If you ever need to revisit, revert or extend the
scale, everything you need is here.

Introduced by tickets T02 (tokens) and T20 (codemod) on branch
`mobile-ui-rework`. Defined in [`frontend/src/index.css`](../frontend/src/index.css).

---

## The scale

| Token | rem | px |
|---|---|---|
| `--text-ui-2xs` | `0.625rem` | 10 |
| `--text-ui-xs` | `0.6875rem` | 11 |
| `--text-ui-sm` | `0.75rem` | 12 |
| `--text-ui-md` | `0.8125rem` | 13 |
| `--text-ui-lg` | `0.875rem` | 14 |
| `--text-ui-xl` | `0.9375rem` | 15 |
| `--text-ui-2xl` | `1.25rem` | 20 |
| `--text-ui-3xl` | `1.375rem` | 22 |
| `--text-ui-4xl` | `1.625rem` | 26 |

Use as Tailwind utilities: `text-ui-sm`, `text-ui-md`, and so on.

### Two constraints on the tokens themselves

**Font-size only — never add `--text-ui-*--line-height` companions.** Tailwind
supports paired line-height tokens. Adding them would have changed vertical
rhythm at all 323 call sites silently during the codemod, turning a reviewable
font-size change into an unreviewable layout change. Line-height stays
explicit at the call site.

**The `--text-ui-*` namespace is deliberate.** `MarkdownEditor.tsx`,
`ConfirmDialog.tsx` and `ToastContext.tsx` rely on Tailwind's own
`--text-sm` / `--text-xs` / `--text-lg`. Defining values in that namespace
would have shifted those components without any call site changing. Do not
rename these into Tailwind's namespace.

---

## The mapping that was applied

16 distinct pixel values collapsed onto 9 tokens. **Fractional values always
rounded up.**

| Bucket | px folded in | → token | resulting px | sites |
|---|---|---|---|---|
| 1 | 9, 9.5, 10 | `text-ui-2xs` | 10 | 10 |
| 2 | 10.5, 11 | `text-ui-xs` | 11 | 68 |
| 3 | 11.5, 12 | `text-ui-sm` | 12 | 87 |
| 4 | 12.5, 13 | `text-ui-md` | 13 | 114 |
| 5 | 13.5, 14 | `text-ui-lg` | 14 | 23 |
| 6 | 15, 16 | `text-ui-xl` | 15 | 10 |
| 7 | 20 | `text-ui-2xl` | 20 | 6 |
| 8 | 22 | `text-ui-3xl` | 22 | 4 |
| 9 | 26 | `text-ui-4xl` | 26 | 1 |
| | | | **total** | **323** |

Every site moved by **≤0.5px except two**, both reviewed by hand:

- `frontend/src/pages/StoryDetailPage.tsx` — member-initials avatar,
  `9px → 10px` (**+1px**). The scale has no 9px step. It sits in a `w-5 h-5`
  (20px) circle; verified the initials still fit.
- `frontend/src/components/layout/CommandPalette.tsx` — the search clear
  button, `16px → 15px` (**−1px**). The only site that shrank.

### Current count is 322, not 323

One `text-ui-xl` site disappeared *after* the codemod: `StoryDetailPage`'s
edit-task overlay was migrated to the `Modal` primitive during the
final-branch-review fixes, and its hand-rolled
`<h3 className="text-ui-xl">` was absorbed by `Modal`'s own `title` prop.
That is the whole discrepancy — bucket 6 is now 9 sites, not 10.

---

## Revisiting the scale

**To change a step's size**, edit the token in `frontend/src/index.css`. Every
call site follows automatically — that is the entire point of the exercise, and
the reason the codemod was worth doing.

**Before changing a value, check what depends on it.** `--spacing-topbar` is a
separate token that is load-bearing in two places at once (the mobile top bar's
height *and* every page header's sticky offset). The `--text-ui-*` tokens have
no such coupling today, but verify against the built CSS rather than assuming.

**To split a bucket back apart**, the per-bucket counts above tell you the blast
radius before you start. Bucket 4 (114 sites) and bucket 3 (87) are two thirds
of all usage.

**Regression is prevented by a source lint.**
`frontend/src/typeScale.sourceLint.test.ts` fails if any production file
reintroduces a `text-[Npx]` class. It deliberately scans **non-test files
only** — see the next section for why.

---

## Two traps this migration hit

Both are recorded because they are non-obvious and will recur.

### Tailwind's content scanner reads comments

Tailwind v4 lexes *all* source text, including comments and test assertions.
A comment in `index.css` containing the literal `text-[Npx]` caused the build to
emit invalid CSS: `.text-\[Npx\]{color:Npx}`. The fix was to reword the prose so
it no longer spells the bracketed form, plus two narrowly-targeted
`@source not` exclusions.

**Consequence that still ships:** three dead-but-valid rules
(`.text-\[9px\]`, `.text-\[13px\]`, `.text-\[16px\]`) are still emitted because
the literals appear in test-file prose. Harmless, but it is why the source lint
excludes test files — a negative assertion has to contain the string it forbids.
A blanket `@source not "**/*.test.{ts,tsx}"` would remove ~1,266 bytes of dead
CSS but also drops test-only utilities; it is queued as a separate follow-up.

### The iOS zoom guard outranks these utilities on purpose

`frontend/src/index.css` contains an **unlayered** rule forcing `font-size: 16px`
on `input` / `select` / `textarea` below 768px, because iOS Safari force-zooms a
focused control whose font-size is under 16px. Tailwind puts every utility in
`@layer utilities`, and unlayered rules beat all layered rules — so that guard
intentionally overrides `text-ui-*` on those elements.

**Do not move it into `@layer base` to "fix" the specificity.** It would then
lose to every utility class and the zoom bug would return. Any per-control
override must also be unlayered.

Two `text-ui-*` classes do land on inputs today
(`CommandPalette.tsx`, `ConfigPage.tsx`); both were zero-delta substitutions
(14→14, 13→13), so the guard introduced no new mobile/desktop divergence.
