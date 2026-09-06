"""Runner for the NL task-capture eval harness.

Loads cases from evals/cases/capture.jsonl, runs them through the extractor
against either recorded fixtures (replay) or a live LLM (live/record), and
aggregates per-field scores. No DB access -- this is a standalone script.
"""

import argparse
import asyncio
import json
import os
import sys
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from pathlib import Path

from app.api.services.capture_service import ProjectContext, extract
from app.core.config import settings
from app.core.llm.base import LLMResponse
from app.core.llm.gemini_client import GeminiClient
from app.core.llm.prompts import PROMPT_VERSION
from app.core.llm.replay import FixtureMissError, ReplayClient
from app.evals.score import CaseScore, not_a_task_pass, score_case

_EVALS_DIR = Path(__file__).resolve().parents[2] / "evals"
DEFAULT_CASES_PATH = _EVALS_DIR / "cases" / "capture.jsonl"
DEFAULT_FIXTURES_PATH = _EVALS_DIR / "fixtures" / "projects.json"
DEFAULT_RESPONSES_DIR = _EVALS_DIR / "fixtures" / "responses"
DEFAULT_RESULTS_DIR = _EVALS_DIR / "results"


@dataclass
class CaseResult:
    case_id: str
    tags: list[str]
    lang: str
    input_text: str
    reference_date: str
    expected: dict
    predicted_tasks: list[dict]
    unparseable: bool
    not_a_task_predicted: bool
    score: CaseScore | None
    not_a_task_result: bool | None
    model: str
    latency_ms: int
    # Not in the original spec's field list -- needed to aggregate
    # EvalRunResult.total_prompt_tokens/total_completion_tokens per case.
    prompt_tokens: int = 0
    completion_tokens: int = 0


@dataclass
class EvalRunResult:
    mode: str
    model: str
    prompt_version: str
    case_count: int
    cases: list[CaseResult]
    misses: list[str]
    total_prompt_tokens: int
    total_completion_tokens: int
    overall: dict
    per_tag: dict[str, dict]
    run_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())


def load_cases(path: Path | str) -> tuple[dict, list[dict]]:
    """Read the JSONL case file: first line is `{"_meta": {...}}`, the rest are cases."""
    lines = [line for line in Path(path).read_text().splitlines() if line.strip()]
    if not lines:
        raise ValueError(f"case file {path} is empty")
    meta = json.loads(lines[0])["_meta"]
    if meta.get("prompt_version") != PROMPT_VERSION:
        raise ValueError(
            f"case file {path} was written for prompt_version "
            f"{meta.get('prompt_version')!r}, but the current prompt is "
            f"{PROMPT_VERSION!r} -- a stale case file must not silently score "
            f"against a prompt that's since changed. Regenerate the cases."
        )
    cases = [json.loads(line) for line in lines[1:]]
    return meta, cases


def load_fixtures(path: Path | str) -> dict:
    """Read fixtures/projects.json into {fixture_id: {project_name, member_names, story_names}}."""
    return json.loads(Path(path).read_text())


def _map_predicted_tasks(tasks) -> list[dict]:
    return [
        {
            "title": t.title,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "assignee": t.assignee_hint,
            "story": t.story_hint,
            "priority": t.priority.value if t.priority else None,
        }
        for t in tasks
    ]


async def run_case(case: dict, fixtures: dict, client) -> CaseResult:
    fx = fixtures[case["fixture"]]
    ctx = ProjectContext(
        project_name=fx["project_name"],
        member_names=fx["member_names"],
        story_names=fx["story_names"],
        reference_date=date.fromisoformat(case["reference_date"]),
    )

    outcome = await extract(case["input"], ctx, client, api_key=settings.GOOGLE_API_KEY)

    # An unparseable response already comes back with tasks=[] from extract();
    # this mapping is a no-op in that case, not a special path.
    predicted_tasks = _map_predicted_tasks(outcome.result.tasks)

    expected = case["expected"]
    if expected["not_a_task"] is True:
        # An unparseable response didn't correctly recognize the input as
        # not-a-task -- it just failed twice. Never count that as a pass,
        # even though predicted_tasks == [] would otherwise look like one.
        if outcome.unparseable:
            not_a_task_result = False
        else:
            not_a_task_result = not_a_task_pass(predicted_tasks, True)
        score = None
    else:
        not_a_task_result = None
        score = score_case(predicted_tasks, expected["tasks"])

    return CaseResult(
        case_id=case["id"],
        tags=case["tags"],
        lang=case["lang"],
        input_text=case["input"],
        reference_date=case["reference_date"],
        expected=expected,
        predicted_tasks=predicted_tasks,
        unparseable=outcome.unparseable,
        not_a_task_predicted=outcome.result.not_a_task,
        score=score,
        not_a_task_result=not_a_task_result,
        model=outcome.model,
        latency_ms=outcome.latency_ms,
        prompt_tokens=outcome.prompt_tokens,
        completion_tokens=outcome.completion_tokens,
    )


