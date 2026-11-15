"""P2-12: Pydantic validation with row-level errors. Criteria: wrong column names reported clearly; bad rows listed; good rows not lost."""
import json
import os
import pytest
from app import cleaning as C
from app.mapping import check_mapping, suggest_mapping
from app.schemas import validate_rows, SalesRow

FMT = "DD/MM/YYYY"

def run(kind, text, mapping=None, snapshot=None):
    header, norm, recs, _ = C.read_csv(text.encode())
    mapping = mapping if mapping is not None else suggest_mapping(header, kind)
    assert check_mapping(kind, mapping, header, snapshot) == []
    return validate_rows(kind, header, norm, recs, mapping, FMT, snapshot)

SALES = "Order No,Date,SKU,Product,Qty,Unit Price,Customer\n"

def test_wrong_column_name_is_named():
    header = ["Order No", "Date", "SKU", "Qty", "Unit Price"]
    p = check_mapping("sales", {"order_id": "Invoice", "date": "Date", "product_code": "SKU", "quantity": "Qty", "unit_price": "Unit Price"}, header)
    assert p == ['mapped column not found in file: order_id -> "Invoice"']
def test_missing_required_field_is_named():
    p = check_mapping("sales", {"order_id": "Order No", "date": "Date"}, ["Order No", "Date"])
    assert "required field not mapped: quantity, product_code or product_name, unit_price or total" in p[0]
def test_inventory_needs_date_or_snapshot():
    m = {"product_code": "SKU", "stock_quantity": "Stock"}
    assert check_mapping("inventory", m, ["SKU", "Stock"])
    assert check_mapping("inventory", m, ["SKU", "Stock"], snapshot="2026-09-01") == []

def test_bad_rows_listed_good_rows_kept():
    r = run("sales", SALES + "A1,03/10/2026,P1,Pen,2,10,C1\nA2,31/02/2026,P1,Pen,2,10,C1\nA3,03/10/2026,P2,Cap,0,10,C2\nA4,03/10/2026,P3,Mug,x,10,C3\nA5,03/10/2026,P4,Bag,1,Rs 50,C4\n")
    assert r.total_rows == 5 and len(r.good) == 2
    got = [(i.row, i.column, i.reason) for i in r.issues]
    assert got == [(3, "Date", "not a real date"), (4, "Qty", "must not be 0 (a return is a negative quantity)"), (5, "Qty", "not a number")]
def test_one_bad_row_is_one_entry_even_with_two_problems():
    r = run("sales", SALES + "A1,31/02/2026,P1,Pen,0,10,C1\n" + "".join("B%d,03/10/2026,P1,Pen,1,10,\n" % i for i in range(9)))
    assert len(r.issues) == 1 and r.issues[0].column == "Date"
def test_row_with_wrong_number_of_cells():
    r = run("sales", SALES + "A1,03/10/2026,P1,Pen,2\n")
    assert r.issues[0].column == "(row)" and "wrong number of columns" in r.issues[0].reason
def test_json_report_shape():
    r = run("sales", SALES + "A1,31/02/2026,P1,Pen,2,10,C1\n")
    assert json.loads(json.dumps([i.model_dump() for i in r.issues])) == [{"row": 2, "column": "Date", "reason": "not a real date"}]
def test_total_only_file_derives_price_and_checks_negative():
    r = run("sales", "Order,Date,SKU,Qty,Total\nA1,03/10/2026,P1,4,100\nA2,03/10/2026,P1,1,-5\n")
    assert r.good[0][1].total == 100 and r.issues[0].reason == "negative amount"
def test_inventory_uses_snapshot_date():
    r = run("inventory", "SKU,Stock\nP1,5\nP2,-1\n", snapshot=__import__("datetime").date(2026, 9, 1))
    assert r.good[0][1].date.isoformat() == "2026-09-01" and r.issues[0].reason == "negative stock"
def test_expense_and_feedback_rules():
    e = run("expenses", "Date,Category,Amount\n03/10/2026, Rent ,\"Rs 1,200\"\n03/10/2026,Tea,-5\n")
    assert e.good[0][1].category == "rent" and e.good[0][1].amount == 1200 and e.issues[0].reason.startswith("negative amount")
    f = run("feedback", "Date,Review,Rating\n03/10/2026,Great,5\n03/10/2026,Bad,9\n03/10/2026,  ,3\n")
    assert [i.reason for i in f.issues] == ["must be 1 to 5", "empty"]
def test_name_is_key_only_when_no_code_column():
    r = run("sales", "Order,Date,Product,Qty,Price\nA1,03/10/2026, Blue Pen ,1,5\nA2,03/10/2026,,1,5\n")
    assert r.good[0][1].product_key == "blue pen" and r.issues[0].column == "Product"

@pytest.mark.parametrize("bad_rows,total,ok", [(19, 100, True), (20, 100, True), (21, 100, False)])
def test_20_percent_rule_numbers(bad_rows, total, ok):
    """BR-12: exactly 20% still loads. (The limit itself is applied in pipeline.process_job; here we check the counts.)"""
    from app import config
    r = run("sales", SALES + "".join(("X%d,31/02/2026,P,Pen,1,1,\n" if i < bad_rows else "X%d,03/10/2026,P,Pen,1,1,\n") % i for i in range(total)))
    assert len(r.issues) == bad_rows
    assert (len(r.issues) / r.total_rows <= config.BAD_ROW_LIMIT) is ok

def test_sample_bad_file_report_matches_saved_json():
    base = os.path.join(os.path.dirname(__file__), "..", "sample")
    text = open(os.path.join(base, "bad_sales.csv"), encoding="utf-8").read()
    r = run("sales", text)
    saved = json.load(open(os.path.join(base, "bad_sales_errors.json")))
    assert [i.model_dump() for i in r.issues] == saved
