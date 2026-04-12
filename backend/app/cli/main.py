from __future__ import annotations
import typer
from .commands import auth
from .commands import projects
from .commands import stories
from .commands import tasks
from .commands import comments
from .commands import invitations
from .commands import time_tracking
from .commands import config_cmd

app = typer.Typer(name="spt", help="Simple Project Tool CLI", no_args_is_help=True)

app.add_typer(auth.app, name="auth")
app.add_typer(projects.app, name="projects")
app.add_typer(stories.app, name="stories")
app.add_typer(tasks.app, name="tasks")
app.add_typer(comments.app, name="comments")
app.add_typer(invitations.app, name="invitations")
app.add_typer(config_cmd.app, name="config")

app.command("time-metrics")(time_tracking.time_metrics)
app.command("time-history")(time_tracking.time_history)
app.command("time-report")(time_tracking.time_report)

if __name__ == "__main__":
    app()
