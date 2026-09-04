import json
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

import app.api.main as main_module
from app.api.main import app
from app.core.llm import get_llm_client
from app.core.llm.base import LLMNotConfigured, LLMUnavailable
from app.db.models import User

CAPTURE_UNPARSEABLE_EN = "Could not understand the input as a task"
CAPTURE_NOT_A_TASK_EN = "This does not look like a task request"


@pytest.fixture(autouse=True)
def load_locales():
    """The api_client fixture never runs the app lifespan, so LOCALES stays
    empty and translate() falls back to the raw code. Load it the same way
    lifespan does so warning-message assertions reflect real behaviour.
    """
    locales_dir = Path(main_module.__file__).parent.parent / "locales"
    for locale_file in sorted(locales_dir.glob("*.json")):
        with open(locale_file) as f:
            main_module.LOCALES[locale_file.stem] = json.load(f)
    yield


class FakeLLMClient:
    """Test double returning canned raw text per call, retry-aware."""

    def __init__(self, responses):
        # responses: list of (text, model) or a single (text, model); support both
        # a fixed single response and a list for retry-path tests
        self.calls = []
        self._responses = responses if isinstance(responses, list) else [responses]

    async def complete(self, system, user, *, json_schema=None, max_tokens, temperature):
        self.calls.append({"system": system, "user": user})
        idx = min(len(self.calls) - 1, len(self._responses) - 1)
        text, model = self._responses[idx]
        from app.core.llm.base import LLMResponse

        return LLMResponse(
            text=text, model=model, prompt_tokens=1, completion_tokens=1, latency_ms=1
        )


class RaisingLLMClient:
    def __init__(self, exc):
        self._exc = exc
        self.calls = []

    async def complete(self, *a, **kw):
        self.calls.append(1)
        raise self._exc


@pytest.fixture
def set_llm_client():
    """Override get_llm_client for one test, clearing the override afterwards."""

    def _set(client):
        app.dependency_overrides[get_llm_client] = lambda: client
        return client

    yield _set
    app.dependency_overrides.pop(get_llm_client, None)


def _extraction_json(tasks: list[dict], not_a_task: bool = False, notes: str | None = None) -> str:
    return json.dumps({"tasks": tasks, "not_a_task": not_a_task, "notes": notes})


def _task(
    title="Fix the login bug",
    description=None,
    story_hint=None,
    assignee_hint=None,
    due_date=None,
    priority=None,
    confidence=0.9,
) -> dict:
    return {
        "title": title,
        "description": description,
        "story_hint": story_hint,
        "assignee_hint": assignee_hint,
        "due_date": due_date,
        "priority": priority,
        "confidence": confidence,
    }


async def _register_member(
    api_client: AsyncClient,
    api_db: AsyncSession,
    manager_headers: dict,
    project_id: str,
    name: str,
    role: str = "contributor",
) -> tuple[dict, str]:
    """Register a new user, confirm their email, and add them to the project."""
    email = f"member_{uuid.uuid4().hex[:8]}@test.com"
    with patch("app.core.email.send_email", new=AsyncMock()):
        await api_client.post(
            "/api/v1/auth/register",
            json={"email": email, "name": name, "password": "testpassword123"},
        )
    await api_db.execute(update(User).where(User.email == email).values(email_confirmed=True))
    await api_db.flush()
    login = await api_client.post(
        "/api/v1/auth/login", json={"email": email, "password": "testpassword123"}
    )
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    me = await api_client.get("/api/v1/auth/me", headers=headers)
    user_id = me.json()["id"]
    await api_client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"user_id": user_id, "role": role},
        headers=manager_headers,
    )
    return headers, user_id


async def _task_count(api_client: AsyncClient, project_id: str, headers: dict) -> int:
    resp = await api_client.get(f"/api/v1/projects/{project_id}/tasks", headers=headers)
    assert resp.status_code == 200
    return len(resp.json()["items"])


@pytest.mark.asyncio
async def test_capture_happy_path_no_hints(
    api_client: AsyncClient, manager_headers: dict, test_project: dict, set_llm_client
):
    pid = test_project["id"]
    fake = set_llm_client(FakeLLMClient((_extraction_json([_task()]), "gemini-3.6-flash")))

    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks/capture",
        json={"text": "Fix the login bug"},
        headers=manager_headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["needs_confirmation"] is True
    assert data["unparseable"] is False
    assert data["warnings"] == []
    assert len(data["tasks"]) == 1
    task = data["tasks"][0]
    assert task["story_id"] is None
    assert task["assignee_id"] is None
    assert task["story_resolved"] is False
    assert task["assignee_resolved"] is False
    assert task["low_confidence"] is False
    assert len(fake.calls) == 1


