"""Tests for the pure scoring core of the LLM task-extraction eval harness.

Tokenizer contract pinned by these tests (for the implementer of app/evals/score.py):
    tokens(s) = set(re.findall(r"\\w+", s.lower()))
i.e. lowercase the string, extract maximal runs of word characters (`\\w+`),
drop anything else (punctuation, whitespace), and treat the result as a SET.

title_f1(a, b):
    ta, tb = tokens(a), tokens(b)
    if not ta and not tb: return 1.0
    if not ta or not tb: return 0.0
    return 2 * len(ta & tb) / (len(ta) + len(tb))

Hand-computed F1s used below:
    - "finish the auth refactor" vs "finish auth refactor now"
      ta = {finish, the, auth, refactor}       (4 tokens)
      tb = {finish, auth, refactor, now}       (4 tokens)
      intersection = {finish, auth, refactor}  (3 tokens)
      F1 = 2*3 / (4+4) = 6/8 = 0.75

    - greedy-alignment disambiguation matrix (test_align_picks_globally_best_pairing):
      pred0 = "finish the report"            -> {finish, the, report}            (3)
      pred1 = "quarterly review meeting"     -> {quarterly, review, meeting}     (3)
      exp0  = "prepare quarterly review meeting notes"
              -> {prepare, quarterly, review, meeting, notes}                    (5)
      exp1  = "finish the final report"      -> {finish, the, final, report}     (4)

      pred0 vs exp0: intersection {} -> F1 = 0.0
      pred0 vs exp1: intersection {finish, the, report} (3) -> F1 = 2*3/(3+4) = 6/7
      pred1 vs exp0: intersection {quarterly, review, meeting} (3) -> F1 = 2*3/(3+5) = 6/8 = 0.75
      pred1 vs exp1: intersection {} -> F1 = 0.0

      Highest score overall is pred0-exp1 (6/7 ~= 0.857), so it is picked first,
      then pred1-exp0 (0.75) is the only remaining pair. A naive index-order
      (pred0-exp0, pred1-exp1) pairing would instead score 0.0 and 0.0 - wrong.
"""

import asyncio
import json
from pathlib import Path
from unittest.mock import patch

import pytest

from app.core.llm.replay import FixtureMissError, ReplayClient
from app.evals.run import (
    DEFAULT_CASES_PATH,
    DEFAULT_FIXTURES_PATH,
    DEFAULT_RESPONSES_DIR,
    load_cases,
    load_fixtures,
    run_case,
    run_eval,
)
from app.evals.score import align, not_a_task_pass, score_case, title_f1

_THRESHOLDS_PATH = Path(__file__).resolve().parents[1] / "evals" / "thresholds.json"


class TestTitleF1:
    def test_score_title_f1_identical_strings(self):
        assert title_f1("finish the report", "finish the report") == pytest.approx(1.0)

    def test_score_title_f1_disjoint_word_sets(self):
        assert title_f1("finish the report", "buy some milk") == pytest.approx(0.0)

    def test_score_title_f1_partial_overlap(self):
        # See module docstring for the hand-computed math: 6/8 = 0.75
        assert title_f1("finish the auth refactor", "finish auth refactor now") == pytest.approx(
            0.75
        )

    def test_score_title_f1_both_empty_strings(self):
        assert title_f1("", "") == pytest.approx(1.0)

    def test_score_title_f1_one_empty_one_non_empty(self):
        assert title_f1("", "finish the report") == pytest.approx(0.0)
        assert title_f1("finish the report", "") == pytest.approx(0.0)

    def test_score_title_f1_case_insensitive(self):
        assert title_f1("Finish Auth", "finish auth") == pytest.approx(1.0)

    def test_score_title_f1_ignores_trailing_punctuation(self):
        assert title_f1("review the payments PR", "review the payments PR.") == pytest.approx(1.0)


