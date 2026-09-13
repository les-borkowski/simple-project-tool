import dataclasses
import inspect
import json
from datetime import date
from unittest.mock import patch

import pytest

from app.core.llm.base import LLMNotConfigured, LLMResponse, LLMUnavailable


class FakeClient:
    """Test double recording calls and returning canned responses per call index."""

    def __init__(self, responses: list[LLMResponse]):
        self._responses = responses
        self.calls: list[dict] = []

    async def complete(
        self,
        system,
        user,
        *,
        json_schema=None,
        max_tokens,
        temperature=0,
        api_key=None,
        model=None,
    ):
        self.calls.append(
            {
                "system": system,
                "user": user,
                "json_schema": json_schema,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "api_key": api_key,
                "model": model,
            }
        )
        idx = len(self.calls) - 1
        resp = self._responses[idx]
        if isinstance(resp, Exception):
            raise resp
        return resp


def _resp(payload: dict, **overrides) -> LLMResponse:
    fields = dict(
        text=json.dumps(payload),
        model="gemini-3.6-flash",
        prompt_tokens=10,
        completion_tokens=5,
        latency_ms=42,
    )
    fields.update(overrides)
    return LLMResponse(**fields)


def _ctx(**overrides):
    from app.api.services.capture_service import ProjectContext

    fields = dict(
        project_name="Website Relaunch",
        member_names=["Ada Lovelace", "Grace Hopper"],
        story_names=["Homepage", "Checkout"],
        reference_date=date(2026, 9, 4),
    )
    fields.update(overrides)
    return ProjectContext(**fields)


def _task(**overrides) -> dict:
    fields = dict(
        title="Fix the checkout bug",
        description=None,
        story_hint=None,
        assignee_hint=None,
        due_date=None,
        priority=None,
        confidence=0.9,
    )
    fields.update(overrides)
    return fields


async def test_happy_path_single_task():
    from app.api.services.capture_service import extract

    payload = {"tasks": [_task(confidence=0.85)], "not_a_task": False, "notes": None}
    client = FakeClient([_resp(payload)])
    ctx = _ctx()

    outcome = await extract("Fix the checkout bug", ctx, client)

    assert outcome.unparseable is False
    assert outcome.retried is False
    assert len(outcome.result.tasks) == 1
    assert outcome.result.tasks[0].confidence == pytest.approx(0.85)
    assert outcome.result.tasks[0].title == "Fix the checkout bug"
    assert len(client.calls) == 1


async def test_multi_task_preserves_order():
    from app.api.services.capture_service import extract

    tasks = [
        _task(title="Alpha task"),
        _task(title="Beta task"),
        _task(title="Gamma task"),
    ]
    payload = {"tasks": tasks, "not_a_task": False, "notes": None}
    client = FakeClient([_resp(payload)])
    ctx = _ctx()

    outcome = await extract("Alpha, beta, gamma", ctx, client)

    assert [t.title for t in outcome.result.tasks] == ["Alpha task", "Beta task", "Gamma task"]


async def test_not_a_task_returns_empty_tasks():
    from app.api.services.capture_service import extract

    payload = {"tasks": [], "not_a_task": True, "notes": "just a greeting"}
    client = FakeClient([_resp(payload)])
    ctx = _ctx()

    outcome = await extract("hey there!", ctx, client)

    assert outcome.unparseable is False
    assert outcome.result.not_a_task is True
    assert outcome.result.tasks == []


async def test_past_due_date_penalty():
    from app.api.services.capture_service import extract

    ctx = _ctx(reference_date=date(2026, 9, 4))
    payload = {
        "tasks": [_task(due_date="2026-09-03", confidence=0.9)],
        "not_a_task": False,
        "notes": None,
    }
    client = FakeClient([_resp(payload)])

    outcome = await extract("do it yesterday", ctx, client)

    assert outcome.result.tasks[0].confidence == pytest.approx(0.6)