@pytest.mark.asyncio
async def test_capture_assignee_resolves_by_exact_name(
    api_client: AsyncClient,
    manager_headers: dict,
    api_db: AsyncSession,
    test_project: dict,
    set_llm_client,
):
    pid = test_project["id"]
    member_headers, member_id = await _register_member(
        api_client, api_db, manager_headers, pid, "Ada Lovelace"
    )

    set_llm_client(
        FakeLLMClient((_extraction_json([_task(assignee_hint="Ada Lovelace")]), "gemini-3.6-flash"))
    )
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks/capture",
        json={"text": "Ada should fix the login bug"},
        headers=manager_headers,
    )
    assert resp.status_code == 200
    task = resp.json()["tasks"][0]
    assert task["assignee_id"] == member_id
    assert task["assignee_resolved"] is True


@pytest.mark.asyncio
async def test_capture_assignee_resolves_case_insensitively(
    api_client: AsyncClient,
    manager_headers: dict,
    api_db: AsyncSession,
    test_project: dict,
    set_llm_client,
):
    pid = test_project["id"]
    _, member_id = await _register_member(api_client, api_db, manager_headers, pid, "Ada Lovelace")

    set_llm_client(
        FakeLLMClient((_extraction_json([_task(assignee_hint="ADA lovelace")]), "gemini-3.6-flash"))
    )
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks/capture",
        json={"text": "ADA lovelace should fix the login bug"},
        headers=manager_headers,
    )
    assert resp.status_code == 200
    task = resp.json()["tasks"][0]
    assert task["assignee_id"] == member_id
    assert task["assignee_resolved"] is True


@pytest.mark.asyncio
async def test_capture_assignee_hint_no_match_warns(
    api_client: AsyncClient, manager_headers: dict, test_project: dict, set_llm_client
):
    pid = test_project["id"]
    set_llm_client(
        FakeLLMClient((_extraction_json([_task(assignee_hint="Nobody Here")]), "gemini-3.6-flash"))
    )
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks/capture",
        json={"text": "Nobody Here should fix the login bug"},
        headers=manager_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    task = data["tasks"][0]
    assert task["assignee_id"] is None
    assert task["assignee_resolved"] is False
    assert any("Nobody Here" in w for w in data["warnings"])


@pytest.mark.asyncio
async def test_capture_story_resolves_by_exact_title(
    api_client: AsyncClient, manager_headers: dict, test_project: dict, set_llm_client
):
    pid = test_project["id"]
    story_resp = await api_client.post(
        f"/api/v1/projects/{pid}/stories",
        json={"title": "Checkout Flow"},
        headers=manager_headers,
    )
    story_id = story_resp.json()["id"]

    set_llm_client(
        FakeLLMClient((_extraction_json([_task(story_hint="Checkout Flow")]), "gemini-3.6-flash"))
    )
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks/capture",
        json={"text": "In checkout flow, fix the login bug"},
        headers=manager_headers,
    )
    assert resp.status_code == 200
    task = resp.json()["tasks"][0]
    assert task["story_id"] == story_id
    assert task["story_resolved"] is True


@pytest.mark.asyncio
async def test_capture_payload_story_id_used_as_default(
    api_client: AsyncClient,
    manager_headers: dict,
    test_project: dict,
    test_story: dict,
    set_llm_client,
):
    pid = test_project["id"]
    set_llm_client(FakeLLMClient((_extraction_json([_task(story_hint=None)]), "gemini-3.6-flash")))
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks/capture",
        json={"text": "Fix the login bug", "story_id": test_story["id"]},
        headers=manager_headers,
    )
    assert resp.status_code == 200
    task = resp.json()["tasks"][0]
    assert task["story_id"] == test_story["id"]
    assert task["story_resolved"] is True


@pytest.mark.asyncio
async def test_capture_low_confidence_flag(
    api_client: AsyncClient, manager_headers: dict, test_project: dict, set_llm_client
):
    pid = test_project["id"]
    set_llm_client(FakeLLMClient((_extraction_json([_task(confidence=0.3)]), "gemini-3.6-flash")))
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks/capture",
        json={"text": "Maybe fix the login bug at some point"},
        headers=manager_headers,
    )
    assert resp.status_code == 200
    task = resp.json()["tasks"][0]
    assert task["low_confidence"] is True


