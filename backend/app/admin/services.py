from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Project, Story, Task, User

ALLOWED_TREND_TABLES = frozenset(("users", "projects", "stories", "tasks"))


async def get_totals(db: AsyncSession) -> dict:
    users = await db.scalar(select(func.count()).select_from(User))
    projects = await db.scalar(select(func.count()).select_from(Project))
    stories = await db.scalar(select(func.count()).select_from(Story))
    tasks = await db.scalar(select(func.count()).select_from(Task))
    last_login = await db.scalar(select(func.max(User.last_login)))

    return {
        "users": users or 0,
        "projects": projects or 0,
        "stories": stories or 0,
        "tasks": tasks or 0,
        "last_login": last_login,
    }


async def get_weekly_trends(db: AsyncSession) -> dict[str, list[dict]]:
    result = {}
    for table_name in ("users", "projects", "stories", "tasks"):
        assert table_name in ALLOWED_TREND_TABLES, f"Unexpected table: {table_name}"
        rows = await db.execute(
            text(
                f"""
                WITH weeks AS (
                    SELECT generate_series(
                        date_trunc('week', NOW()) - '51 weeks'::interval,
                        date_trunc('week', NOW()),
                        '1 week'::interval
                    ) AS week
                )
                SELECT
                    w.week,
                    COALESCE(COUNT(t.created_at), 0) AS count
                FROM weeks w
                LEFT JOIN {table_name} t
                    ON date_trunc('week', t.created_at) = w.week
                GROUP BY w.week
                ORDER BY w.week
                """
            )
        )
        result[table_name] = [
            {"week": row.week.strftime("%Y-%m-%d"), "count": int(row.count)} for row in rows
        ]

    return result
