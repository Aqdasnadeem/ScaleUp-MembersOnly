"""P2-12: Pydantic validation with row-level errors.
One model per upload type. A row that fails becomes ONE entry {row, column, reason} in the bad-row report; good rows are kept
(FR-UP-09, BR-12). Wrong or missing columns are reported by mapping.check_mapping before any row is read.
The cleaning itself is done by cleaning.py (P2-13); the models only decide which rule applies to which field."""
from __future__ import annotations
import datetime as dt
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, ValidationError, ValidationInfo, field_validator
from . import cleaning as C

class RowIssue(BaseModel):
    row: int            # row number in the file (header is row 1)
    column: str         # column name as written in the user's file
    reason: str

class ValidationResult(BaseModel):
    total_rows: int
    good: list = Field(default_factory=list)            # [(row_number, model)]
    issues: list[RowIssue] = Field(default_factory=list)
    returned: int = 0                                   # sales lines with a negative quantity (returns / cancellations)
    returned_value: Decimal = Decimal("0")              # their value, |price x quantity| (or |total|), 0 if the row has no price

def _blank(v): return v is None or C.is_blank(v)

class _Row(BaseModel):
    model_config = ConfigDict(extra="ignore")

def _fmt(info: ValidationInfo) -> str:
    return (info.context or {}).get("date_format", "DD/MM/YYYY")

def _cost(v):
    if _blank(v): return None
    c = C.parse_number(v)
    if c < 0: raise C.CleaningError("negative cost")
    return C.money(c, "1e10")

class SalesRow(_Row):
    order_id: str
    product_code: Optional[str] = None
    product_name: Optional[str] = None
    date: dt.date
    quantity: int
    unit_price: Optional[Decimal] = Field(default=None, validate_default=True)
    total: Optional[Decimal] = Field(default=None, validate_default=True)     # after validation: the LINE TOTAL (BR-20)
    category: Optional[str] = None
    customer: Optional[str] = None
    cost_price: Optional[Decimal] = None

    @field_validator("order_id", mode="before")
    @classmethod
    def _oid(cls, v): return C.clean_text(v, 100)
    @field_validator("product_code", mode="before")
    @classmethod
    def _code(cls, v): return C.clean_text(v, 255)
    @field_validator("product_name", mode="before")
    @classmethod
    def _name(cls, v, info: ValidationInfo):
        nm = C.clean_name(v, 255, required=False)
        if nm is None and info.data.get("product_code") is None:
            raise C.CleaningError("empty")          # no code column: the name is the key and must be there
        return nm
    @field_validator("date", mode="before")
    @classmethod
    def _date(cls, v, info: ValidationInfo): return C.parse_date(v, _fmt(info))
    @field_validator("quantity", mode="before")
    @classmethod
    def _qty(cls, v):
        q = C.parse_integer(v)
        if q <= 0: raise C.CleaningError("must not be 0 (a return is a negative quantity)")
        return q
    @field_validator("unit_price", mode="before")
    @classmethod
    def _up(cls, v):
        if _blank(v): return None
        p = C.parse_number(v)
        if p < 0: raise C.CleaningError("negative price")
        return p
    @field_validator("total", mode="before")
    @classmethod
    def _total(cls, v, info: ValidationInfo):
        if "quantity" not in info.data: return None          # an earlier field already failed
        q, up = info.data["quantity"], info.data.get("unit_price")
        if up is not None:
            t = up * q
        elif not _blank(v):
            t = C.parse_number(v)
            if t < 0: raise ValueError("total::negative amount")
        else:
            raise ValueError("unit_price::empty (no price and no total)")
        try: t = C.money(t)
        except C.CleaningError: raise ValueError("unit_price::amount too large")
        if t / q >= Decimal("1e10"): raise ValueError("unit_price::amount too large")
        return t
    @field_validator("category", mode="before")
    @classmethod
    def _cat(cls, v): return C.clean_name(v, 100, required=False)
    @field_validator("customer", mode="before")
    @classmethod
    def _cust(cls, v): return C.clean_text(v, 255, required=False)
    @field_validator("cost_price", mode="before")
    @classmethod
    def _cp(cls, v): return _cost(v)

    @property
    def product_key(self): return self.product_code or self.product_name

class InventoryRow(_Row):
    product_code: Optional[str] = None
    product_name: Optional[str] = None
    stock_quantity: int
    date: Optional[dt.date] = Field(default=None, validate_default=True)
    cost_price: Optional[Decimal] = None

    @field_validator("product_code", mode="before")
    @classmethod
    def _code(cls, v): return C.clean_text(v, 255)
    @field_validator("product_name", mode="before")
    @classmethod
    def _name(cls, v, info: ValidationInfo):
        nm = C.clean_name(v, 255, required=False)
        if nm is None and info.data.get("product_code") is None:
            raise C.CleaningError("empty")
        return nm
    @field_validator("stock_quantity", mode="before")
    @classmethod
    def _stock(cls, v):
        s = C.parse_integer(v)
        if s < 0: raise C.CleaningError("negative stock")
        return s
    @field_validator("date", mode="before")
    @classmethod
    def _date(cls, v, info: ValidationInfo):
        if v is None: return (info.context or {}).get("snapshot")      # FR-UP-07: as-of date from the upload screen
        return C.parse_date(v, _fmt(info))
    @field_validator("cost_price", mode="before")
    @classmethod
    def _cp(cls, v): return _cost(v)

    @property
    def product_key(self): return self.product_code or self.product_name

