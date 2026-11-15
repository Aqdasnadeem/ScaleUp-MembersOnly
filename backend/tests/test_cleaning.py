"""P2-13: one test per cleaning rule. The before/after pairs here are the same ones printed in docs/CLEANING_RULES.md."""
import datetime as dt
from decimal import Decimal
import pytest
from app import config
from app import cleaning as C

# C1 text: control characters removed, spaces collapsed, trimmed
@pytest.mark.parametrize("before,after", [("  Blue   Pen ", "Blue Pen"), ("late\tdelivery\n", "late delivery"), ("ab\x00c", "abc")])
def test_c1_clean_text(before, after): assert C.clean_text(before, 100) == after
def test_c1_empty_required_is_error():
    with pytest.raises(C.CleaningError, match="empty"): C.clean_text("   ", 100)
def test_c1_too_long_is_error():
    with pytest.raises(C.CleaningError, match="too long"): C.clean_text("x" * 101, 100)

# C2 names: lowercase as well
@pytest.mark.parametrize("before,after", [(" Blue Pen ", "blue pen"), ("MOUSE", "mouse"), ("Mouse", "mouse")])
def test_c2_names_lowercase(before, after): assert C.clean_name(before, 100) == after

# C3 numbers
@pytest.mark.parametrize("before,after", [("Rs 1,200.50", "1200.50"), ("1200", "1200"), ("PKR 99", "99"), ("(500)", "-500"), ("$3.5", "3.5"), (" +7 ", "7")])
def test_c3_numbers(before, after): assert C.parse_number(before) == Decimal(after)
@pytest.mark.parametrize("bad,why", [("1200,50", "ambiguous comma"), ("12abc", "not a number"), ("", "empty"), ("n/a", "empty")])
def test_c3_refused(bad, why):
    with pytest.raises(C.CleaningError, match=why): C.parse_number(bad)
def test_c3_money_two_decimals(): assert C.money(Decimal("12.3")) == Decimal("12.30") and C.money(Decimal("2.345")) == Decimal("2.34")   # half-even rounding
def test_c3_money_too_large():
    with pytest.raises(C.CleaningError, match="too large"): C.money(Decimal("1e12"))

# C4 whole numbers
def test_c4_integer_ok(): assert C.parse_integer("3.0") == 3 and C.parse_integer("1,000") == 1000
def test_c4_integer_fraction_refused():
    with pytest.raises(C.CleaningError, match="whole"): C.parse_integer("2.5")

# C5 blank markers
@pytest.mark.parametrize("v", ["", " ", "N/A", "null", "None", "nan", "-", "--"])
def test_c5_blank_markers(v): assert C.is_blank(v)
def test_c5_blank_optional_text_is_none(): assert C.clean_text("n/a".replace("n/a", "   "), 10, required=False) is None

# C6 dates: the business format decides
def test_c6_same_text_two_formats():
    assert C.parse_date("02/11/2026", "DD/MM/YYYY") == dt.date(2026, 11, 2)
    assert C.parse_date("02/11/2026", "MM/DD/YYYY") == dt.date(2026, 2, 11)
@pytest.mark.parametrize("before,after", [("2026-10-03", dt.date(2026, 10, 3)), ("3.10.2026", dt.date(2026, 10, 3)), ("03-10-2026", dt.date(2026, 10, 3)),
                                          ("03/10/2026 14:30", dt.date(2026, 10, 3)), ("2026-10-03T09:00:00", dt.date(2026, 10, 3))])
def test_c6_formats_and_time_dropped(before, after): assert C.parse_date(before, "DD/MM/YYYY") == after
@pytest.mark.parametrize("bad,why", [("31/02/2026", "not a real date"), ("hello", "does not match"), ("01/01/1999", "out of range"), ("01/01/2999", "out of range"), ("", "empty")])
def test_c6_refused(bad, why):
    with pytest.raises(C.CleaningError, match=why): C.parse_date(bad, "DD/MM/YYYY")
def test_c6_today_in_karachi_ok_tomorrow_refused(monkeypatch):
    """Sir, 5 Nov: the latest allowed date is TODAY in Asia/Karachi (not the server's day, not yesterday). Both limits are in config."""
    karachi_today = config.today_local()
    assert C.parse_date(karachi_today.strftime("%d/%m/%Y"), "DD/MM/YYYY") == karachi_today
    with pytest.raises(C.CleaningError): C.parse_date((karachi_today + dt.timedelta(days=1)).strftime("%d/%m/%Y"), "DD/MM/YYYY")
    assert C.parse_date("01/01/2000", "DD/MM/YYYY") == dt.date(2000, 1, 1)
    with pytest.raises(C.CleaningError): C.parse_date("31/12/1999", "DD/MM/YYYY")
    monkeypatch.setattr(config, "DATE_MAX_DAYS_AHEAD", 1)                 # the limit is a setting, not a constant in the logic
    assert C.parse_date((karachi_today + dt.timedelta(days=1)).strftime("%d/%m/%Y"), "DD/MM/YYYY")

def test_c6_karachi_day_is_used_not_the_server_day(monkeypatch):
    """At 20:00 UTC on 4 Nov it is already 5 Nov 01:00 in Karachi (UTC+5): a sale dated 5 Nov must be accepted."""
    class FakeNow(dt.datetime):
        @classmethod
        def now(cls, tz=None): return dt.datetime(2026, 11, 4, 20, 0, tzinfo=dt.timezone.utc).astimezone(tz)
    monkeypatch.setattr(config.dt, "datetime", FakeNow)
    assert config.today_local() == dt.date(2026, 11, 5)
    assert C.parse_date("05/11/2026", "DD/MM/YYYY") == dt.date(2026, 11, 5)

# C9 reading the file
def test_c9_delimiters():
    for d in (",", ";", "\t", "|"):
        h, n, rows, w = C.read_csv(("a%sb\n1%s2\n" % (d, d)).encode())
        assert h == ["a", "b"] and rows[0][1] == ["1", "2"]
def test_c9_bom_and_cp1252():
    assert C.read_csv("﻿a,b\n1,2\n".encode("utf-8"))[0] == ["a", "b"]
    h, n, rows, w = C.read_csv("a,b\ncaf\xe9,2\n".encode("cp1252"))
    assert rows[0][1][0] == "café" and "Windows-1252" in w[0]
def test_c9_empty_lines_ignored():
    assert len(C.read_csv(b"a,b\n\n1,2\n\n3,4\n")[2]) == 2
@pytest.mark.parametrize("raw,why", [(b"", "empty"), (b"PK\x03\x04abc", "not a CSV"), (b"%PDF-1.4", "not a CSV"), (b"a,a\n1,2\n", "duplicate"), (b"a,b\n", "no data rows")])
def test_c9_whole_file_refused(raw, why):
    with pytest.raises(C.FileProblem, match=why): C.read_csv(raw)
