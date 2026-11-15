"""Schema fit test: can the 10-table schema swallow very different real-world file shapes?
Run after migrations 001-003 on an empty database. Writes fit/report.md.
Two kinds of input:
  REAL  = public datasets downloaded from GitHub (not written by us)
  SHAPE = layouts we wrote ourselves, copying common export formats (Shopify, POS, bank statement, pivot)
"""
import os, sys, csv, time, json, collections, datetime as dt
import psycopg2
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))   # the tests folder that holds etl.py
import etl

HERE = os.path.dirname(os.path.abspath(__file__))
REAL = os.path.join(os.path.dirname(HERE), 'realsets')
MINE = os.path.join(HERE, 'shapes'); os.makedirs(MINE, exist_ok=True)
DB = 'scaleup_fit'
OUT = []

def w(name, text):
    p = os.path.join(MINE, name); open(p, 'w', newline='', encoding='utf-8').write(text); return p

# ---------- files we write ourselves, copying common export layouts ----------
def shapes():
    f = {}
    # 4. Shopify-style order export (one line per line item, odd column names)
    rows = ['Name,Email,Financial Status,Paid at,Lineitem quantity,Lineitem name,Lineitem price,Lineitem sku,Billing City']
    for i in range(1, 41):
        rows.append('#%d,a%d@mail.com,paid,2026-09-%02d 10:30:00,%d,Blue Mug,450,MUG-BLU,Karachi' % (1000 + i, i, i % 28 + 1, i % 3 + 1))
    f['shopify_orders.csv'] = w('shopify_orders.csv', '\n'.join(rows) + '\n')
    # 5. POS daily summary: no order id at all
    rows = ['Date,Product,Units Sold,Total Sales']
    for i in range(1, 31):
        rows.append('%02d/09/2026,Chicken Roll,%d,%d' % (i, i % 7 + 3, (i % 7 + 3) * 180))
    f['pos_daily_summary.csv'] = w('pos_daily_summary.csv', '\n'.join(rows) + '\n')
    # 6. Inventory with a warehouse column (two locations, same product and date)
    rows = ['Date,SKU,Item,Warehouse,Qty on hand']
    for d in ('01/09/2026', '08/09/2026'):
        for sku in ('A-1', 'A-2'):
            for wh, q in (('Shop', 12), ('Godown', 40)):
                rows.append('%s,%s,Item %s,%s,%d' % (d, sku, sku, wh, q))
    f['inventory_two_locations.csv'] = w('inventory_two_locations.csv', '\n'.join(rows) + '\n')
    # 7. Bank statement style expenses (debit / credit / balance)
    rows = ['Date,Description,Debit,Credit,Balance']
    bal = 500000
    for i in range(1, 21):
        if i % 5 == 0: bal += 20000; rows.append('%02d/09/2026,Customer payment,,20000,%d' % (i, bal))
        else: bal -= 3500; rows.append('%02d/09/2026,Supplier bill,3500,,%d' % (i, bal))
    f['bank_statement_expenses.csv'] = w('bank_statement_expenses.csv', '\n'.join(rows) + '\n')
    # 8. Review export
    rows = ['Review ID,Reviewer,Date,Rating,Body,Product']
    for i in range(1, 26):
        rows.append('RV%03d,Customer %d,%02d/09/2026,%d,"Good product, fast delivery",Blue Mug' % (i, i, i % 28 + 1, i % 5 + 1))
    f['reviews_export.csv'] = w('reviews_export.csv', '\n'.join(rows) + '\n')
    # 9. Pivot / wide file: months as columns
    rows = ['Product,Jan,Feb,Mar,Apr']
    for i in range(1, 11):
        rows.append('Item %d,%d,%d,%d,%d' % (i, i * 100, i * 110, i * 90, i * 130))
    f['sales_pivot_wide.csv'] = w('sales_pivot_wide.csv', '\n'.join(rows) + '\n')
    # 10. Multi-currency sales
    rows = ['Order No,Date,SKU,Item,Qty,Unit Price,Currency,Customer']
    for i in range(1, 21):
        cur = 'PKR' if i % 2 else 'USD'
        rows.append('MC-%03d,%02d/09/2026,X-%d,Thing,%d,%d,%s,C%d' % (i, i % 28 + 1, i % 4, i % 3 + 1, 100 if cur == 'PKR' else 2, cur, i % 5))
    f['sales_multi_currency.csv'] = w('sales_multi_currency.csv', '\n'.join(rows) + '\n')
    # 11. Sales with tax, discount and shipping columns
    rows = ['Invoice,Date,SKU,Item,Qty,Unit Price,Discount,Tax,Shipping,Line Total']
    for i in range(1, 21):
        rows.append('TX-%03d,%02d/09/2026,T-%d,Thing,2,500,50,85,120,1035' % (i, i % 28 + 1, i % 5))
    f['sales_with_tax_discount.csv'] = w('sales_with_tax_discount.csv', '\n'.join(rows) + '\n')
    return f

def biz(conn, name, fmt):
    cur = conn.cursor()
    cur.execute("insert into businesses(business_name,date_format) values(%s,%s) returning business_id", (name, fmt)); conn.commit()
    return cur.fetchone()[0]

