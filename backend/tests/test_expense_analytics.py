import datetime as dt
from decimal import Decimal
import hashlib
import os
import uuid

from fastapi.testclient import TestClient

os.environ["EXPENSE_RUPEE_THRESHOLD"] = "1000"

from app.expense_flags import category_summary, flag_categories
from app.main import app
from tests.conftest import make_token

client = TestClient(app)
TARGET = dt.date(2026, 10, 1)


def add_expense_upload(conn, business_id, month, entries, status="completed", rejected=0, day=15):
    cur = conn.cursor()
    file_hash = hashlib.sha256(uuid.uuid4().bytes).hexdigest()
    cur.execute(
        """
        INSERT INTO ingestion_jobs (
            business_id, upload_type, file_name, file_hash, status,
            total_rows, loaded_rows, rejected_rows
        )
        VALUES (%s, 'expenses', %s, %s, %s, %s, %s, %s)
        RETURNING job_id
        """,
        (
            business_id,
            "expenses-%s.csv" % month.strftime("%Y-%m"),
            file_hash,
            status,
            len(entries) + rejected,
            len(entries),
            rejected,
        ),
    )
    job_id = cur.fetchone()[0]
    for index, (category, amount) in enumerate(entries):
        row_hash = hashlib.sha256(("%s:%s" % (job_id, index)).encode()).hexdigest()
        cur.execute(
            """
            INSERT INTO expenses (
                business_id, job_id, expense_date, category, amount, row_hash
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                business_id,
                job_id,
                month.replace(day=day),
                category,
                Decimal(str(amount)),
                row_hash,
            ),
        )
    conn.commit()
    return job_id


def shift_month(month, offset):
    ordinal = month.year * 12 + month.month - 1 + offset
    return dt.date(ordinal // 12, ordinal % 12 + 1, 1)


def seed_category_history(conn, business_id, values, category="rent", target=TARGET):
    for offset, amount in zip(range(-6, 0), values):
        add_expense_upload(
            conn,
            business_id,
            shift_month(target, offset),
            [(category, amount)],
        )
    return add_expense_upload(
        conn,
        business_id,
        target,
        [(category, values[-1] if len(values) > 6 else 100)],
    )


def token_headers(business_id):
    return {"Authorization": "Bearer " + make_token(business_id)}


def test_category_summary_calculates_totals_and_month_over_month_change(conn, biz):
    previous = shift_month(TARGET, -1)
    add_expense_upload(conn, biz, previous, [("Rent", 100), ("Utilities", 40)])
    add_expense_upload(conn, biz, TARGET, [("rent", 150), ("Utilities", 40)])

    summary = category_summary(conn, biz, TARGET)
    by_category = {item["category"]: item for item in summary["items"]}

    assert summary["month"] == "2026-10"
    assert summary["previous_month"] == "2026-09"
    assert by_category["rent"]["total_amount"] == Decimal("150.00")
    assert by_category["rent"]["previous_month_total"] == Decimal("100.00")
    assert by_category["rent"]["percentage_change"] == Decimal("50.00")
    assert by_category["utilities"]["percentage_change"] == Decimal("0.00")


def test_category_summary_returns_null_when_previous_month_is_missing(conn, biz):
    add_expense_upload(conn, biz, TARGET, [("rent", 100)])

    item = category_summary(conn, biz, TARGET)["items"][0]

    assert item["previous_month_total"] is None
    assert item["percentage_change"] is None


def test_category_summary_is_empty_without_expenses(conn, biz):
    assert category_summary(conn, biz, TARGET)["items"] == []


def test_category_entries_filter_month_category_and_business(conn, biz):
    other_business = conn.cursor()
    other_business.execute(
        "INSERT INTO businesses(business_name) VALUES ('Other') RETURNING business_id"
    )
    other_biz = other_business.fetchone()[0]
    conn.commit()
    previous = shift_month(TARGET, -1)
    add_expense_upload(conn, biz, TARGET, [("rent", 100), ("utilities", 50)])
    add_expense_upload(conn, biz, previous, [("rent", 20)])
    add_expense_upload(conn, other_biz, TARGET, [("rent", 999)])

    response = client.get(
        "/expenses/categories/RENT/entries?month=2026-10",
        headers=token_headers(biz),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["category"] == "rent"
    assert [item["amount"] for item in body["items"]] == [100.0]


def test_category_api_requires_authentication_and_valid_month(biz):
    assert client.get("/expenses/categories?month=2026-10").status_code == 401
    response = client.get(
        "/expenses/categories?month=2026-13",
        headers=token_headers(biz),
    )
    assert response.status_code == 422


def test_category_api_keeps_business_data_isolated(conn, biz):
    other_business = conn.cursor()
    other_business.execute(
        "INSERT INTO businesses(business_name) VALUES ('Other') RETURNING business_id"
    )
    other_biz = other_business.fetchone()[0]
    conn.commit()
    add_expense_upload(conn, biz, TARGET, [("rent", 10)])
    add_expense_upload(conn, other_biz, TARGET, [("rent", 999)])

    response = client.get(
        "/expenses/categories?month=2026-10",
        headers=token_headers(biz),
    )

    assert response.status_code == 200
    assert response.json()["items"][0]["total_amount"] == 10.0


def test_percentage_increase_below_threshold_not_flagged(conn, biz):
    """50% increase but rupee increase only 50 (below PKR 1000 threshold)"""
    previous = shift_month(TARGET, -1)
    add_expense_upload(conn, biz, previous, [("rent", 100)])
    add_expense_upload(conn, biz, TARGET, [("rent", 150)])

    assert flag_categories(conn, biz, TARGET) == []
    item = category_summary(conn, biz, TARGET)["items"][0]
    assert item["anomaly_status"] == "normal"
    assert item["unusual_increase"] is False


def test_rupee_increase_below_threshold_not_flagged(conn, biz):
    """Rupee increase 1500 but percentage only 15% (below 50% threshold)"""
    previous = shift_month(TARGET, -1)
    add_expense_upload(conn, biz, previous, [("rent", 10000)])
    add_expense_upload(conn, biz, TARGET, [("rent", 11500)])

    assert flag_categories(conn, biz, TARGET) == []
    item = category_summary(conn, biz, TARGET)["items"][0]
    assert item["anomaly_status"] == "normal"
    assert item["unusual_increase"] is False


def test_both_thresholds_exceeded_flagged(conn, biz):
    """Percentage 100% and rupee increase 5000 - both thresholds exceeded"""
    previous = shift_month(TARGET, -1)
    add_expense_upload(conn, biz, previous, [("rent", 5000)])
    add_expense_upload(conn, biz, TARGET, [("rent", 10000)])

    flags = flag_categories(conn, biz, TARGET)

    assert len(flags) == 1
    assert flags[0]["category"] == "rent"
    assert flags[0]["observed"] == Decimal("10000.00")
    assert flags[0]["expected"] == Decimal("5000.00")
    assert flags[0]["percentage_increase"] == Decimal("100.00")
    assert flags[0]["rupee_increase"] == Decimal("5000.00")
    assert {"category", "observed", "expected", "percentage_increase", "rupee_increase"} <= flags[0].keys()

    item = category_summary(conn, biz, TARGET)["items"][0]
    assert item["anomaly_status"] == "flagged"
    assert item["unusual_increase"] is True
    assert item["anomaly_score"] == Decimal("100.00")


def test_exactly_50_percent_not_flagged(conn, biz):
    """Exactly 50% increase is not > 50%, so not flagged"""
    previous = shift_month(TARGET, -1)
    add_expense_upload(conn, biz, previous, [("rent", 1000)])
    add_expense_upload(conn, biz, TARGET, [("rent", 1500)])

    assert flag_categories(conn, biz, TARGET) == []
    item = category_summary(conn, biz, TARGET)["items"][0]
    assert item["anomaly_status"] == "normal"
    assert item["unusual_increase"] is False


def test_exactly_1000_rupee_not_flagged(conn, biz):
    """Exactly 1000 rupee increase is not > 1000, so not flagged"""
    previous = shift_month(TARGET, -1)
    add_expense_upload(conn, biz, previous, [("rent", 2000)])
    add_expense_upload(conn, biz, TARGET, [("rent", 3000)])

    assert flag_categories(conn, biz, TARGET) == []
    item = category_summary(conn, biz, TARGET)["items"][0]
    assert item["anomaly_status"] == "normal"
    assert item["unusual_increase"] is False


def test_insufficient_history_no_previous_month(conn, biz):
    add_expense_upload(conn, biz, TARGET, [("rent", 1000)])

    item = category_summary(conn, biz, TARGET)["items"][0]

    assert flag_categories(conn, biz, TARGET) == []
    assert item["anomaly_status"] == "insufficient_history"
    assert item["unusual_increase"] is None


def test_missing_category_in_previous_month(conn, biz):
    previous = shift_month(TARGET, -1)
    add_expense_upload(conn, biz, previous, [("utilities", 500)])
    add_expense_upload(conn, biz, TARGET, [("rent", 1000)])

    item = category_summary(conn, biz, TARGET)["items"][0]

    assert flag_categories(conn, biz, TARGET) == []
    assert item["anomaly_status"] == "insufficient_history"
    assert item["unusual_increase"] is None


def test_rejected_import_in_current_month(conn, biz):
    previous = shift_month(TARGET, -1)
    add_expense_upload(conn, biz, previous, [("rent", 1000)])
    add_expense_upload(conn, biz, TARGET, [("rent", 5000)], status="completed_with_warnings", rejected=1)

    item = category_summary(conn, biz, TARGET)["items"][0]

    assert flag_categories(conn, biz, TARGET) == []
    assert item["anomaly_status"] == "incomplete_data"


def test_rejected_import_in_previous_month(conn, biz):
    previous = shift_month(TARGET, -1)
    add_expense_upload(conn, biz, previous, [("rent", 1000)], status="completed_with_warnings", rejected=1)
    add_expense_upload(conn, biz, TARGET, [("rent", 5000)])

    item = category_summary(conn, biz, TARGET)["items"][0]

    assert flag_categories(conn, biz, TARGET) == []
    assert item["anomaly_status"] == "incomplete_data"


def test_current_month_not_complete(conn, biz):
    """Current month is the same as today (incomplete)"""
    from app import config
    today = config.today_local()
    current_month_start = dt.date(today.year, today.month, 1)
    add_expense_upload(conn, biz, current_month_start, [("rent", 5000)])

    item = category_summary(conn, biz, current_month_start)["items"][0]

    assert flag_categories(conn, biz, current_month_start) == []
    assert item["anomaly_status"] == "incomplete_data"


def test_categories_analyzed_independently(conn, biz):
    previous = shift_month(TARGET, -1)
    add_expense_upload(conn, biz, previous, [("rent", 5000), ("utilities", 10000)])
    add_expense_upload(conn, biz, TARGET, [("rent", 12000), ("utilities", 10500)])

    summary = category_summary(conn, biz, TARGET)
    by_category = {item["category"]: item for item in summary["items"]}

    assert by_category["rent"]["unusual_increase"] is True
    assert by_category["utilities"]["unusual_increase"] is False


def test_flags_are_business_scoped(conn, biz):
    other_business = conn.cursor()
    other_business.execute(
        "INSERT INTO businesses(business_name) VALUES ('Other') RETURNING business_id"
    )
    other_biz = other_business.fetchone()[0]
    conn.commit()
    previous = shift_month(TARGET, -1)
    add_expense_upload(conn, other_biz, previous, [("rent", 5000)])
    add_expense_upload(conn, other_biz, TARGET, [("rent", 12000)])

    assert flag_categories(conn, biz, TARGET) == []
    assert category_summary(conn, biz, TARGET)["items"] == []


def test_entries_api_rejects_invalid_month_and_empty_category(biz):
    headers = token_headers(biz)
    assert client.get(
        "/expenses/categories/rent/entries?month=2026-00",
        headers=headers,
    ).status_code == 422
    assert client.get(
        "/expenses/categories/%20/entries?month=2026-10",
        headers=headers,
    ).status_code == 422


def test_flag_categories_p2_29_contract(conn, biz):
    """Verify flag_categories returns P2-29 compatible format"""
    previous = shift_month(TARGET, -1)
    add_expense_upload(conn, biz, previous, [("rent", 5000)])
    add_expense_upload(conn, biz, TARGET, [("rent", 12000)])

    flags = flag_categories(conn, biz, TARGET)

    assert len(flags) == 1
    flag = flags[0]
    assert flag["category"] == "rent"
    assert flag["observed"] == Decimal("12000.00")
    assert flag["expected"] == Decimal("5000.00")
    assert flag["percentage_increase"] == Decimal("140.00")
    assert flag["rupee_increase"] == Decimal("7000.00")
    assert flag["percentage_increase"] > Decimal("50")
    assert flag["rupee_increase"] > Decimal("1000")


def test_category_summary_contract_fields(conn, biz):
    previous = shift_month(TARGET, -1)
    add_expense_upload(conn, biz, previous, [("rent", 100)])
    add_expense_upload(conn, biz, TARGET, [("rent", 150)])

    summary = category_summary(conn, biz, TARGET)

    assert set(summary) == {"month", "previous_month", "items"}
    assert set(summary["items"][0]) == {
        "category",
        "total_amount",
        "previous_month_total",
        "percentage_change",
        "unusual_increase",
        "anomaly_status",
        "anomaly_score",
        "anomaly_explanation",
    }


def test_category_summary_normalizes_category_names(conn, biz):
    add_expense_upload(conn, biz, TARGET, [("Rent", 10), ("  rent  ", 20), ("RENT", 30)])

    summary = category_summary(conn, biz, TARGET)

    assert [item["category"] for item in summary["items"]] == ["rent"]
    assert summary["items"][0]["total_amount"] == Decimal("60.00")


def test_category_summary_only_returns_categories_with_current_expenses(conn, biz):
    previous = shift_month(TARGET, -1)
    add_expense_upload(conn, biz, previous, [("rent", 100)])
    add_expense_upload(conn, biz, TARGET, [("utilities", 50)])

    summary = category_summary(conn, biz, TARGET)

    assert [item["category"] for item in summary["items"]] == ["utilities"]
    assert summary["items"][0]["previous_month_total"] is None
    assert summary["items"][0]["percentage_change"] is None


def test_category_summary_includes_month_boundary_dates(conn, biz):
    previous = shift_month(TARGET, -1)
    following = shift_month(TARGET, 1)
    add_expense_upload(conn, biz, previous, [("rent", 10)], day=30)
    add_expense_upload(conn, biz, TARGET, [("rent", 20)], day=1)
    add_expense_upload(conn, biz, TARGET, [("rent", 30)], day=31)
    add_expense_upload(conn, biz, following, [("rent", 40)], day=1)

    item = category_summary(conn, biz, TARGET)["items"][0]

    assert item["total_amount"] == Decimal("50.00")
    assert item["previous_month_total"] == Decimal("10.00")
    assert item["percentage_change"] == Decimal("400.00")


def test_category_summary_rejects_invalid_month_formats(biz):
    headers = token_headers(biz)
    for value in ("2026-1", "2026-13", "2026-00", "2026-10-01", "not-a-month"):
        assert client.get(
            "/expenses/categories?month=" + value,
            headers=headers,
        ).status_code == 422
    assert client.get("/expenses/categories", headers=headers).status_code == 422


def test_category_entries_requires_authentication(biz):
    assert client.get(
        "/expenses/categories/rent/entries?month=2026-10"
    ).status_code == 401


def test_category_entries_rejects_invalid_pagination(biz):
    headers = token_headers(biz)
    for query in ("limit=0", "limit=501", "offset=-1"):
        assert client.get(
            "/expenses/categories/rent/entries?month=2026-10&" + query,
            headers=headers,
        ).status_code == 422


def test_category_entries_order_and_pagination(conn, biz):
    add_expense_upload(conn, biz, TARGET, [("rent", 10)], day=5)
    add_expense_upload(conn, biz, TARGET, [("rent", 20)], day=10)
    add_expense_upload(conn, biz, TARGET, [("rent", 30)], day=20)

    headers = token_headers(biz)
    first_page = client.get(
        "/expenses/categories/rent/entries?month=2026-10&limit=1",
        headers=headers,
    )

    assert first_page.status_code == 200
    body = first_page.json()
    assert body["limit"] == 1
    assert body["offset"] == 0
    assert [item["amount"] for item in body["items"]] == [30.0]

    second_page = client.get(
        "/expenses/categories/rent/entries?month=2026-10&limit=1&offset=1",
        headers=headers,
    ).json()

    assert second_page["offset"] == 1
    assert [item["amount"] for item in second_page["items"]] == [20.0]


def test_category_entries_month_boundaries(conn, biz):
    previous = shift_month(TARGET, -1)
    following = shift_month(TARGET, 1)
    add_expense_upload(conn, biz, previous, [("rent", 1)], day=30)
    add_expense_upload(conn, biz, TARGET, [("rent", 2)], day=1)
    add_expense_upload(conn, biz, TARGET, [("rent", 3)], day=31)
    add_expense_upload(conn, biz, following, [("rent", 4)], day=1)

    body = client.get(
        "/expenses/categories/rent/entries?month=2026-10",
        headers=token_headers(biz),
    ).json()

    assert [item["amount"] for item in body["items"]] == [3.0, 2.0]