"""Renders an EvalRunResult as Markdown or JSON."""

import json
from dataclasses import asdict

from app.evals.run import CaseResult, EvalRunResult

_FIELDS = ["count", "title", "due_date", "assignee", "story", "priority", "not_a_task"]


def _pct(rate: float | None) -> str:
    return "N/A" if rate is None else f"{rate * 100:.1f}%"


def _case_failed(c: CaseResult) -> bool:
    if c.unparseable:
        return True
    if c.not_a_task_result is False:
        return True
    if c.score is not None:
        s = c.score
        if not s.count_match:
            return True
        for field_name in ("title", "due_date", "assignee", "story", "priority"):
            if getattr(s, f"{field_name}_hits") < getattr(s, f"{field_name}_total"):
                return True
    return False


def _failed_fields(c: CaseResult) -> list[str]:
    missed = []
    if c.unparseable:
        missed.append("unparseable")
    if c.not_a_task_result is False:
        missed.append("not_a_task")
    if c.score is not None:
        s = c.score
        if not s.count_match:
            missed.append("count")
        for field_name in ("title", "due_date", "assignee", "story", "priority"):
            if getattr(s, f"{field_name}_hits") < getattr(s, f"{field_name}_total"):
                missed.append(field_name)
    return missed


def render_markdown(result: EvalRunResult) -> str:
    lines = []
    lines.append("# NL Task Capture Eval Report")
    lines.append("")
    lines.append(f"- mode: `{result.mode}`")
    lines.append(f"- model: `{result.model}`")
    lines.append(f"- prompt_version: `{result.prompt_version}`")
    lines.append(f"- run_at: {result.run_at}")
    lines.append(f"- cases: {result.case_count}")
    tokens_line = (
        f"- tokens: {result.total_prompt_tokens} prompt + "
        f"{result.total_completion_tokens} completion"
    )
    lines.append(tokens_line)
    lines.append("- cost: see provider pricing")
    misses_list = ", ".join(result.misses) if result.misses else "none"
    lines.append(f"- **Unrecorded fixtures (misses):** {len(result.misses)} — {misses_list}")
    lines.append("")

    lines.append("## Overall")
    lines.append("")
    lines.append("| field | rate | hits/total |")
    lines.append("| --- | --- | --- |")
    for field_name in [
        "count",
        "title",
        "title_mean_f1",
        "due_date",
        "assignee",
        "story",
        "priority",
        "not_a_task",
    ]:
        rate = result.overall.get(field_name)
        if field_name == "title_mean_f1":
            lines.append(f"| title_mean_f1 | {'N/A' if rate is None else f'{rate:.3f}'} | - |")
            continue
        hits_total = ""
        if field_name in ("title", "due_date", "assignee", "story", "priority"):
            hits_attr, total_attr = f"{field_name}_hits", f"{field_name}_total"
            scored = [c for c in result.cases if c.score is not None]
            total = sum(getattr(c.score, total_attr) for c in scored)
            hits = sum(getattr(c.score, hits_attr) for c in scored)
            hits_total = f"{hits}/{total}"
        lines.append(f"| {field_name} | {_pct(rate)} | {hits_total} |")
    lines.append("")

    lines.append("## Per-tag")
    lines.append("")
    lines.append("| tag | " + " | ".join(_FIELDS) + " |")
    lines.append("| --- | " + " | ".join(["---"] * len(_FIELDS)) + " |")
    for tag in sorted(result.per_tag.keys()):
        row = result.per_tag[tag]
        cells = [_pct(row.get(f)) for f in _FIELDS]
        lines.append(f"| {tag} | " + " | ".join(cells) + " |")
    lines.append("")

    lines.append("## Failing cases")
    lines.append("")
    failing = [c for c in result.cases if _case_failed(c)]
    if not failing:
        if result.case_count > 0:
            lines.append("None — all cases passed.")
        else:
            lines.append("No cases were scored — see misses above.")
    else:
        for c in failing:
            lines.append(f"### {c.case_id}")
            lines.append("")
            lines.append(f"- tags: {', '.join(c.tags)}")
            lines.append(f"- input: `{c.input_text}`")
            lines.append(f"- expected: `{json.dumps(c.expected)}`")
            lines.append(f"- predicted: `{json.dumps(c.predicted_tasks)}`")
            lines.append(f"- missed fields: {', '.join(_failed_fields(c)) or '(none)'}")
            lines.append("")

    return "\n".join(lines) + "\n"


def render_json(result: EvalRunResult) -> str:
    return json.dumps(asdict(result), indent=2, default=str)