@pytest.mark.asyncio
async def test_capture_not_a_task(
    api_client: AsyncClient, manager_headers: dict, test_project: dict, set_llm_client
):
    pid = test_project["id"]
    set_llm_client(FakeLLMClient((_extraction_json([], not_a_task=True), "gemini-3.6-flash")))
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks/capture",
        json={"text": "How's the weather today?"},
        headers=manager_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["tasks"] == []
    assert data["unparseable"] is False
    assert CAPTURE_NOT_A_TASK_EN in data["warnings"]


@pytest.mark.asyncio
async def test_capture_unparseable(
    api_client: AsyncClient, manager_headers: dict, test_project: dict, set_llm_client
):
    pid = test_project["id"]
    set_llm_client(
        FakeLLMClient(
            [("not valid json", "gemini-3.6-flash"), ("still not valid json", "gemini-3.6-flash")]
        )
    )
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks/capture",
        json={"text": "gibberish gibberish"},
        headers=manager_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["tasks"] == []
    assert data["unparseable"] is True
    assert CAPTURE_UNPARSEABLE_EN in data["warnings"]


@pytest.mark.asyncio
async def test_capture_non_member_forbidden_no_llm_call(
    api_client: AsyncClient, global_manager_headers: dict, test_project: dict, set_llm_client
):
    pid = test_project["id"]
    fake = set_llm_client(FakeLLMClient((_extraction_json([_task()]), "gemini-3.6-flash")))
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks/capture",
        json={"text": "Fix the login bug"},
        headers=global_manager_headers,
    )
    assert resp.status_code == 403
    assert fake.calls == []


@pytest.mark.asyncio
async def test_capture_project_not_found(
    api_client: AsyncClient, manager_headers: dict, set_llm_client
):
    fake = set_llm_client(FakeLLMClient((_extraction_json([_task()]), "gemini-3.6-flash")))
    resp = await api_client.post(
        f"/api/v1/projects/{uuid.uuid4()}/tasks/capture",
        json={"text": "Fix the login bug"},
        headers=manager_headers,
    )
    assert resp.status_code == 404
    assert fake.calls == []


@pytest.mark.asyncio
async def test_capture_llm_not_configured_returns_503(
    api_client: AsyncClient, manager_headers: dict, test_project: dict, set_llm_client
):
    pid = test_project["id"]
    set_llm_client(RaisingLLMClient(LLMNotConfigured("no key")))
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks/capture",
        json={"text": "Fix the login bug"},
        headers=manager_headers,
    )
    assert resp.status_code == 503
    assert resp.json()["error"]["code"] == "LLM_NOT_CONFIGURED"


@pytest.mark.asyncio
async def test_capture_llm_unavailable_returns_503(
    api_client: AsyncClient, manager_headers: dict, test_project: dict, set_llm_client
):
    pid = test_project["id"]
    set_llm_client(RaisingLLMClient(LLMUnavailable("down")))
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks/capture",
        json={"text": "Fix the login bug"},
        headers=manager_headers,
    )
    assert resp.status_code == 503
    assert resp.json()["error"]["code"] == "LLM_UNAVAILABLE"


@pytest.mark.asyncio
async def test_capture_writes_no_task_row_happy_path(
    api_client: AsyncClient, manager_headers: dict, test_project: dict, set_llm_client
):
    pid = test_project["id"]
    set_llm_client(FakeLLMClient((_extraction_json([_task()]), "gemini-3.6-flash")))
    before = await _task_count(api_client, pid, manager_headers)
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks/capture",
        json={"text": "Fix the login bug"},
        headers=manager_headers,
    )
    assert resp.status_code == 200
    after = await _task_count(api_client, pid, manager_headers)
    assert after == before


@pytest.mark.asyncio
async def test_capture_writes_no_task_row_not_a_task(
    api_client: AsyncClient, manager_headers: dict, test_project: dict, set_llm_client
):
    pid = test_project["id"]
    set_llm_client(FakeLLMClient((_extraction_json([], not_a_task=True), "gemini-3.6-flash")))
    before = await _task_count(api_client, pid, manager_headers)
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks/capture",
        json={"text": "How's the weather?"},
        headers=manager_headers,
    )
    assert resp.status_code == 200
    after = await _task_count(api_client, pid, manager_headers)
    assert after == before


