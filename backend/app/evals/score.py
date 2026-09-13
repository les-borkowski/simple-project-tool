"""Pure scoring core for the LLM task-extraction eval harness.

No I/O, no app.api/app.db imports -- just comparison of predicted vs
expected task dicts so it can be unit-tested and reused by any harness.
"""

import re
from dataclasses import dataclass


def tokens(s: str) -> set[str]:
    return set(re.findall(r"\w+", s.lower()))


def title_f1(a: str, b: str) -> float:
    ta, tb = tokens(a), tokens(b)
    if not ta and not tb:
        return 1.0
    if not ta or not tb:
        return 0.0
    return 2 * len(ta & tb) / (len(ta) + len(tb))


@dataclass
class AlignmentResult:
    pairs: list[tuple[int, int, float]]
    unmatched_predicted: list[int]
    unmatched_expected: list[int]


def align(predicted: list[dict], expected: list[dict]) -> AlignmentResult:
    # Full pairwise matrix, then greedily take the best-scoring pair, ties
    # broken by lowest (predicted_idx, expected_idx) -- see module docstring
    # of the test file for why naive index-order pairing is wrong.
    candidates = [
        (title_f1(p["title"], e["title"]), pi, ei)
        for pi, p in enumerate(predicted)
        for ei, e in enumerate(expected)
    ]
    candidates.sort(key=lambda c: (-c[0], c[1], c[2]))

    used_predicted: set[int] = set()
    used_expected: set[int] = set()
    pairs: list[tuple[int, int, float]] = []
    for score, pi, ei in candidates:
        if pi in used_predicted or ei in used_expected:
            continue
        pairs.append((pi, ei, score))
        used_predicted.add(pi)
        used_expected.add(ei)

    pairs.sort(key=lambda p: p[0])
    unmatched_predicted = sorted(set(range(len(predicted))) - used_predicted)
    unmatched_expected = sorted(set(range(len(expected))) - used_expected)
    return AlignmentResult(
        pairs=pairs,
        unmatched_predicted=unmatched_predicted,
        unmatched_expected=unmatched_expected,
    )


@dataclass
class CaseScore:
    count_match: bool
    title_total: int = 0
    title_hits: int = 0
    title_mean_f1: float = 0.0
    due_date_total: int = 0
    due_date_hits: int = 0
    assignee_total: int = 0
    assignee_hits: int = 0
    story_total: int = 0
    story_hits: int = 0
    priority_total: int = 0
    priority_hits: int = 0
    n_spurious: int = 0
    n_missed: int = 0


_NULL_AWARE_FIELDS = ("due_date", "assignee", "story", "priority")


def score_case(
    predicted: list[dict], expected: list[dict], *, title_hit_threshold: float = 0.6
) -> CaseScore:
    alignment = align(predicted, expected)

    result = CaseScore(count_match=len(predicted) == len(expected))

    f1_scores: list[float] = []
    for pred_idx, exp_idx, f1_score in alignment.pairs:
        result.title_total += 1
        if f1_score >= title_hit_threshold:
            result.title_hits += 1
        f1_scores.append(f1_score)

        pred_item = predicted[pred_idx]
        exp_item = expected[exp_idx]
        for field_name in _NULL_AWARE_FIELDS:
            setattr(result, f"{field_name}_total", getattr(result, f"{field_name}_total") + 1)
            if pred_item.get(field_name) == exp_item.get(field_name):
                setattr(result, f"{field_name}_hits", getattr(result, f"{field_name}_hits") + 1)

    result.title_mean_f1 = sum(f1_scores) / len(f1_scores) if f1_scores else 0.0
    result.n_spurious = len(alignment.unmatched_predicted)
    result.n_missed = len(alignment.unmatched_expected)
    return result


def not_a_task_pass(predicted: list[dict], expected_not_a_task: bool) -> bool | None:
    if expected_not_a_task is False:
        return None
    return predicted == []
