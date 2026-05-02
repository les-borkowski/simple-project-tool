import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_project_comments_returns_author_names(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    """Comments list populates author_name for all items."""
    project_id = test_project["id"]

    for i in range(3):
        resp = await api_client.post(
            f"/api/v1/projects/{project_id}/comments",
            json={"body": f"Comment {i}"},
            headers=manager_headers,
        )
        assert resp.status_code == 201

    resp = await api_client.get(
        f"/api/v1/projects/{project_id}/comments",
        headers=manager_headers,
    )
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 3
    assert all(c["author_name"] for c in items)


@pytest.mark.asyncio
async def test_list_story_comments_returns_author_names(
    api_client: AsyncClient, manager_headers: dict, test_project: dict, test_story: dict
):
    """Story comments list populates author_name."""
    story_id = test_story["id"]

    for i in range(2):
        resp = await api_client.post(
            f"/api/v1/stories/{story_id}/comments",
            json={"body": f"Story comment {i}"},
            headers=manager_headers,
        )
        assert resp.status_code == 201

    resp = await api_client.get(
        f"/api/v1/stories/{story_id}/comments",
        headers=manager_headers,
    )
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 2
    assert all(c["author_name"] for c in items)


@pytest.mark.asyncio
async def test_list_task_comments_returns_author_names(
    api_client: AsyncClient, manager_headers: dict, test_story: dict
):
    """Task comments list populates author_name."""
    story_id = test_story["id"]

    task_resp = await api_client.post(
        f"/api/v1/stories/{story_id}/tasks",
        json={"title": "Test Task"},
        headers=manager_headers,
    )
    assert task_resp.status_code == 201
    task_id = task_resp.json()["id"]

    for i in range(2):
        resp = await api_client.post(
            f"/api/v1/tasks/{task_id}/comments",
            json={"body": f"Task comment {i}"},
            headers=manager_headers,
        )
        assert resp.status_code == 201

    resp = await api_client.get(
        f"/api/v1/tasks/{task_id}/comments",
        headers=manager_headers,
    )
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 2
    assert all(c["author_name"] for c in items)