@pytest.mark.asyncio
async def test_capture_writes_no_task_row_unparseable(
    api_client: AsyncClient, manager_headers: dict, test_project: dict, set_llm_client
):
    pid = test_project["id"]
    set_llm_client(
        FakeLLMClient([("garbage", "gemini-3.6-flash"), ("still garbage", "gemini-3.6-flash")])
    )
    before = await _task_count(api_client, pid, manager_headers)
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks/capture",
        json={"text": "gibberish"},
        headers=manager_headers,
    )
    assert resp.status_code == 200
    after = await _task_count(api_client, pid, manager_headers)
    assert after == before


@pytest.mark.asyncio
async def test_capture_empty_text_rejected(
    api_client: AsyncClient, manager_headers: dict, test_project: dict, set_llm_client
):
    pid = test_project["id"]
    fake = set_llm_client(FakeLLMClient((_extraction_json([_task()]), "gemini-3.6-flash")))
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks/capture",
        json={"text": ""},
        headers=manager_headers,
    )
    assert resp.status_code == 422
    assert "error" in resp.json()
    assert fake.calls == []


@pytest.mark.asyncio
async def test_capture_text_too_long_rejected(
    api_client: AsyncClient, manager_headers: dict, test_project: dict, set_llm_client
):
    pid = test_project["id"]
    fake = set_llm_client(FakeLLMClient((_extraction_json([_task()]), "gemini-3.6-flash")))
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks/capture",
        json={"text": "x" * 4001},
        headers=manager_headers,
    )
    assert resp.status_code == 422
    assert "error" in resp.json()
    assert fake.calls == []


# ---------------------------------------------------------------------------
# POST /projects/{id}/tasks/capture/confirm — writes tasks, all-or-nothing
# ---------------------------------------------------------------------------


async def _default_story_id(api_client: AsyncClient, project_id: str, headers: dict) -> str:
    resp = await api_client.get(f"/api/v1/projects/{project_id}/stories", headers=headers)
    assert resp.status_code == 200
    backlog = next(s for s in resp.json()["items"] if s["is_default"])
    return backlog["id"]


@pytest.mark.asyncio
async def test_confirm_happy_path_defaults_to_backlog(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    backlog_id = await _default_story_id(api_client, pid, manager_headers)

    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks/capture/confirm",
        json={"tasks": [{"title": "Fix the login bug"}, {"title": "Write the release notes"}]},
        headers=manager_headers,
    )
    assert resp.status_code == 201
    created = resp.json()["created"]
    assert len(created) == 2
    assert created[0]["title"] == "Fix the login bug"
    assert created[1]["title"] == "Write the release notes"
    assert created[0]["story_id"] == backlog_id
    assert created[1]["story_id"] == backlog_id


@pytest.mark.asyncio
async def test_confirm_explicit_story_id_overrides_backlog(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    story_resp = await api_client.post(
        f"/api/v1/projects/{pid}/stories",
        json={"title": "Checkout Flow"},
        headers=manager_headers,
    )
    assert story_resp.status_code == 201
    story_id = story_resp.json()["id"]

    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks/capture/confirm",
        json={"tasks": [{"title": "Fix the checkout bug", "story_id": story_id}]},
        headers=manager_headers,
    )
    assert resp.status_code == 201
    created = resp.json()["created"]
    assert created[0]["story_id"] == story_id


