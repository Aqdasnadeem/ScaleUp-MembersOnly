"""P2-53: one test per feedback text rule (F1 to F5) and the duplicate rule (F6).
Pure unit tests: no database. The before/after pairs are the same ones in docs/FEEDBACK_RULES.md."""
import datetime as dt
import pytest
from pydantic import ValidationError
from app import schemas

CTX = {"date_format": "DD/MM/YYYY"}

def row(**kw):
    base = {"date": "03/10/2026", "review_text": "Good", "rating": "5"}
    base.update(kw)
    return schemas.FeedbackRow.model_validate(base, context=CTX)

def error_text(**kw):
    with pytest.raises(ValidationError) as e:
        row(**kw)
    return str(e.value)

# F1 review text: control characters out, spaces collapsed, trimmed; empty is refused
@pytest.mark.parametrize("before,after", [("  Great   product!\n", "Great product!"), ("late\tdelivery", "late delivery"), ("ok\x00ay", "okay")])
def test_f1_review_text_is_cleaned(before, after):
    assert row(review_text=before).review_text == after

def test_f1_empty_review_is_refused():
    assert "empty" in error_text(review_text="   ")

def test_f1_review_over_10000_characters_is_refused():
    assert "too long" in error_text(review_text="x" * 10001)

# F2 rating: optional; whole number 1 to 5; "3.0" is 3; "2.5" and out-of-range values are refused
@pytest.mark.parametrize("before,after", [("5", 5), ("3.0", 3), ("1", 1)])
def test_f2_rating_accepted(before, after):
    assert row(rating=before).rating == after

def test_f2_blank_rating_is_allowed():
    assert row(rating="").rating is None

@pytest.mark.parametrize("bad,why", [("2.5", "not a whole number"), ("9", "must be 1 to 5"), ("0", "must be 1 to 5")])
def test_f2_rating_refused(bad, why):
    assert why in error_text(rating=bad)

# F3 review id: optional, trimmed, max 100; blank means no id
def test_f3_review_id_trimmed():
    assert row(review_id="  R-001 ").review_id == "R-001"

def test_f3_blank_review_id_is_none():
    assert row(review_id="   ").review_id is None

# F4 product name: optional, lowercase, same key as sales/inventory (C2)
def test_f4_product_name_lowercased_and_trimmed():
    assert row(product_name=" Blue Pen ").product_name == "blue pen"

def test_f4_blank_product_name_is_none():
    assert row(product_name="").product_name is None

# F5 date: same convention as the other uploads (C6)
def test_f5_date_uses_business_format():
    assert row(date="03/10/2026").date == dt.date(2026, 10, 3)

# F6 duplicates: the real transform() decides the key (same as the prototype test in run_tests.py).
from app.transform import transform

def _hashes(*rows):
    out, _, _ = transform("feedback", [(i + 2, r) for i, r in enumerate(rows)])
    return [r["hash"] for r in out]

def test_f6_same_review_id_is_one_review():
    h = _hashes(row(review_id="R-1", review_text="a"), row(review_id="R-1", review_text="b"))
    assert len(set(h)) == 1

def test_f6_no_id_same_date_and_text_is_one_review():
    h = _hashes(row(review_text="Same"), row(review_text="  Same  "))
    assert len(set(h)) == 1

def test_f6_same_text_on_another_date_is_kept():
    h = _hashes(row(review_text="Same", date="01/11/2026"), row(review_text="Same", date="02/11/2026"))
    assert len(set(h)) == 2

def test_f6_reupload_gives_the_same_keys():
    assert _hashes(row(review_text="Good")) == _hashes(row(review_text="Good"))
