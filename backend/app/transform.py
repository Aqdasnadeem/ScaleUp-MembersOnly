"""P2-13 (transformation part): checks and merges INSIDE the file, before anything touches the database.
BR-18: repeated order_id + product lines are merged in memory (sum quantity, sum line total; the unit price is the weighted
average = total / quantity). Never 'quantity = quantity + new' in SQL, so re-uploading cannot double quantities."""
import hashlib
from .schemas import RowIssue

def transform(kind, good):
    """good = [(row_number, model)]. Returns (rows, extra_issues, merged_count); rows are plain dicts for the loader."""
    rows, issues, merged = [], [], 0
    if kind == "sales":
        m = {}
        for rn, g in good:
            k = (g.order_id, g.product_key)
            if k in m:
                p = m[k]
                if p["d"] != g.date or p["cust"] != g.customer:
                    issues.append(RowIssue(row=rn, column="order_id", reason="same order + product with a different date or customer"))
                    continue
                p["q"] += g.quantity
                p["tot"] += g.total
                p["merged"] += 1
                merged += 1
            else:
                m[k] = dict(oid=g.order_id, key=g.product_key, name=g.product_name, cat=g.category, d=g.date, q=g.quantity,
                            tot=g.total, cust=g.customer, cost=g.cost_price, merged=0)
        rows = list(m.values())
    elif kind == "inventory":
        seen = set()
        for rn, g in good:
            k = (g.product_key, g.date)
            if k in seen:
                issues.append(RowIssue(row=rn, column="product", reason="same product and date twice in the file"))
                continue
            seen.add(k)
            rows.append(dict(key=g.product_key, name=g.product_name, d=g.date, stock=g.stock_quantity, cost=g.cost_price))
    elif kind == "expenses":
        occ = {}
        for rn, g in good:
            c = (g.date, g.category, g.amount, g.description or "")
            occ[c] = occ.get(c, 0) + 1          # BR-09: occurrence number among identical rows, so both are kept
            h = hashlib.sha256("|".join([g.date.isoformat(), g.category, str(g.amount), g.description or "", str(occ[c])]).encode()).hexdigest()
            rows.append(dict(d=g.date, cat=g.category, a=g.amount, desc=g.description, hash=h))
    else:
        for rn, g in good:
            k = ("id:" + g.review_id) if g.review_id else ("dt:%s|%s" % (g.date.isoformat(), g.review_text))
            rows.append(dict(d=g.date, txt=g.review_text, rt=g.rating, rid=g.review_id, pn=g.product_name,
                             hash=hashlib.sha256(k.encode()).hexdigest()))
    return rows, issues, merged