class TestAlign:
    def test_score_align_perfect_one_to_one_match(self):
        predicted = [{"title": "finish the report"}, {"title": "buy some milk"}]
        expected = [{"title": "buy some milk"}, {"title": "finish the report"}]

        result = align(predicted, expected)

        assert result.unmatched_predicted == []
        assert result.unmatched_expected == []
        matched_pairs = {(p, e) for p, e, _score in result.pairs}
        assert matched_pairs == {(0, 1), (1, 0)}
        assert len(result.pairs) == 2

    def test_score_align_more_expected_than_predicted_is_a_miss(self):
        predicted = [{"title": "finish the report"}]
        expected = [{"title": "finish the report"}, {"title": "buy some milk"}]

        result = align(predicted, expected)

        assert len(result.pairs) == 1
        assert result.pairs[0][0] == 0
        assert result.pairs[0][1] == 0
        assert result.unmatched_predicted == []
        assert result.unmatched_expected == [1]

    def test_score_align_more_predicted_than_expected_is_spurious(self):
        predicted = [{"title": "finish the report"}, {"title": "buy some milk"}]
        expected = [{"title": "finish the report"}]

        result = align(predicted, expected)

        assert len(result.pairs) == 1
        assert result.pairs[0][0] == 0
        assert result.pairs[0][1] == 0
        assert result.unmatched_predicted == [1]
        assert result.unmatched_expected == []

    def test_score_align_picks_globally_best_pairing_not_naive_index_order(self):
        # See module docstring for the full F1 matrix math.
        predicted = [{"title": "finish the report"}, {"title": "quarterly review meeting"}]
        expected = [
            {"title": "prepare quarterly review meeting notes"},
            {"title": "finish the final report"},
        ]

        result = align(predicted, expected)

        matched_pairs = {(p, e) for p, e, _score in result.pairs}
        assert matched_pairs == {(0, 1), (1, 0)}
        scores = {(p, e): s for p, e, s in result.pairs}
        assert scores[(0, 1)] == pytest.approx(6 / 7)
        assert scores[(1, 0)] == pytest.approx(0.75)
        assert result.unmatched_predicted == []
        assert result.unmatched_expected == []

    def test_score_align_empty_predicted_all_expected_unmatched(self):
        predicted: list[dict] = []
        expected = [{"title": "finish the report"}, {"title": "buy some milk"}]

        result = align(predicted, expected)

        assert result.pairs == []
        assert result.unmatched_predicted == []
        assert result.unmatched_expected == [0, 1]

    def test_score_align_empty_expected_all_predicted_unmatched(self):
        predicted = [{"title": "finish the report"}, {"title": "buy some milk"}]
        expected: list[dict] = []

        result = align(predicted, expected)

        assert result.pairs == []
        assert result.unmatched_predicted == [0, 1]
        assert result.unmatched_expected == []

    def test_score_align_deterministic_tie_break_lowest_index_tuple(self):
        # All four (pred_idx, exp_idx) combinations tie at F1 = 1.0. The lowest
        # tuple, (0, 0), is picked first; the only index-disjoint pair left, (1, 1),
        # is picked second -- never (0, 1) or (1, 0), even though those also tie.
        predicted = [{"title": "a b"}, {"title": "a b"}]
        expected = [{"title": "a b"}, {"title": "a b"}]

        result = align(predicted, expected)

        assert result.pairs == [(0, 0, pytest.approx(1.0)), (1, 1, pytest.approx(1.0))]
        assert result.unmatched_predicted == []
        assert result.unmatched_expected == []