class _RecordingClient:
    """Wraps a real LLMClient and records every (system, user) -> response pair
    it observes, keyed exactly like ReplayClient. Used only in --record mode so
    both first-attempt and retry prompts get a replayable fixture.
    """

    def __init__(self, inner, responses_dir: Path):
        self._inner = inner
        self._responses_dir = Path(responses_dir)
        self._keyer = ReplayClient(self._responses_dir)
        self.seen: dict[str, LLMResponse] = {}

    async def complete(
        self,
        system: str,
        user: str,
        *,
        json_schema: dict | None = None,
        max_tokens: int,
        temperature: float,
        api_key: str | None = None,
        model: str | None = None,
    ) -> LLMResponse:
        resp = await self._inner.complete(
            system,
            user,
            json_schema=json_schema,
            max_tokens=max_tokens,
            temperature=temperature,
            api_key=api_key,
            model=model,
        )
        self.seen[self._keyer._key(system, user)] = resp
        return resp

    def flush(self, written: set[str]) -> None:
        self._responses_dir.mkdir(parents=True, exist_ok=True)
        for key, resp in self.seen.items():
            if key in written:
                continue
            payload = {
                "text": resp.text,
                "model": resp.model,
                "prompt_tokens": resp.prompt_tokens,
                "completion_tokens": resp.completion_tokens,
                "latency_ms": resp.latency_ms,
            }
            path = self._responses_dir / f"{key}.json"
            tmp_path = self._responses_dir / f"{key}.json.tmp"
            tmp_path.write_text(json.dumps(payload, indent=2))
            os.replace(tmp_path, path)  # atomic -- a crash never leaves a truncated fixture
            written.add(key)


def _micro_rate(cases: list[CaseResult], hits_attr: str, total_attr: str) -> float | None:
    scored = [c for c in cases if c.score is not None]
    total = sum(getattr(c.score, total_attr) for c in scored)
    if total == 0:
        return None
    hits = sum(getattr(c.score, hits_attr) for c in scored)
    return hits / total


def _title_mean_f1(cases: list[CaseResult]) -> float | None:
    scored = [c for c in cases if c.score is not None]
    total = sum(c.score.title_total for c in scored)
    if total == 0:
        return None
    weighted_sum = sum(c.score.title_mean_f1 * c.score.title_total for c in scored)
    return weighted_sum / total


def _count_rate(cases: list[CaseResult]) -> float | None:
    scored = [c for c in cases if c.score is not None]
    if not scored:
        return None
    return sum(1 for c in scored if c.score.count_match) / len(scored)


def _not_a_task_rate(cases: list[CaseResult]) -> float | None:
    negative = [c for c in cases if c.not_a_task_result is not None]
    if not negative:
        return None
    return sum(1 for c in negative if c.not_a_task_result is True) / len(negative)


def _aggregate(cases: list[CaseResult]) -> dict:
    return {
        "count": _count_rate(cases),
        "title": _micro_rate(cases, "title_hits", "title_total"),
        "title_mean_f1": _title_mean_f1(cases),
        "due_date": _micro_rate(cases, "due_date_hits", "due_date_total"),
        "assignee": _micro_rate(cases, "assignee_hits", "assignee_total"),
        "story": _micro_rate(cases, "story_hits", "story_total"),
        "priority": _micro_rate(cases, "priority_hits", "priority_total"),
        "not_a_task": _not_a_task_rate(cases),
    }