class ExpenseRow(_Row):
    date: dt.date
    category: str
    amount: Decimal
    description: Optional[str] = None

    @field_validator("date", mode="before")
    @classmethod
    def _date(cls, v, info: ValidationInfo): return C.parse_date(v, _fmt(info))
    @field_validator("category", mode="before")
    @classmethod
    def _cat(cls, v): return C.clean_name(v, 100)
    @field_validator("amount", mode="before")
    @classmethod
    def _amt(cls, v):
        a = C.parse_number(v)
        if a < 0: raise C.CleaningError("negative amount (refunds not supported yet)")
        return C.money(a)
    @field_validator("description", mode="before")
    @classmethod
    def _desc(cls, v): return C.clean_text(v, 10000, required=False)

class FeedbackRow(_Row):
    date: dt.date
    review_text: str
    rating: Optional[int] = None
    review_id: Optional[str] = None
    product_name: Optional[str] = None

    @field_validator("date", mode="before")
    @classmethod
    def _date(cls, v, info: ValidationInfo): return C.parse_date(v, _fmt(info))
    @field_validator("review_text", mode="before")
    @classmethod
    def _txt(cls, v): return C.clean_text(v, 10000)
    @field_validator("rating", mode="before")
    @classmethod
    def _rating(cls, v):
        if _blank(v): return None
        r = C.parse_integer(v)
        if not 1 <= r <= 5: raise C.CleaningError("must be 1 to 5")
        return r
    @field_validator("review_id", mode="before")
    @classmethod
    def _rid(cls, v): return C.clean_text(v, 100, required=False)
    @field_validator("product_name", mode="before")
    @classmethod
    def _pn(cls, v): return C.clean_name(v, 255, required=False)

MODELS = {"sales": SalesRow, "inventory": InventoryRow, "expenses": ExpenseRow, "feedback": FeedbackRow}

def _first_issue(exc: ValidationError):
    """The first problem of a row: (field, reason). One bad row = one entry in the report."""
    e = exc.errors()[0]
    field = str(e["loc"][0]) if e["loc"] else "(row)"
    msg = e["msg"]
    if msg.startswith("Value error, "): msg = msg[len("Value error, "):]
    if "::" in msg: field, msg = msg.split("::", 1)
    if e["type"] == "missing": msg = "column not mapped"
    return field, msg

def _return_value(raw):
    """Sir, 5 Nov: a sales line with a NEGATIVE quantity is a return. It is counted apart, never loaded (revenue stays gross) and is
    not a bad row, so it cannot push a valid file over the 20% limit. Returns its value (0 if there is no price), or None if the row is not a return."""
    try:
        q = C.parse_integer(raw["quantity"])
    except Exception:
        return None
    if q >= 0:
        return None
    try:
        if not _blank(raw.get("unit_price")):
            return abs(C.parse_number(raw["unit_price"]) * q)
        if not _blank(raw.get("total")):
            return abs(C.parse_number(raw["total"]))
    except Exception:
        pass
    return Decimal("0")

def validate_rows(kind, header, norm, records, mapping, date_format, snapshot=None) -> ValidationResult:
    """records = [(row_number, cells)] from cleaning.read_csv. The mapping must already have passed mapping.check_mapping."""
    Model = MODELS[kind]
    mp = {k: v.strip().lower() for k, v in mapping.items() if v}
    idx = {k: norm.index(v) for k, v in mp.items()}
    col_name = {k: header[i] for k, i in idx.items()}
    ctx = {"date_format": date_format, "snapshot": snapshot}
    res = ValidationResult(total_rows=len(records))
    for rn, r in records:
        if len(r) > len(header) and not any(c.strip() for c in r[len(header):]):
            r = r[:len(header)]                                         # trailing empty cells are harmless
        if len(r) != len(header):
            res.issues.append(RowIssue(row=rn, column="(row)", reason="wrong number of columns: %d, header has %d" % (len(r), len(header))))
            continue
        raw = {k: r[i] for k, i in idx.items()}
        if kind == "sales" and "quantity" in raw:
            rv = _return_value(raw)
            if rv is not None:
                res.returned += 1
                res.returned_value += rv
                continue
        try:
            res.good.append((rn, Model.model_validate(raw, context=ctx)))
        except ValidationError as e:
            field, reason = _first_issue(e)
            res.issues.append(RowIssue(row=rn, column=col_name.get(field, field), reason=reason))
    return res