async def test_unresolved_assignee_penalty_stacks_and_clamps():
    from app.api.services.capture_service import extract

    ctx = _ctx(reference_date=date(2026, 9, 4), member_names=["Ada Lovelace", "Grace Hopper"])
    payload = {
        "tasks": [
            _task(
                due_date="2026-09-03",
                assignee_hint="Someone Unknown",
                confidence=0.1,
            )
        ],
        "not_a_task": False,
        "notes": None,
    }
    client = FakeClient([_resp(payload)])

    outcome = await extract("assign this to nobody, overdue", ctx, client)

    assert outcome.result.tasks[0].confidence == 0.0


async def test_unresolved_assignee_penalty_only():
    from app.api.services.capture_service import extract

    ctx = _ctx(reference_date=date(2026, 9, 4), member_names=["Ada Lovelace", "Grace Hopper"])
    payload = {
        "tasks": [_task(assignee_hint="Someone Unknown", confidence=0.9)],
        "not_a_task": False,
        "notes": None,
    }
    client = FakeClient([_resp(payload)])

    outcome = await extract("assign this to nobody", ctx, client)

    assert outcome.result.tasks[0].confidence == pytest.approx(0.7)


async def test_assignee_hint_matches_member_no_penalty():
    from app.api.services.capture_service import extract

    ctx = _ctx(member_names=["Ada Lovelace", "Grace Hopper"])
    payload = {
        "tasks": [_task(assignee_hint="ada lovelace", confidence=0.9)],
        "not_a_task": False,
        "notes": None,
    }
    client = FakeClient([_resp(payload)])

    outcome = await extract("give it to ada", ctx, client)

    assert outcome.result.tasks[0].confidence == pytest.approx(0.9)


async def test_title_at_ceiling_penalty():
    from app.api.services.capture_service import extract

    long_title = "x" * 500
    payload = {
        "tasks": [_task(title=long_title, confidence=0.8)],
        "not_a_task": False,
        "notes": None,
    }
    client = FakeClient([_resp(payload)])
    ctx = _ctx()

    outcome = await extract(long_title, ctx, client)

    assert outcome.result.tasks[0].confidence == pytest.approx(0.65)


async def test_retry_then_succeed():
    from app.api.services.capture_service import extract

    payload = {"tasks": [_task()], "not_a_task": False, "notes": None}
    client = FakeClient(
        [
            _resp({}, text="not json at all"),
            _resp(payload),
        ]
    )
    ctx = _ctx()

    outcome = await extract("fix the login page", ctx, client)

    assert outcome.retried is True
    assert outcome.unparseable is False
    assert len(outcome.result.tasks) == 1
    assert len(client.calls) == 2
    assert "not json at all" in client.calls[1]["user"]


async def test_retry_then_give_up():
    from app.api.services.capture_service import extract

    client = FakeClient(
        [
            _resp({}, text="still not json"),
            _resp({}, text="still not json"),
        ]
    )
    ctx = _ctx()

    outcome = await extract("fix the login page", ctx, client)

    assert outcome.unparseable is True
    assert outcome.result.tasks == []
    assert outcome.retried is True
    assert len(client.calls) == 2


async def test_retry_then_succeed_sums_tokens_from_both_calls():
    """Both calls were actually made and billed by the provider — the first call's
    tokens must not be silently dropped just because it needed a retry."""
    from app.api.services.capture_service import extract

    payload = {"tasks": [_task()], "not_a_task": False, "notes": None}
    client = FakeClient(
        [
            _resp({}, text="not json at all", prompt_tokens=10, completion_tokens=5),
            _resp(payload, prompt_tokens=20, completion_tokens=8),
        ]
    )
    ctx = _ctx()

    outcome = await extract("fix the login page", ctx, client)

    assert outcome.retried is True
    assert outcome.unparseable is False
    assert outcome.prompt_tokens == 30
    assert outcome.completion_tokens == 13


async def test_retry_then_give_up_sums_tokens_from_both_calls():
    """Same accounting requirement on the unparseable-fallback return path."""
    from app.api.services.capture_service import extract

    client = FakeClient(
        [
            _resp({}, text="still not json", prompt_tokens=10, completion_tokens=5),
            _resp({}, text="still not json", prompt_tokens=15, completion_tokens=7),
        ]
    )
    ctx = _ctx()

    outcome = await extract("fix the login page", ctx, client)

    assert outcome.unparseable is True
    assert outcome.prompt_tokens == 25
    assert outcome.completion_tokens == 12


