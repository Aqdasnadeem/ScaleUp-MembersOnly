"""P2-29 demo data (sir, 18 Nov): generates synthetic demo_expenses.csv and demo_inventory.csv,
and appends a deliberately clean, low-variance block to the existing demo_sales.csv so a sales
DROP can be planted without touching any of its 360 existing rows (their own variance was too
high for a drop to reliably cross the documented z>=3 rule - see demo_planted_anomalies.md).

Standard library only. Fixed seed (FIXED_SEED below) so re-running produces byte-identical files.

    py scripts/generate_demo_data.py          (run from backend/)

Writes, under sample/demo/:
    demo_sales.csv              existing 360 rows, unchanged, plus an appended April block
    demo_expenses.csv           3 full calendar months, several categories
    demo_inventory.csv          weekly (Monday) snapshots, 13 weeks, 6 products
    demo_planted_anomalies.md   exact date/type/value/expected for every plant, and which
                                 ones this backend can actually detect today
"""
import csv
import random
import pathlib

FIXED_SEED = 42
HERE = pathlib.Path(__file__).resolve().parent
DEMO_DIR = HERE.parent / "sample" / "demo"

# Reuses the real products/prices already in demo_sales.csv (SKU001-SKU006), so the April
# extension and the inventory file describe the same catalogue as the existing sales data.
PRODUCTS = [
    ("SKU001", "Product 01", 18.00),
    ("SKU002", "Product 02", 21.00),
    ("SKU003", "Product 03", 24.00),
    ("SKU004", "Product 04", 27.00),
    ("SKU005", "Product 05", 30.00),
    ("SKU006", "Product 06", 33.00),
]

EXPENSE_CATEGORIES = ["Rent", "Utilities", "Marketing", "Logistics & Shipping", "Supplies", "Salaries"]
EXPENSE_MONTHS = ["2026-01", "2026-02", "2026-03"]          # 3 full calendar months
SPIKE_CATEGORY = "Marketing"
SPIKE_MONTH = "2026-02"

INVENTORY_START_MONDAY = "2026-01-05"
INVENTORY_WEEKS = 13                                         # >= 12 weeks, same weekday (Monday)
INVENTORY_DROP_PRODUCT = "SKU003"
INVENTORY_DROP_AFTER_WEEK = 7                                 # drop happens between week 7 and week 8 (0-indexed: index 6 -> 7)

SALES_DROP_PRODUCT = PRODUCTS[0]                              # SKU001, price 18.00
SALES_DROP_BASELINE_DAYS = 27                                 # low-variance April 1-27 baseline
SALES_DROP_DATE = "2026-04-28"


def product_cost_prices(seed):
    """cost_price = round(price * uniform(0.40, 0.70), 2), once per product (sir's formula)."""
    rng = random.Random(seed)
    return {code: round(price * rng.uniform(0.40, 0.70), 2) for code, _, price in PRODUCTS}


def week_mondays(start_iso, count):
    import datetime as dt
    start = dt.date.fromisoformat(start_iso)
    return [(start + dt.timedelta(weeks=i)).isoformat() for i in range(count)]


def generate_inventory_rows(seed):
    rng = random.Random(seed)
    costs = product_cost_prices(seed)
    mondays = week_mondays(INVENTORY_START_MONDAY, INVENTORY_WEEKS)
    rows = []
    for code, name, _price in PRODUCTS:
        stock = rng.randint(150, 250)                         # starting baseline, per product
        for week_index, snapshot_date in enumerate(mondays):
            if week_index == 0:
                pass
            elif code == INVENTORY_DROP_PRODUCT and week_index == INVENTORY_DROP_AFTER_WEEK:
                stock = max(0, round(stock * 0.30))           # >=50% AND >=10 units drop, guaranteed below
            else:
                stock = max(1, round(stock * (1 + rng.uniform(-0.08, 0.08))))
            rows.append({
                "SKU": code, "Product": name, "Stock": stock,
                "Snapshot Date": snapshot_date, "Cost Price": costs[code],
            })
    return rows, costs