def counts(conn, b):
    c = conn.cursor(); out = {}
    for t in ('sales', 'inventory', 'expenses', 'feedback', 'products', 'customers'):
        c.execute("select count(*) from " + t + " where business_id=%s", (b,)); out[t] = c.fetchone()[0]
    conn.commit(); return out

def run(conn, label, kind, path, fmt='DD/MM/YYYY', mapping=None, snapshot=None, note='', source='SHAPE'):
    b = biz(conn, label, fmt)
    t0 = time.time()
    try:
        hdr = etl.read_file(path)[1]
    except etl.FileError as e:
        OUT.append(dict(label=label, source=source, kind=kind, auto='-', status='file rejected', detail=str(e), loaded=0, rejected=0, rows=0, secs=0, note=note)); return
    auto = etl.suggest_mapping(hdr, kind)
    used = mapping if mapping is not None else auto
    r = etl.load(conn, b, kind, path, used, fmt, snapshot=snapshot)
    secs = round(time.time() - t0, 1)
    reasons = collections.Counter(x[2] for x in r['bad'])
    OUT.append(dict(label=label, source=source, kind=kind, header=hdr, auto=sorted(auto), used=sorted(used),
                    status=r['status'], loaded=r['loaded'], rejected=len(r['bad']),
                    reasons=reasons.most_common(4), msg=r.get('message', ''), secs=secs,
                    tables=counts(conn, b), note=note))
    print('%-34s %-22s loaded=%-8s rejected=%-7s %ss' % (label, r['status'], r['loaded'], len(r['bad']), secs)); sys.stdout.flush()

def make_db():
    """Creates ONLY the database scaleup_fit (dropped first) and runs migrations 001-003."""
    a = psycopg2.connect(dbname='postgres'); a.autocommit = True
    a.cursor().execute('drop database if exists ' + DB + ' with (force)'); a.cursor().execute('create database ' + DB); a.close()
    c = psycopg2.connect(dbname=DB); c.autocommit = True
    mig = os.path.join(os.path.dirname(HERE), 'migrations')
    for f in ('001_create_core_tables.up.sql', '002_create_data_tables.up.sql', '003_create_indexes.up.sql'):
        c.cursor().execute(open(os.path.join(mig, f), encoding='utf-8').read())
    c.autocommit = False
    return c

def main():
    conn = make_db()
    S = shapes()
    # ---- REAL public datasets ----
    orl = os.path.join(REAL, 'online_retail_II.csv')
    if os.path.exists(orl):
        run(conn, 'REAL Online Retail II (1.07M rows)', 'sales', orl, 'DD/MM/YYYY',
            mapping={'order_id': 'Invoice', 'date': 'InvoiceDate', 'product_code': 'StockCode',
                     'product_name': 'Description', 'quantity': 'Quantity', 'unit_price': 'Price', 'customer': 'Customer ID'},
            note='UCI Online Retail II, downloaded from GitHub', source='REAL')
    ss = os.path.join(REAL, 'superstore.csv')
    if os.path.exists(ss):
        run(conn, 'REAL SampleSuperstore', 'sales', ss, 'MM/DD/YYYY', note='Kaggle SampleSuperstore copy on GitHub', source='REAL')
    sc = os.path.join(REAL, 'stock_codes.csv')
    if os.path.exists(sc):
        run(conn, 'REAL stock_codes.csv', 'inventory', sc, 'DD/MM/YYYY', snapshot=dt.date(2026, 9, 1),
            note='product code counts, no stock column', source='REAL')
    # ---- shapes we wrote ----
    run(conn, 'Shopify order export', 'sales', S['shopify_orders.csv'],
        mapping={'order_id': 'Name', 'date': 'Paid at', 'product_code': 'Lineitem sku', 'product_name': 'Lineitem name',
                 'quantity': 'Lineitem quantity', 'unit_price': 'Lineitem price', 'customer': 'Email'},
        note='order id column is called Name, so it is set on the mapping screen')
    run(conn, 'Shopify export, auto-suggest only', 'sales', S['shopify_orders.csv'],
        note='no hand mapping at all')
    run(conn, 'POS daily summary (no order id)', 'sales', S['pos_daily_summary.csv'])
    run(conn, 'Inventory with 2 warehouses', 'inventory', S['inventory_two_locations.csv'],
        note='same product and date in two locations')
    run(conn, 'Bank statement expenses', 'expenses', S['bank_statement_expenses.csv'],
        mapping={'date': 'Date', 'category': 'Description', 'amount': 'Debit', 'description': 'Description'},
        note='Credit rows (income) have no home in expenses')
    run(conn, 'Review export', 'feedback', S['reviews_export.csv'])
    run(conn, 'Pivot file (months as columns)', 'sales', S['sales_pivot_wide.csv'])
    run(conn, 'Sales with Currency column', 'sales', S['sales_multi_currency.csv'])
    run(conn, 'Sales with tax/discount/shipping', 'sales', S['sales_with_tax_discount.csv'])
    json.dump(OUT, open(os.path.join(HERE, 'fit_results.json'), 'w'), indent=1, default=str)
    print('\nSummary (compare with report.md):')
    for r in OUT: print('  %-36s %-24s loaded=%-8s rejected=%s' % (r['label'], r['status'], r.get('loaded', 0), r.get('rejected', 0)))
    conn.close()

if __name__ == '__main__':
    main()