@pytest.mark.asyncio
async def test_confirm_all_or_nothing_invalid_story_id(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    other_proj = await api_client.post(
        "/api/v1/projects", json={"name": "Other Project"}, headers=manager_headers
    )
    assert other_proj.status_code == 201
    other_pid = other_proj.json()["id"]
    other_story = await api_client.post(
        f"/api/v1/projects/{other_pid}/stories",
        json={"title": "Foreign Story"},
        headers=manager_headers,
    )
    assert other_story.status_code == 201
    foreign_story_id = other_story.json()["id"]

    before = await _task_count(api_client, pid, manager_headers)
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks/capture/confirm",
        json={
            "tasks": [
                {"title": "Valid task, first in batch"},
                {"title": "Invalid story task", "story_id": foreign_story_id},
            ]
        },
        headers=manager_headers,
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "STORY_NOT_FOUND"

    after = await _task_count(api_client, pid, manager_headers)
    assert after == before


@pytest.mark.asyncio
async def test_confirm_all_or_nothing_invalid_assignee_id(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    before = await _task_count(api_client, pid, manager_headers)
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks/capture/confirm",
        json={
            "tasks": [
                {"title": "Valid task, first in batch"},
                {"title": "Invalid assignee task", "assignee_id": str(uuid.uuid4())},
            ]
        },
        headers=manager_headers,
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "INVALID_ASSIGNEE"

    after = await _task_count(api_client, pid, manager_headers)
    assert after == before


@pytest.mark.asyncio
async def test_confirm_demo_account_forbidden(
    api_client: AsyncClient,
    manager_headers: dict,
    api_db: AsyncSession,
    test_project: dict,
):
    pid = test_project["id"]
    email = f"demo_{uuid.uuid4().hex[:8]}@test.com"
    with patch("app.core.email.send_email", new=AsyncMock()):
        await api_client.post(
            "/api/v1/auth/register",
            json={"email": email, "name": "Demo User", "password": "testpassword123"},
        )
    await api_db.execute(
        update(User).where(User.email == email).values(email_confirmed=True, is_demo=True)
    )
    await api_db.flush()
    login = await api_client.post(
        "/api/v1/auth/login", json={"email": email, "password": "testpassword123"}
    )
    demo_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    before = await _task_count(api_client, pid, manager_headers)
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks/capture/confirm",
        json={"tasks": [{"title": "Should not be created"}]},
        headers=demo_headers,
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "DEMO_ACCOUNT"

    after = await _task_count(api_client, pid, manager_headers)
    assert after == before


@pytest.mark.asyncio
async def test_confirm_non_member_forbidden(
    api_client: AsyncClient,
    manager_headers: dict,
    global_manager_headers: dict,
    test_project: dict,
):
    pid = test_project["id"]
    before = await _task_count(api_client, pid, manager_headers)
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks/capture/confirm",
        json={"tasks": [{"title": "Should not be created"}]},
        headers=global_manager_headers,
    )
    assert resp.status_code == 403

    after = await _task_count(api_client, pid, manager_headers)
    assert after == before


@pytest.mark.asyncio
async def test_confirm_project_not_found(api_client: AsyncClient, manager_headers: dict):
    resp = await api_client.post(
        f"/api/v1/projects/{uuid.uuid4()}/tasks/capture/confirm",
        json={"tasks": [{"title": "Fix the login bug"}]},
        headers=manager_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_confirm_batch_cap_rejected(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks/capture/confirm",
        json={"tasks": [{"title": f"Task {i}"} for i in range(21)]},
        headers=manager_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_confirm_extra_field_rejected(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks/capture/confirm",
        json={"tasks": [{"title": "Fix the login bug", "status": "done"}]},
        headers=manager_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_confirm_response_shape(
    api_client: AsyncClient,
    manager_headers: dict,
    api_db: AsyncSession,
    test_project: dict,
):
    pid = test_project["id"]
    _, member_id = await _register_member(api_client, api_db, manager_headers, pid, "Ada Lovelace")

    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks/capture/confirm",
        json={
            "tasks": [
                {
                    "title": "Fix the login bug",
                    "assignee_id": member_id,
                    "priority": "high",
                    "due_date": "2026-12-25",
                }
            ]
        },
        headers=manager_headers,
    )
    assert resp.status_code == 201
    task = resp.json()["created"][0]
    assert task["assignee_id"] == member_id
    assert task["priority"] == "high"
    assert task["due_date"] == "2026-12-25"
    assert task["status"] == "to_do"


@pytest.mark.asyncio
async def test_confirm_preserves_request_order(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks/capture/confirm",
        json={
            "tasks": [
                {"title": "Zebra crossing repair"},
                {"title": "Alpha review meeting"},
                {"title": "Middle task about mangoes"},
            ]
        },
        headers=manager_headers,
    )
    assert resp.status_code == 201
    titles = [t["title"] for t in resp.json()["created"]]
    assert titles == [
        "Zebra crossing repair",
        "Alpha review meeting",
        "Middle task about mangoes",
    ]


@pytest.mark.asyncio
async def test_confirm_no_assignee_stays_unassigned(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks/capture/confirm",
        json={"tasks": [{"title": "Fix the login bug", "assignee_id": None}]},
        headers=manager_headers,
    )
    assert resp.status_code == 201
    task = resp.json()["created"][0]
    assert task["assignee_id"] is None