class TestScorer:
    def test_score_case_perfect_match(self):
        predicted = [
            {
                "title": "finish the report",
                "due_date": "2026-09-10",
                "assignee": "alice",
                "story": "Onboarding",
                "priority": "high",
            },
            {
                "title": "buy some milk",
                "due_date": None,
                "assignee": None,
                "story": None,
                "priority": None,
            },
        ]
        expected = [
            {
                "title": "buy some milk",
                "due_date": None,
                "assignee": None,
                "story": None,
                "priority": None,
            },
            {
                "title": "finish the report",
                "due_date": "2026-09-10",
                "assignee": "alice",
                "story": "Onboarding",
                "priority": "high",
            },
        ]

        result = score_case(predicted, expected)

        assert result.count_match is True
        assert result.title_total == 2
        assert result.title_hits == result.title_total
        assert result.title_mean_f1 == pytest.approx(1.0)
        assert result.due_date_hits == result.due_date_total == 2
        assert result.assignee_hits == result.assignee_total == 2
        assert result.story_hits == result.story_total == 2
        assert result.priority_hits == result.priority_total == 2
        assert result.n_spurious == 0
        assert result.n_missed == 0

    def test_score_case_due_date_null_null_is_a_hit(self):
        predicted = [{"title": "finish the report", "due_date": None}]
        expected = [{"title": "finish the report", "due_date": None}]

        result = score_case(predicted, expected)

        assert result.due_date_total == 1
        assert result.due_date_hits == 1

    def test_score_case_due_date_null_vs_value_is_not_a_hit(self):
        predicted = [{"title": "finish the report", "due_date": None}]
        expected = [{"title": "finish the report", "due_date": "2026-09-10"}]

        result = score_case(predicted, expected)

        assert result.due_date_total == 1
        assert result.due_date_hits == 0

    def test_score_case_assignee_null_aware_hit_and_mismatch(self):
        predicted = [
            {"title": "a", "assignee": None},
            {"title": "b", "assignee": "alice"},
        ]
        expected = [
            {"title": "a", "assignee": None},
            {"title": "b", "assignee": "bob"},
        ]

        result = score_case(predicted, expected)

        assert result.assignee_total == 2
        assert result.assignee_hits == 1

    def test_score_case_story_null_aware_hit_and_mismatch(self):
        predicted = [
            {"title": "a", "story": None},
            {"title": "b", "story": "Onboarding"},
        ]
        expected = [
            {"title": "a", "story": None},
            {"title": "b", "story": "Billing"},
        ]

        result = score_case(predicted, expected)

        assert result.story_total == 2
        assert result.story_hits == 1

    def test_score_case_priority_null_aware_hit_and_mismatch(self):
        predicted = [
            {"title": "a", "priority": None},
            {"title": "b", "priority": "high"},
        ]
        expected = [
            {"title": "a", "priority": None},
            {"title": "b", "priority": "low"},
        ]

        result = score_case(predicted, expected)

        assert result.priority_total == 2
        assert result.priority_hits == 1

    def test_score_case_count_match_false_when_lengths_differ(self):
        predicted = [{"title": "finish the report", "due_date": None}]
        expected = [
            {"title": "finish the report", "due_date": None},
            {"title": "buy some milk", "due_date": None},
        ]

        result = score_case(predicted, expected)

        assert result.count_match is False
        # The one aligned pair still scores perfectly on its own.
        assert result.due_date_hits == result.due_date_total == 1

    def test_score_case_title_hits_respect_threshold(self):
        # "finish auth" vs "finish auth work before lunch break" ->
        # ta = {finish, auth} (2), tb = {finish, auth, work, before, lunch, break} (6)
        # intersection = {finish, auth} (2) -> F1 = 2*2/(2+6) = 4/8 = 0.5 (< 0.6 default)
        predicted = [{"title": "finish auth"}]
        expected = [{"title": "finish auth work before lunch break"}]

        default_result = score_case(predicted, expected)
        assert default_result.title_total == 1
        assert default_result.title_hits == 0

        lenient_result = score_case(predicted, expected, title_hit_threshold=0.4)
        assert lenient_result.title_total == 1
        assert lenient_result.title_hits == 1

    def test_score_case_spurious_and_missed_counts(self):
        predicted = [{"title": "finish the report"}, {"title": "buy some milk"}]
        expected = [{"title": "finish the report"}]

        result = score_case(predicted, expected)
        assert result.n_spurious == 1
        assert result.n_missed == 0

        predicted2 = [{"title": "finish the report"}]
        expected2 = [{"title": "finish the report"}, {"title": "buy some milk"}]

        result2 = score_case(predicted2, expected2)
        assert result2.n_spurious == 0
        assert result2.n_missed == 1


class TestNotATaskPass:
    def test_score_not_a_task_pass_true_when_predicted_empty(self):
        assert not_a_task_pass([], expected_not_a_task=True) is True

    def test_score_not_a_task_pass_false_when_predicted_non_empty(self):
        assert not_a_task_pass([{"title": "finish the report"}], expected_not_a_task=True) is False

    def test_score_not_a_task_pass_none_when_not_applicable(self):
        assert not_a_task_pass([], expected_not_a_task=False) is None
        assert not_a_task_pass([{"title": "finish the report"}], expected_not_a_task=False) is None


