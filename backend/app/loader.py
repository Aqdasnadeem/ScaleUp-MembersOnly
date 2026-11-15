"""P2-14: bulk load. LOAD ONLY (sir, 4 Nov): the job is created and marked done/failed by the worker (P2-51).
BR-16: COPY into a temporary staging table, then INSERT ... ON CONFLICT DO NOTHING into the final table. Duplicates are skipped,
never overwritten, so a retry or a re-upload cannot add rows twice. The caller owns the transaction (commit / rollback)."""
import csv
import io

TABLE = {"sales": "sales", "inventory": "inventory", "expenses": "expenses", "feedback": "feedback"}

def _copy(cur, ddl, rows, name="stg"):
    cur.execute(ddl)
    buf = io.StringIO()
    w = csv.writer(buf)
    for r in rows:
        w.writerow(r)
    buf.seek(0)
    cur.copy_expert("copy " + name + " from stdin with (format csv)", buf)

def _products(cur, biz, job, rows):
    first = {}
    for r in rows:
        v = first.setdefault(r["key"], [r.get("name") or "", r.get("cat") or "", None])   # first row in the file wins
        if v[2] is None and r.get("cost") is not None:
            v[2] = r["cost"]
    _copy(cur, "create temp table pstg(pkey text, pname text, cat text, cost numeric) on commit drop",
          [(k, v[0], v[1], "" if v[2] is None else v[2]) for k, v in first.items()], "pstg")
    # BR-23: cost_price is fill-only: an existing cost is never overwritten, a missing one is filled
    cur.execute("""insert into products(business_id,job_id,product_key,product_name,category,cost_price)
        select %s::uuid,%s::uuid,pkey,nullif(pname,''),nullif(cat,''),cost from pstg order by pkey
        on conflict (business_id,product_key) do update set cost_price = coalesce(products.cost_price, excluded.cost_price)""", (biz, job))

def cost_conflicts(cur, biz, rows):
    """BR-23 (sir, 5 Nov): cost_price is fill-only. How many products does this file give a DIFFERENT cost than the one already saved?
    The saved cost is kept; the pipeline reports the number as a warning. Call it before bulk_load."""
    new = {}
    for r in rows:
        if r.get("cost") is not None:
            new.setdefault(r["key"], r["cost"])               # first cost in the file wins, as in _products
    if not new:
        return 0
    cur.execute("select product_key, cost_price from products where business_id=%s and cost_price is not null and product_key = any(%s)",
                (biz, list(new)))
    return sum(1 for k, c in cur.fetchall() if c != new[k])

def bulk_load(cur, biz, job, kind, rows):
    """Loads the cleaned rows (dicts from transform.transform). Returns the number of rows really inserted."""
    if kind == "sales":
        _copy(cur, "create temp table stg(order_id text, pkey text, pname text, cat text, ckey text, d date, q int, up numeric, tot numeric) on commit drop",
              [(r["oid"], r["key"], r["name"] or "", r["cat"] or "", r["cust"] or "", r["d"], r["q"], round(r["tot"] / r["q"], 2), r["tot"]) for r in rows])
        _products(cur, biz, job, rows)
        cur.execute("insert into customers(business_id,job_id,customer_key) select distinct %s::uuid,%s::uuid,ckey from stg where ckey<>'' order by ckey "
                    "on conflict (business_id,customer_key) do nothing", (biz, job))
        cur.execute("""insert into sales(business_id,job_id,product_id,customer_id,order_id,sale_date,quantity,unit_price,total_amount)
            select %s::uuid,%s::uuid,p.product_id,c.customer_id,s.order_id,s.d,s.q,s.up,s.tot from stg s
            join products p on p.business_id=%s and p.product_key=s.pkey
            left join customers c on c.business_id=%s and c.customer_key=nullif(s.ckey,'')
            order by s.order_id, s.pkey on conflict (business_id,order_id,product_id) do nothing""", (biz, job, biz, biz))
        return cur.rowcount
    if kind == "inventory":
        _copy(cur, "create temp table stg(pkey text, pname text, cat text, d date, stock int) on commit drop",
              [(r["key"], r["name"] or "", "", r["d"], r["stock"]) for r in rows])
        _products(cur, biz, job, rows)
        cur.execute("""insert into inventory(business_id,job_id,product_id,snapshot_date,stock_quantity)
            select %s::uuid,%s::uuid,p.product_id,s.d,s.stock from stg s join products p on p.business_id=%s and p.product_key=s.pkey
            order by s.pkey, s.d on conflict (business_id,product_id,snapshot_date) do nothing""", (biz, job, biz))
        return cur.rowcount
    if kind == "expenses":
        _copy(cur, "create temp table stg(d date, cat text, a numeric, descr text, h text) on commit drop",
              [(r["d"], r["cat"], r["a"], r["desc"] or "", r["hash"]) for r in rows])
        cur.execute("""insert into expenses(business_id,job_id,expense_date,category,amount,description,row_hash)
            select %s::uuid,%s::uuid,d,cat,a,nullif(descr,''),h from stg order by h on conflict (business_id,row_hash) do nothing""", (biz, job))
        return cur.rowcount
    _copy(cur, "create temp table stg(d date, txt text, rt int, rid text, pn text, h text) on commit drop",
          [(r["d"], r["txt"], "" if r["rt"] is None else r["rt"], r["rid"] or "", r["pn"] or "", r["hash"]) for r in rows])
    cur.execute("""insert into feedback(business_id,job_id,product_id,feedback_date,review_text,rating,review_id,row_hash)
        select %s::uuid,%s::uuid,
          (select p.product_id from products p where p.business_id=%s and (p.product_key=s.pn or p.product_name=s.pn) order by (p.product_key=s.pn) desc, p.product_id limit 1),
          s.d,s.txt,s.rt,nullif(s.rid,''),s.h from stg s order by s.h on conflict (business_id,row_hash) do nothing""", (biz, job, biz))
    return cur.rowcount

def remove_job_rows(cur, biz, kind, old_job):
    """FR-ETL-08 (replace): delete only the rows of the earlier upload (by job_id) and mark that job 'replaced'.
    Other uploads are untouched. Call it in the same transaction as bulk_load of the new file (BR-17)."""
    cur.execute("select business_id, upload_type from ingestion_jobs where job_id=%s", (old_job,))
    o = cur.fetchone()
    if not o or str(o[0]) != str(biz) or o[1] != kind:
        raise ValueError("replace target is not this business/type")
    cur.execute("delete from " + TABLE[kind] + " where job_id=%s and business_id=%s", (old_job, biz))
    cur.execute("update ingestion_jobs set status='replaced' where job_id=%s", (old_job,))
