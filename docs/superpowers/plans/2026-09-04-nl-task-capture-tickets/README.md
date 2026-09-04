# NL Task Capture + Eval Harness — Tickets

Source: [`2026-09-04-nl-task-capture-and-eval-harness.md`](2026-09-04-nl-task-capture-and-eval-harness.md)
(decisions D1–D10 settled; D6 = Google Gemini).

## Execution order

| id | title | type | difficulty | depends on |
|---|---|---|---|---|
| [T0](T0.md) | Correct stale status / story claims in the docs | docs | easy | — |
| [T1](T1.md) | LLM client interface, Gemini adapter, replay client | backend | medium | — |
| [T2](T2.md) | Capture extractor: free text → validated task list | backend | medium | T1 |
| [T3](T3.md) | Eval harness: cases, scorer, runner, CI gate | backend | hard | T2 |
| [T4](T4.md) | `POST …/tasks/capture` — preview endpoint | backend | medium | T2 |
| [T5](T5.md) | `POST …/tasks/capture/confirm` — create the tasks | backend | hard | T4 |
| [T6](T6.md) | API-key + scope access on the capture endpoints | backend | hard | T5 |
| [T7](T7.md) | CLI: `spt tasks capture` | backend | medium | T6 |
| [T8](T8.md) | UI: quick capture modal | frontend | medium | T5 |
| [T9](T9.md) | Docs: eval results, env vars, feature docs | docs | easy | T3, T5 |

**The deliverable is done at T3 + T5.** T6–T9 are the finish; T7 and T8 are the cut line (§6 of the
plan). T0 is independent — land it any time, including first, while you're still warm on the code.

### Notes on the decomposition

- **Re-sliced from the plan's commit sequence.** C4 was one commit for both endpoints; it is split
  into T4 (preview — reads only) and T5 (confirm — writes user data) because they carry completely
  different risk and deserve different review depth. C7's docs are split into T0 (corrections, valid
  today, no dependencies) and T9 (new documentation, depends on results existing).
- **API-key wiring is its own ticket (T6)** rather than a line in T4. The path has never executed in
  production code (§1.1 of the plan) and is the single most likely place to find a latent bug; it
  should be one reviewable diff with its own tests, not a footnote in a feature commit.
- **T1 and T2 are foundation tickets** — two of ten, which is within the acceptable ratio. T1 is a
  shared abstraction both deliverables need; T2 is the pure function the harness measures *and* the
  endpoint calls. Both are independently verifiable without the other half landing: T1 by a live
  smoke against the real API, T2 by unit tests driven through the replay client.
- **Only one frontend ticket**, so there is no a/b pair; the API contract is nonetheless reproduced
  verbatim in T4, T5 and T8.
- **Interpretation I had to choose:** the plan says the extractor emits `assignee_hint` / `story_hint`
  as *names*, and separately that the service resolves them to ids. I put resolution entirely in T4
  (it needs the DB) and kept T2 free of any database dependency. This is what makes the eval harness
  runnable with no Postgres — evals score the hints by name, which is what the case file records.

---


## Ticket files

- [T0 — Correct stale status and story claims in the docs](T0.md)
- [T1 — LLM client interface, Gemini adapter, replay client](T1.md)
- [T2 — Capture extractor: free text → validated task list](T2.md)
- [T3 — Eval harness: cases, scorer, runner, CI gate](T3.md)
- [T4 — `POST …/tasks/capture` — preview endpoint](T4.md)
- [T5 — `POST …/tasks/capture/confirm` — create the tasks](T5.md)
- [T6 — API-key + scope access on the capture endpoints](T6.md)
- [T7 — CLI: `spt tasks capture`](T7.md)
- [T8 — UI: quick capture modal](T8.md)
- [T9 — Docs: eval results, env vars, feature docs](T9.md)