class TestRunner:
    def test_load_cases_count_and_meta(self):
        meta, cases = load_cases(DEFAULT_CASES_PATH)

        assert meta["prompt_version"] == "capture/v1"
        assert len(cases) == 35

    async def _seed_one_fixture(self, tmp_path):
        # Two-pass pattern (also used in test_capture_service.py): trigger a
        # real FixtureMissError to read the exact cache key off the exception,
        # then write a fixture for it so one case traverses the full happy
        # path (extract -> parse -> score) instead of every case missing.
        _, cases = load_cases(DEFAULT_CASES_PATH)
        fixtures = load_fixtures(DEFAULT_FIXTURES_PATH)
        case = next(c for c in cases if c["id"] == "neg-001")
        client = ReplayClient(tmp_path)

        with pytest.raises(FixtureMissError) as excinfo:
            await run_case(case, fixtures, client)

        key = str(excinfo.value).split("no fixture for key ")[1].split("\n")[0].strip()
        payload = {
            "text": json.dumps({"tasks": [], "not_a_task": True, "notes": None}),
            "model": "gemini-3.6-flash",
            "prompt_tokens": 3,
            "completion_tokens": 2,
            "latency_ms": 1,
        }
        (tmp_path / f"{key}.json").write_text(json.dumps(payload))

    def test_replay_run_never_touches_httpx(self, monkeypatch, tmp_path):
        # Replay mode must never construct a real HTTP client. Seed one real
        # fixture so at least one case traverses the full happy path (rather
        # than passing vacuously because every case is a miss) while asserting
        # httpx.AsyncClient is never instantiated anywhere on this path.
        def _boom(*args, **kwargs):
            raise AssertionError("httpx.AsyncClient must not be constructed in replay mode")

        monkeypatch.setattr("httpx.AsyncClient.__init__", _boom)

        with patch("app.core.llm.replay.settings.LLM_MODEL", "gemini-3.6-flash"):
            asyncio.run(self._seed_one_fixture(tmp_path))

            result = asyncio.run(
                run_eval(
                    mode="replay",
                    cases_path=DEFAULT_CASES_PATH,
                    fixtures_path=DEFAULT_FIXTURES_PATH,
                    responses_dir=tmp_path,
                )
            )

        assert result.mode == "replay"
        assert result.case_count >= 1

    def test_replay_gate_reads_thresholds(self):
        thresholds = json.loads(_THRESHOLDS_PATH.read_text())["thresholds"]

        result = asyncio.run(
            run_eval(
                mode="replay",
                cases_path=DEFAULT_CASES_PATH,
                fixtures_path=DEFAULT_FIXTURES_PATH,
                responses_dir=DEFAULT_RESPONSES_DIR,
            )
        )

        # A miss means the fixture keys no longer match the prompt — someone edited
        # CAPTURE_SYSTEM_PROMPT or bumped LLM_MODEL without re-recording. That must fail
        # the gate, not skip it: skipping reports success while the thresholds below
        # never run, which is exactly the silent-regression hole T3 says must not exist.
        # Re-record with `python -m app.evals.run --record` after an intentional change.
        assert not result.misses, (
            f"{len(result.misses)} cases unrecorded — the prompt or model changed since "
            f"these fixtures were recorded. Re-record with --record. Missing: {result.misses}"
        )

        for field_name, floor in thresholds.items():
            rate = result.overall.get(field_name)
            assert rate is not None, f"no scored cases for {field_name!r}"
            assert rate >= floor, f"{field_name} rate {rate} below threshold {floor}"

    def test_record_mode_skips_live_call_for_already_recorded_case(self, monkeypatch, tmp_path):
        # A repeated --record run shouldn't re-pay for a case that already
        # has a complete fixture from a prior (possibly interrupted) run.
        cases_path = tmp_path / "one_case.jsonl"
        cases_path.write_text(
            "\n".join(
                [
                    json.dumps({"_meta": {"prompt_version": "capture/v1"}}),
                    json.dumps(
                        {
                            "id": "fake-001",
                            "lang": "en",
                            "fixture": "acme",
                            "reference_date": "2026-09-04",
                            "tags": ["fake"],
                            "input": "thanks!",
                            "expected": {"not_a_task": True, "tasks": []},
                        }
                    ),
                ]
            )
        )
        responses_dir = tmp_path / "responses"
        responses_dir.mkdir()

        _, cases = load_cases(cases_path)
        fixtures = load_fixtures(DEFAULT_FIXTURES_PATH)
        case = cases[0]

        with patch("app.core.llm.replay.settings.LLM_MODEL", "gemini-3.6-flash"):
            with pytest.raises(FixtureMissError) as excinfo:
                asyncio.run(run_case(case, fixtures, ReplayClient(responses_dir)))

            key = str(excinfo.value).split("no fixture for key ")[1].split("\n")[0].strip()
            payload = {
                "text": json.dumps({"tasks": [], "not_a_task": True, "notes": None}),
                "model": "gemini-3.6-flash",
                "prompt_tokens": 1,
                "completion_tokens": 1,
                "latency_ms": 1,
            }
            (responses_dir / f"{key}.json").write_text(json.dumps(payload))

            def _boom(*args, **kwargs):
                raise AssertionError("GeminiClient.complete must not be called for a cached case")

            monkeypatch.setattr("app.core.llm.gemini_client.GeminiClient.complete", _boom)

            result = asyncio.run(
                run_eval(
                    mode="record",
                    cases_path=cases_path,
                    fixtures_path=DEFAULT_FIXTURES_PATH,
                    responses_dir=responses_dir,
                )
            )

        assert result.case_count == 1
        assert result.misses == []