async def run_eval(
    *,
    mode: str = "replay",
    filter_tag: str | None = None,
    delay: float = 0.0,
    cases_path: Path | str = DEFAULT_CASES_PATH,
    fixtures_path: Path | str = DEFAULT_FIXTURES_PATH,
    responses_dir: Path | str = DEFAULT_RESPONSES_DIR,
) -> EvalRunResult:
    if mode not in ("replay", "live", "record"):
        raise ValueError(f"unknown mode: {mode!r}")

    run_at = datetime.now(UTC).isoformat()
    meta, all_cases = load_cases(cases_path)
    fixtures = load_fixtures(fixtures_path)

    if filter_tag:
        all_cases = [c for c in all_cases if filter_tag in c["tags"]]

    recorder: _RecordingClient | None = None
    if mode == "replay":
        # Structurally: replay mode never constructs GeminiClient or touches httpx.
        client = ReplayClient(responses_dir)
    elif mode == "record":
        recorder = _RecordingClient(GeminiClient(), responses_dir)
        client = recorder
    else:  # live
        client = GeminiClient()

    cases: list[CaseResult] = []
    misses: list[str] = []
    written_keys: set[str] = set()

    for i, case in enumerate(all_cases):
        # --record only: a repeated --record invocation shouldn't re-pay for
        # cases that already have complete fixtures from a prior (possibly
        # interrupted) run. Try satisfying the case from disk first; a hit
        # means every prompt extract() sent last time already has a fixture,
        # so there's nothing left to record and no live call is needed.
        # --live never does this -- it must always hit the real API.
        if mode == "record":
            try:
                cached_result = await run_case(case, fixtures, ReplayClient(responses_dir))
            except FixtureMissError:
                pass
            else:
                cases.append(cached_result)
                continue

        try:
            result = await run_case(case, fixtures, client)
        except FixtureMissError:
            misses.append(case["id"])
            continue

        cases.append(result)

        if recorder is not None:
            recorder.flush(written_keys)

        is_last = i == len(all_cases) - 1
        if delay > 0 and mode in ("live", "record") and not is_last:
            await asyncio.sleep(delay)

    overall = _aggregate(cases)
    tags_seen = sorted({tag for c in cases for tag in c.tags})
    per_tag = {tag: _aggregate([c for c in cases if tag in c.tags]) for tag in tags_seen}

    model = cases[0].model if cases else settings.LLM_MODEL

    return EvalRunResult(
        mode=mode,
        model=model,
        prompt_version=meta.get("prompt_version", PROMPT_VERSION),
        case_count=len(cases),
        cases=cases,
        misses=misses,
        total_prompt_tokens=sum(c.prompt_tokens for c in cases),
        total_completion_tokens=sum(c.completion_tokens for c in cases),
        overall=overall,
        per_tag=per_tag,
        run_at=run_at,
    )


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the NL task-capture eval harness.")
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument("--live", action="store_true", help="Run against the live LLM.")
    mode_group.add_argument(
        "--record", action="store_true", help="Run against the live LLM and record fixtures."
    )
    parser.add_argument(
        "--filter", metavar="TAG", default=None, help="Only run cases with this tag."
    )
    parser.add_argument("--format", choices=["md", "json"], default="md", help="Stdout format.")
    parser.add_argument(
        "--delay", type=float, default=0.0, help="Seconds to sleep between live/record calls."
    )
    return parser.parse_args(argv)


def main() -> None:
    args = _parse_args()
    mode = "record" if args.record else ("live" if args.live else "replay")

    result = asyncio.run(run_eval(mode=mode, filter_tag=args.filter, delay=args.delay))

    if result.misses:
        print(
            f"{len(result.misses)} cache misses — re-record: {', '.join(result.misses)}",
            file=sys.stderr,
        )
        sys.exit(1)

    from app.evals.report import render_json, render_markdown

    DEFAULT_RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    (DEFAULT_RESULTS_DIR / "latest.md").write_text(render_markdown(result))
    (DEFAULT_RESULTS_DIR / "latest.json").write_text(render_json(result))

    if args.format == "json":
        print(render_json(result))
    else:
        print(render_markdown(result))

    sys.exit(0)


if __name__ == "__main__":
    main()
