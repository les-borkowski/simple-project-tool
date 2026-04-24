def test_short_id():
    from app.cli.output import short_id

    assert short_id("12345678-abcd-efgh-ijkl-mnopqrstuvwx") == "12345678"


def test_t_returns_key_if_missing():
    from app.cli import output

    output._strings = {}
    assert output.t("missing.key") == "missing.key"


def test_t_returns_translation():
    from app.cli import output

    output._strings = {"status.done": "Done"}
    assert output.t("status.done") == "Done"


def test_t_formats_kwargs():
    from app.cli import output

    output._strings = {"duration.format": "{h}h {m}m"}
    assert output.t("duration.format", h=2, m=30) == "2h 30m"


def test_fmt_duration_hours_only():
    from app.cli import output

    output._strings = {
        "duration.hours_only": "{h}h",
        "duration.minutes_only": "{m}m",
        "duration.format": "{h}h {m}m",
    }
    assert output.fmt_duration(7200) == "2h"


def test_fmt_duration_minutes_only():
    from app.cli import output

    output._strings = {
        "duration.hours_only": "{h}h",
        "duration.minutes_only": "{m}m",
        "duration.format": "{h}h {m}m",
    }
    assert output.fmt_duration(1800) == "30m"


def test_fmt_duration_hours_and_minutes():
    from app.cli import output

    output._strings = {
        "duration.hours_only": "{h}h",
        "duration.minutes_only": "{m}m",
        "duration.format": "{h}h {m}m",
    }
    assert output.fmt_duration(9000) == "2h 30m"


def test_fmt_duration_none():
    from app.cli import output

    assert output.fmt_duration(None) == "—"


def test_fmt_date_en_gb():
    from app.cli import output

    output._current_locale = "en-GB"
    result = output.fmt_date("2024-03-15T10:00:00Z")
    assert result == "15/03/2024"


def test_fmt_date_pl():
    from app.cli import output

    output._current_locale = "pl"
    result = output.fmt_date("2024-03-15T10:00:00Z")
    assert result == "15.03.2024"


def test_fmt_date_none():
    from app.cli import output

    assert output.fmt_date(None) == "—"


def test_load_locale_loads_strings(tmp_path):
    import json
    from unittest.mock import patch

    from app.cli import output

    locale_dir = tmp_path / "locales"
    locale_dir.mkdir()
    (locale_dir / "en-GB.json").write_text(json.dumps({"status.done": "Done"}))
    with patch.object(output, "LOCALES_DIR", locale_dir):
        output.load_locale("en-GB")
    assert output._strings["status.done"] == "Done"


def test_load_locale_falls_back_to_en_gb(tmp_path):
    import json
    from unittest.mock import patch

    from app.cli import output

    locale_dir = tmp_path / "locales"
    locale_dir.mkdir()
    (locale_dir / "en-GB.json").write_text(json.dumps({"key": "val"}))
    with patch.object(output, "LOCALES_DIR", locale_dir):
        output.load_locale("unknown-locale")
    assert output._strings["key"] == "val"
