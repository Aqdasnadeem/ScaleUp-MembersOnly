"""Column mapping (FR-UP-05): auto-suggest, and the header-level checks of P2-12 (wrong or missing columns reported clearly)."""
import re

SYNONYMS = {
 "order_id": "order no|order id|order|invoice|invoiceno|invoice no|invoice number|transaction|transaction id|txn id|txn_id|receipt|bill no|order number|order name",
 "date": "date|sale date|order date|invoicedate|invoice date|txn date|transaction date|expense date|review date|date of sale|snapshot date|stock date",
 "product_code": "sku|sku id|stockcode|stock code|product id|productid|product code|item code|code|item id|lineitem sku|variant sku|article code",
 "product_name": "product|item|item name|description|product name|name|item description|lineitem name|product title",
 "quantity": "qty|quantity|units|units sold|qty sold|lineitem quantity|quantity sold",
 "unit_price": "unit price|unitprice|price|rate|price per unit|selling price|lineitem price|mrp",
 "total": "total|line total|amount|revenue|sales|total amount",
 "customer": "customer|customer id|customerid|cust id|client|client id|buyer",
 "category": "category|expense category|type|head",
 "stock_quantity": "stock|current stock|stock quantity|qty on hand|on hand|quantity|qty|stock qty|in stock|units in stock",
 "amount": "amount|cost|expense|value|total|price|debit|withdrawal|paid out|amount paid",
 "description": "description|note|notes|details|remarks|memo",
 "review_text": "review|review text|comment|comments|feedback|text|customer feedback|review body|body|review description|message",
 "rating": "rating|stars|score|star rating",
 "review_id": "review id|reviewid|id|feedback id",
 "cost_price": "cost price|cost|unit cost|purchase price|buying price|cost per unit",
}
FIELDS = {
 "sales": ["order_id", "date", "product_code", "product_name", "quantity", "unit_price", "total", "customer", "category", "cost_price"],
 "inventory": ["product_code", "product_name", "stock_quantity", "date", "cost_price"],
 "expenses": ["date", "category", "amount", "description"],
 "feedback": ["date", "review_text", "rating", "review_id", "product_name"],
}
# FR-UP-06: header of the downloadable CSV template per upload type. Every name is one the auto-suggest already knows,
# so a user who keeps the template gets a full suggested mapping.
TEMPLATES = {
 "sales": ["order_id", "date", "product_id", "product_name", "quantity", "unit_price", "total_amount", "customer_id", "category", "cost_price"],
 "inventory": ["product_id", "product_name", "stock_quantity", "snapshot_date", "cost_price"],
 "expenses": ["date", "category", "amount", "description"],
 "feedback": ["date", "review_text", "rating", "review_id", "product_name"],
}
REQUIRED = {"sales": ["order_id", "date", "quantity"], "inventory": ["stock_quantity"],
            "expenses": ["date", "category", "amount"], "feedback": ["date", "review_text"]}

def _n(s): return re.sub(r"[^a-z0-9]", "", s.lower())

def suggest_mapping(header, kind):
    """For each of our fields, the first unused file column whose name is a known synonym."""
    out, used = {}, set()
    for f in FIELDS[kind]:
        syn = [_n(x) for x in SYNONYMS.get(f, "").split("|")]
        for h in header:
            if h not in used and _n(h) in syn:
                out[f] = h
                used.add(h)
                break
    return out

def check_mapping(kind, mapping, header, snapshot=None):
    """Returns a list of clear messages; an empty list means the mapping is usable.
    1. a mapped column that is not in the file; 2. a required field that is not mapped."""
    norm = [h.strip().lower() for h in header]
    mp = {k: v.strip().lower() for k, v in mapping.items() if v}
    problems = []
    missing = [f'{k} -> "{mapping[k]}"' for k, v in mp.items() if v not in norm]
    if missing:
        problems.append("mapped column not found in file: " + ", ".join(missing))
    have = set(mp)
    lacking = [k for k in REQUIRED[kind] if k not in have]
    if kind in ("sales", "inventory") and not ({"product_code", "product_name"} & have):
        lacking.append("product_code or product_name")
    if kind == "sales" and not ({"unit_price", "total"} & have):
        lacking.append("unit_price or total")
    if kind == "inventory" and "date" not in have and snapshot is None:
        lacking.append("date column or snapshot_date from the upload screen")
    if lacking:
        problems.append("required field not mapped: " + ", ".join(lacking))
    return problems
