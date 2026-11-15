"""P2-13: cleaning rules. Pure functions, no database. Every rule has an ID (C1..C10) that is documented with a
before/after example in docs/CLEANING_RULES.md and tested in tests/test_cleaning.py.
A function that cannot clean a value raises CleaningError(reason); the validation layer (schemas.py) turns it into a
row/column/reason entry of the bad-row report (FR-UP-09)."""
import csv
import datetime as dt
import io
import re
from decimal import Decimal
from . import config

class CleaningError(ValueError):
    pass

class FileProblem(Exception):
    """The whole file is unusable (BR-11): empty, not text, duplicate header, no data rows."""

NA = {"", "n/a", "na", "null", "none", "nan", "-", "--"}
_CUR = r"(?:rs\.?|pkr|usd|\$|£|€)"
_CUR_START = re.compile(r"^" + _CUR + r"\s*", re.I)
_CUR_END = re.compile(r"\s*" + _CUR + r"$", re.I)
_THOUSANDS = re.compile(r"^[0-9]{1,3}(,[0-9]{3})+(\.[0-9]+)?$")
_PLAIN = re.compile(r"^[0-9]+(\.[0-9]+)?$")
_TIME = re.compile(r"^(.+?)[ T]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?\s*([ap]m)?$", re.I)

def is_blank(s) -> bool:
    """C5: blank markers (empty, n/a, null, none, nan, -, --) mean 'no value'."""
    return s is None or s.strip().lower() in NA

# C1 / C2
def clean_text(s: str, maxlen: int, required: bool = True):
    """C1: remove control characters, collapse repeated spaces, trim. C5: blank optional text -> None."""
    t = re.sub(r"[\x00-\x08\x0b-\x1f\x7f]", "", s)
    t = re.sub(r"\s+", " ", t).strip()
    if not t:
        if required:
            raise CleaningError("empty")
        return None
    if len(t) > maxlen:
        raise CleaningError("too long (max %d characters)" % maxlen)
    return t

def clean_name(s: str, maxlen: int, required: bool = True):
    """C2: names (product, category, expense category) are also lowercased, so 'Mouse' and ' mouse ' are one value."""
    t = clean_text(s, maxlen, required)
    return t.lower() if t else None

# C3
def parse_number(s: str) -> Decimal:
    """C3: 'Rs 1,200.50' -> 1200.50; '(500)' -> -500; '1200,50' is refused (could be 120050)."""
    t = s.strip()
    if t.lower() in NA:
        raise CleaningError("empty")
    neg = False
    if t.startswith("(") and t.endswith(")"):
        neg, t = True, t[1:-1].strip()
    t = _CUR_END.sub("", _CUR_START.sub("", t)).replace(" ", "").replace(" ", "")
    if t[:1] in ("+", "-"):
        if neg:
            raise CleaningError("not a number")
        neg, t = t[0] == "-", t[1:]
    if "," in t:
        if not _THOUSANDS.match(t):
            raise CleaningError("ambiguous comma (use 1200.50 or 1,200.50)")
        t = t.replace(",", "")
    elif not _PLAIN.match(t):
        raise CleaningError("not a number")
    d = Decimal(t)
    return -d if neg else d

def parse_integer(s: str) -> int:
    """C4: whole numbers only; '3.0' -> 3, '2.5' is refused."""
    d = parse_number(s)
    if d != d.to_integral_value():
        raise CleaningError("not a whole number")
    if abs(d) > 2_000_000_000:
        raise CleaningError("number too large")
    return int(d)

def money(d: Decimal, limit: str = "1e12") -> Decimal:
    """C3: money is stored with 2 decimals; absurd sizes are refused."""
    d = d.quantize(Decimal("0.01"))
    if abs(d) >= Decimal(limit):
        raise CleaningError("amount too large")
    return d

# C6
def parse_date(s: str, date_format: str) -> dt.date:
    """C6: the date convention is the business setting (BR-21): DD/MM/YYYY or MM/DD/YYYY. ISO YYYY-MM-DD is always accepted.
    A time of day is dropped. 31/02/2026 is refused. Dates before DATE_MIN or after today (Asia/Karachi, see config) are refused (BR-22)."""
    t = s.strip()
    if t.lower() in NA:
        raise CleaningError("empty")
    m = _TIME.match(t)
    if m:
        t = m.group(1).strip()
    if re.fullmatch(r"\d{4}-\d{1,2}-\d{1,2}", t):
        y, mo, d = map(int, t.split("-"))
    elif re.fullmatch(r"\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4}", t):
        a, b, y = map(int, re.split(r"[/.\-]", t))
        d, mo = (a, b) if date_format == "DD/MM/YYYY" else (b, a)
    else:
        raise CleaningError("date does not match " + date_format)
    try:
        v = dt.date(y, mo, d)
    except ValueError:
        raise CleaningError("not a real date")
    if v < config.DATE_MIN or v > config.today_local() + dt.timedelta(days=config.DATE_MAX_DAYS_AHEAD):
        raise CleaningError("date out of range (%s to today)" % config.DATE_MIN.isoformat())
    return v

# C9: reading the file
def read_csv(raw: bytes):
    """C9: UTF-8 (BOM ok) or Windows-1252; delimiter comma, semicolon, tab or pipe detected from the header line;
    empty lines ignored; Excel/PDF/binary refused. Returns (header, normalised_header, [(file_row_number, cells)], warnings)."""
    if not raw.strip():
        raise FileProblem("file is empty")
    if b"\x00" in raw[:4096] or raw[:2] == b"PK" or raw[:4] == b"%PDF":
        raise FileProblem("not a CSV text file (looks like Excel, PDF or binary)")
    warnings = []
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1252", errors="replace")
        warnings.append("file is not UTF-8; read as Windows-1252")
    first = next((l for l in text.splitlines() if l.strip()), "")
    counts = {d: first.count(d) for d in [",", ";", "\t", "|"]}
    delim = max(counts, key=counts.get) if max(counts.values()) else ","
    rows = list(csv.reader(io.StringIO(text, newline=""), delimiter=delim))
    rows = [(i + 1, r) for i, r in enumerate(rows)]
    rows = [(n, r) for n, r in rows if any(c.strip() for c in r)]
    if not rows:
        raise FileProblem("file is empty")
    header = [h.strip() for h in rows[0][1]]
    while header and header[-1] == "":
        header.pop()
    norm = [h.lower() for h in header]
    if len(set(norm)) != len(norm):
        raise FileProblem("duplicate column names in header")
    if len(rows) < 2:
        raise FileProblem("file has a header but no data rows")
    return header, norm, rows[1:], warnings
