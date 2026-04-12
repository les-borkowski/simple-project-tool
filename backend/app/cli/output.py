from __future__ import annotations
import json
from datetime import datetime
from pathlib import Path
from rich.console import Console
from babel.dates import format_date as babel_format_date

LOCALES_DIR = Path(__file__).parent / "locales"
console = Console()
err_console = Console(stderr=True)

_strings: dict[str, str] = {}
_current_locale: str = "en-GB"


def load_locale(locale: str) -> None:
    global _strings, _current_locale
    path = LOCALES_DIR / f"{locale}.json"
    if not path.exists():
        path = LOCALES_DIR / "en-GB.json"
        locale = "en-GB"
    with open(path) as f:
        _strings = json.load(f)
    _current_locale = locale


def t(key: str, **kwargs: object) -> str:
    text = _strings.get(key, key)
    return text.format(**kwargs) if kwargs else text


def short_id(uuid_str: str) -> str:
    return str(uuid_str)[:8]


def fmt_date(dt_str: str | None) -> str:
    if not dt_str:
        return "—"
    dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
    fmt = "dd/MM/yyyy" if _current_locale == "en-GB" else "dd.MM.yyyy"
    babel_locale = _current_locale.replace("-", "_")
    return babel_format_date(dt, format=fmt, locale=babel_locale)


def fmt_duration(seconds: float | None) -> str:
    if seconds is None:
        return "—"
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    if h > 0 and m > 0:
        return t("duration.format", h=h, m=m)
    elif h > 0:
        return t("duration.hours_only", h=h)
    return t("duration.minutes_only", m=m)


def status_label(s: str) -> str:
    return t(f"status.{s}") if s else "—"


def priority_label(p: str) -> str:
    return t(f"priority.{p}") if p else "—"