def generate_expense_rows(seed):
    rng = random.Random(seed)
    rows = []
    for month in EXPENSE_MONTHS:
        for category in EXPENSE_CATEGORIES:
            base = {"Rent": 45000, "Utilities": 8000, "Marketing": 12000,
                     "Logistics & Shipping": 15000, "Supplies": 6000, "Salaries": 90000}[category]
            entries = 1 if category in ("Rent", "Salaries") else rng.randint(2, 4)
            for i in range(entries):
                amount = round(base / entries * (1 + rng.uniform(-0.10, 0.10)), 2)
                if category == SPIKE_CATEGORY and month == SPIKE_MONTH:
                    amount = round(amount * 3.4, 2)           # the planted expense spike
                day = min(28, 3 + i * 9 + rng.randint(0, 2))
                rows.append({
                    "Date": "%s-%02d" % (month, day), "Category": category, "Amount": amount,
                    "Description": "%s expense %d of %d (%s)" % (category, i + 1, entries, month),
                })
    return rows


def generate_sales_extension_rows(seed):
    """Low-variance April baseline (27 days) + one clean drop day, appended to the existing
    demo_sales.csv (whose own 360 rows are never touched or reordered)."""
    rng = random.Random(seed)
    code, name, price = SALES_DROP_PRODUCT
    rows = []
    order_n = 0
    for day in range(1, SALES_DROP_BASELINE_DAYS + 1):
        order_n += 1
        qty = max(1, round(rng.uniform(16, 18)))              # tight band: low day-to-day variance
        rows.append({
            "Order No": "ORD-APR-%03d" % order_n, "Date": "2026-04-%02d" % day, "SKU": code,
            "Product": name, "Qty": qty, "Unit Price": price,
            "Cost Price": product_cost_prices(seed)[code], "Customer": "Customer AP%d" % order_n,
        })
    order_n += 1
    rows.append({                                              # the planted sales drop
        "Order No": "ORD-APR-%03d" % order_n, "Date": SALES_DROP_DATE, "SKU": code,
        "Product": name, "Qty": 1, "Unit Price": price,
        "Cost Price": product_cost_prices(seed)[code], "Customer": "Customer AP%d" % order_n,
    })
    return rows


def write_csv(path, fieldnames, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def main():
    DEMO_DIR.mkdir(parents=True, exist_ok=True)

    # Idempotent: strip any previously-appended "ORD-APR-*" rows from an earlier run of this
    # script before appending a fresh copy, so running it twice is byte-identical rather than
    # doubling the extension. The original 360 rows (anything not ORD-APR-*) are never touched.
    sales_path = DEMO_DIR / "demo_sales.csv"
    with open(sales_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        existing_fieldnames = reader.fieldnames
        base_rows = [row for row in reader if not row["Order No"].startswith("ORD-APR-")]
    extension_rows = generate_sales_extension_rows(FIXED_SEED)
    write_csv(sales_path, existing_fieldnames, base_rows + extension_rows)

    inventory_rows, inv_costs = generate_inventory_rows(FIXED_SEED)
    write_csv(DEMO_DIR / "demo_inventory.csv", ["SKU", "Product", "Stock", "Snapshot Date", "Cost Price"], inventory_rows)

    expense_rows = generate_expense_rows(FIXED_SEED)
    write_csv(DEMO_DIR / "demo_expenses.csv", ["Date", "Category", "Amount", "Description"], expense_rows)

    print("appended %d rows to demo_sales.csv (April low-variance block + 1 drop day)" % len(extension_rows))
    print("wrote %d inventory rows (%d products x %d weeks) to demo_inventory.csv" % (len(inventory_rows), len(PRODUCTS), INVENTORY_WEEKS))
    print("wrote %d expense rows to demo_expenses.csv" % len(expense_rows))
    print("per-product inventory cost/price ratios:", {k: round(v / dict((c, p) for c, _, p in PRODUCTS)[k], 4) for k, v in inv_costs.items()})


if __name__ == "__main__":
    main()