async def test_schema_invalid_json_triggers_retry():
    from app.api.services.capture_service import extract

    bad_payload = {"tasks": [_task(confidence=1.5)], "not_a_task": False, "notes": None}
    good_payload = {"tasks": [_task(confidence=0.5)], "not_a_task": False, "notes": None}
    client = FakeClient([_resp(bad_payload), _resp(good_payload)])
    ctx = _ctx()

    outcome = await extract("fix the login page", ctx, client)

    assert outcome.retried is True
    assert outcome.unparseable is False
    assert len(outcome.result.tasks) == 1
    assert outcome.result.tasks[0].confidence == pytest.approx(0.5)


async def test_schema_invalid_json_retry_then_give_up():
    from app.api.services.capture_service import extract

    bad_payload = {"tasks": [_task(confidence=1.5)], "not_a_task": False, "notes": None}
    client = FakeClient([_resp(bad_payload), _resp(bad_payload)])
    ctx = _ctx()

    outcome = await extract("fix the login page", ctx, client)

    assert outcome.unparseable is True
    assert outcome.retried is True
    assert outcome.result.tasks == []
    assert len(client.calls) == 2


async def test_not_configured_propagates():
    from app.api.services.capture_service import extract

    client = FakeClient([LLMNotConfigured("no key")])
    ctx = _ctx()

    with pytest.raises(LLMNotConfigured):
        await extract("fix the login page", ctx, client)


async def test_unavailable_propagates():
    from app.api.services.capture_service import extract

    client = FakeClient([LLMUnavailable("provider error")])
    ctx = _ctx()

    with pytest.raises(LLMUnavailable):
        await extract("fix the login page", ctx, client)


async def test_prompt_contains_context():
    from app.api.services.capture_service import extract

    reference_date = date(2026, 9, 4)
    ctx = _ctx(
        project_name="Website Relaunch",
        member_names=["Ada Lovelace", "Grace Hopper"],
        story_names=["Homepage", "Checkout"],
        reference_date=reference_date,
    )
    payload = {"tasks": [_task()], "not_a_task": False, "notes": None}
    client = FakeClient([_resp(payload)])
    raw_text = "Ada should fix the homepage checkout flow by Friday"

    await extract(raw_text, ctx, client)

    user_text = client.calls[0]["user"]
    assert reference_date.isoformat() in user_text
    assert reference_date.strftime("%A") in user_text
    assert "Website Relaunch" in user_text
    assert "Ada Lovelace" in user_text
    assert "Grace Hopper" in user_text
    assert "Homepage" in user_text
    assert "Checkout" in user_text
    assert raw_text in user_text


async def test_project_context_fields():
    from app.api.services.capture_service import ProjectContext

    names = {f.name for f in dataclasses.fields(ProjectContext)}
    assert names == {"project_name", "member_names", "story_names", "reference_date"}


def test_no_asyncsession_import():
    import app.api.services.capture_service as m

    assert "AsyncSession" not in inspect.getsource(m)


async def test_replay_client_end_to_end(tmp_path):
    from app.api.services.capture_service import extract
    from app.core.llm.replay import FixtureMissError, ReplayClient

    with patch("app.core.llm.replay.settings.LLM_MODEL", "gemini-3.6-flash"):
        ctx = _ctx()
        client = ReplayClient(tmp_path)

        with pytest.raises(FixtureMissError) as excinfo:
            await extract("Ship the release notes by tomorrow", ctx, client)

        message = str(excinfo.value)
        key = message.split("no fixture for key ")[1].split("\n")[0].strip()

        payload = {"tasks": [_task(title="Ship the release notes")], "not_a_task": False}
        (tmp_path / f"{key}.json").write_text(
            json.dumps(
                {
                    "text": json.dumps(payload),
                    "model": "gemini-3.6-flash",
                    "prompt_tokens": 3,
                    "completion_tokens": 4,
                    "latency_ms": 1,
                }
            )
        )

        outcome = await extract("Ship the release notes by tomorrow", ctx, client)

    assert outcome.unparseable is False
    assert len(outcome.result.tasks) == 1
    assert outcome.result.tasks[0].title == "Ship the release notes"
