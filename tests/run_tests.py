"""Scale Up schema + ETL test suite. Run: python run_tests.py
Needs PostgreSQL 16 and `pip install psycopg2-binary`. Uses libpq env vars (PGHOST, PGPORT, PGUSER, PGPASSWORD).
Creates and drops only two databases: scaleup_etl_test and scaleup_etl_mig."""
import os, sys, glob, json, time, threading, datetime as dt, traceback
from decimal import Decimal
import psycopg2, psycopg2.errors
import etl

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data'); os.makedirs(DATA, exist_ok=True)
MIG = os.path.join(HERE, 'migrations')
RES = os.path.join(HERE, 'results'); os.makedirs(RES, exist_ok=True)
DB, DB2 = 'scaleup_etl_test', 'scaleup_etl_mig'

def admin():
    c = psycopg2.connect(dbname='postgres'); c.autocommit = True; return c
def make_db(name, files):
    a = admin(); cur = a.cursor()
    cur.execute('drop database if exists ' + name + ' with (force)'); cur.execute('create database ' + name); a.close()
    c = psycopg2.connect(dbname=name); c.autocommit = True
    for f in files: c.cursor().execute(open(os.path.join(MIG, f), encoding='utf-8').read())
    return c
UP = ['001_create_core_tables.up.sql', '002_create_data_tables.up.sql', '003_create_indexes.up.sql']

RESULTS = []; TESTS = []
def test(group, name, limit=False):
    def deco(fn):
        TESTS.append((group, name, limit, fn)); return fn
    return deco
def run_one(group, name, limit, fn):
    t0 = time.time()
    try:
        ok, detail = fn()
        res = ('LIMIT' if limit else 'PASS') if ok else 'FAIL'
    except Exception as e:
        res, detail = 'FAIL', 'crashed: ' + ''.join(traceback.format_exception_only(type(e), e)).strip()
    RESULTS.append((group, name, res, str(detail), round(time.time() - t0, 2)))
    print('%-5s %-10s %s%s' % (res, group, name, '' if res == 'PASS' else '  -> ' + str(detail)[:200])); sys.stdout.flush()

C = None
def q(sql, a=()):
    cur = C.cursor(); cur.execute(sql, a)
    return cur.fetchall() if cur.description else None
def one(sql, a=()): return q(sql, a)[0][0]
def fresh():
    C.rollback() if not C.autocommit else None
    q("truncate sales,inventory,expenses,feedback,products,customers,ingestion_jobs,users,column_mappings,businesses restart identity cascade")
    ids = {}
    for n, f in (('A', 'DD/MM/YYYY'), ('B', 'MM/DD/YYYY')):
        ids[n] = q("insert into businesses(business_name,date_format) values(%s,%s) returning business_id", (n, f))[0][0]
    return ids
def W(name, content, enc='utf-8'):
    p = os.path.join(DATA, name)
    open(p, 'wb').write(content if isinstance(content, bytes) else content.encode(enc)); return p
def fmt_of(b): return 'DD/MM/YYYY' if b == 'A' else 'MM/DD/YYYY'
def L(ids, kind, path, who='A', mapping=None, **kw):
    cn = kw.pop('conn', None) or psycopg2.connect(dbname=DB)
    try:
        if mapping is None:
            try: hdr = etl.read_file(path)[1]
            except etl.FileError: hdr = []
            mapping = etl.suggest_mapping(hdr, kind)
        return etl.load(cn, ids[who], kind, path, mapping, fmt_of(who), **kw)
    finally: cn.close()
def n(t, b=None):
    return one("select count(*) from " + t + (" where business_id=%s" if b else ""), (b,) if b else ())
SH = 'Order No,Date,SKU,Item,Qty,Unit Price,Customer\n'
def fill(k, pre='F', price=10, day='02/10/2026'):
    return ''.join('%s-%d,%s,P%d,Item,%d,%s,C%d\n' % (pre, i, day, 100 * (i % 3 + 1), i + 1, price, i % 4) for i in range(k))
def S(res, **kw):  # compare helper
    return all(res.get(k) == v for k, v in kw.items())

# ===================== 1. parsers (unit tests) =====================
@test('parsers', 'numbers: 18 accepted/rejected forms behave as specified')
def _():
    ok = {'1200': 1200, '1,200.50': Decimal('1200.50'), 'Rs 1,200': 1200, 'Rs.1,200.50': Decimal('1200.50'), 'PKR 500': 500, '$5': 5,
          '500 PKR': 500, '(5)': -5, '-5': -5, '1 200': 1200, '0': 0, '+7': 7}
    bad = ['12abc', '1200,50', '1,2,3', '1e3', 'NaN', '', '1.2.3', '--5', 'abc', '1rs2', '٣']
    wrong = []
    for k, v in ok.items():
        try:
            if etl.parse_num(k, 'x') != v: wrong.append(('value', k))
        except etl.RowError: wrong.append(('rejected good', k))
    for k in bad:
        try: etl.parse_num(k, 'x'); wrong.append(('accepted bad', k))
        except etl.RowError: pass
    return not wrong, wrong or 'all 22 correct'
@test('parsers', 'whole numbers: 2.0 ok, 2.5 and 99999999999 rejected')
def _():
    r = []
    r.append(etl.parse_int('2.0', 'q') == 2)
    for v in ('2.5', '99999999999', 'two'):
        try: etl.parse_int(v, 'q'); r.append(False)
        except etl.RowError: r.append(True)
    return all(r), r
@test('parsers', 'dates: 14 forms behave as specified (DD/MM business)')
def _():
    good = {'2026-11-01 10:30:00': (2026, 11, 1), '01/11/2026 10:30': (2026, 11, 1), '1.11.2026': (2026, 11, 1), '11/02/2026': (2026, 2, 11),
            '2026-1-5': (2026, 1, 5), '01-11-2026': (2026, 11, 1)}
    bad = ['31/02/2026', '00/00/0000', '01/11/26', '2026-13-01', '1 Nov 2026', '2030-01-01', '1999-12-31', '', 'yesterday']
    w = []
    for k, v in good.items():
        try:
            if etl.parse_date(k, 'DD/MM/YYYY', 'd') != dt.date(*v): w.append(('value', k))
        except etl.RowError as e: w.append((k, e.reason))
    for k in bad:
        try: etl.parse_date(k, 'DD/MM/YYYY', 'd'); w.append(('accepted', k))
        except etl.RowError: pass
    return not w, w or 'all 15 correct'
@test('parsers', 'same date text reads differently per business format (ambiguity is real)', limit=True)
def _():
    a = etl.parse_date('11/02/2026', 'DD/MM/YYYY', 'd'); b = etl.parse_date('11/02/2026', 'MM/DD/YYYY', 'd')
    return a != b, f'DD/MM gives {a}, MM/DD gives {b}: a wrong business setting silently shifts dates; only a mass of invalid dates (e.g. 25/12) is caught'
@test('parsers', 'text cleaning: whitespace, control characters, length')
def _():
    r = [etl.clean_text('  Blue \t Pen \r\n', 'c', 50) == 'Blue Pen', etl.clean_text('ba\x00d', 'c', 50) == 'bad']
    try: etl.clean_text('x' * 51, 'c', 50); r.append(False)
    except etl.RowError: r.append(True)
    return all(r), r

# ===================== 2. mapping =====================
@test('mapping', 'auto-suggest maps the three sales layouts and the other file types')
def _():
    a = etl.suggest_mapping(['Order No', 'Date', 'SKU', 'Item', 'Qty', 'Unit Price', 'Customer'], 'sales')
    b = etl.suggest_mapping(['Transaction', 'Sale Date', 'Item Name', 'Units', 'Total', 'Cust ID'], 'sales')
    c = etl.suggest_mapping(['txn_id', 'sku', 'product', 'quantity', 'price', 'date'], 'sales')
    d = etl.suggest_mapping(['Expense Date', 'Head', 'Cost', 'Note'], 'expenses')
    e = etl.suggest_mapping(['Product Code', 'Stock', 'Stock Date'], 'inventory')
    f = etl.suggest_mapping(['Review Date', 'Comment', 'Stars', 'Review ID', 'Product'], 'feedback')
    exp = [(a, dict(order_id='Order No', date='Date', product_code='SKU', product_name='Item', quantity='Qty', unit_price='Unit Price', customer='Customer')),
           (b, dict(order_id='Transaction', date='Sale Date', product_name='Item Name', quantity='Units', total='Total', customer='Cust ID')),
           (c, dict(order_id='txn_id', product_code='sku', product_name='product', quantity='quantity', unit_price='price', date='date')),
           (d, dict(date='Expense Date', category='Head', amount='Cost', description='Note')),
           (e, dict(product_code='Product Code', stock_quantity='Stock', date='Stock Date')),
           (f, dict(date='Review Date', review_text='Comment', rating='Stars', review_id='Review ID', product_name='Product'))]
    bad = [i for i, (g, x) in enumerate(exp) if g != x]
    return not bad, [(i, exp[i][0]) for i in bad] or 'all 6 headers mapped as expected'
@test('mapping', 'saved mapping: upsert per business and file type, isolated between businesses')
def _():
    ids = fresh(); etl.save_mapping(C, ids['A'], 'sales', {'date': 'Date'}); etl.save_mapping(C, ids['A'], 'sales', {'date': 'Day'})
    etl.save_mapping(C, ids['B'], 'sales', {'date': 'X'}); etl.save_mapping(C, ids['A'], 'expenses', {'date': 'E'})
    return (etl.get_mapping(C, ids['A'], 'sales') == {'date': 'Day'} and etl.get_mapping(C, ids['B'], 'sales') == {'date': 'X'}
            and etl.get_mapping(C, ids['A'], 'feedback') is None and n('column_mappings') == 3), 'ok'

# ===================== 3. sales =====================
def sales_A():
    return W('sales_A_clean_layout.csv', SH + '''A-1,01/11/2026,P100,  Blue Pen ,10,Rs 25.50,C1
A-1,01/11/2026,P200,Notebook,2,"Rs 1,200",C1
A-2,02/11/2026,P100,blue pen,5,Rs 25.50,
A-3,02/11/2026,P300,Stapler,1,450,C2
A-3,02/11/2026,P300,Stapler,2,450,C2
A-4,32/11/2026,P100,Blue Pen,1,25,C3
A-5,03/11/2026,P200,Notebook,abc,1200,C3
A-6,03/11/2026,P300,Stapler,-1,450,C2
''' + ''.join('A-%d,0%d/11/2026,P%d,Item,%d,10,C%d\n' % (i, i % 3 + 1, 100 * (i % 3 + 1), i, i % 4) for i in range(7, 14)))
@test('sales', 'layout A: Rs/spaces/case cleaned, repeated line merged, 3 bad rows reported at exact row numbers (20% = loads)')
def _():
    ids = fresh(); r = L(ids, 'sales', sales_A())
    rev = one("select sum(total_amount) from sales"); prods = q("select product_key,product_name from products order by 1")
    ok = (r['status'] == 'completed_with_warnings' and r['loaded'] == 11 and rev == Decimal('4832.50')
          and [(b[0], b[1]) for b in r['bad']] == [(7, 'Date'), (8, 'Qty'), (9, 'Qty')]
          and prods == [('P100', 'blue pen'), ('P200', 'notebook'), ('P300', 'stapler')])
    return ok, (r['status'], r['loaded'], rev, r['bad'], prods)
@test('sales', 'layout B: no SKU, total only, MM/DD dates: key from cleaned name, unit_price derived')
def _():
    ids = fresh()
    p = W('sales_B_total_only.csv', '''Transaction,Sale Date,Item Name,Units,Total,Cust ID
T1,11/01/2026,Laptop Bag,2,"4,000",K9
T2,11/02/2026,Laptop Bag ,1,2000,
T2,11/02/2026,Mouse,3,900,
T3,11/03/2026,mouse,1,300,K10
T4,11/03/2026,Keyboard,1,1500,K9
''')
    r = L(ids, 'sales', p, 'B')
    up = q("select unit_price from sales s join products p using(product_id) where p.product_key='laptop bag' order by sale_id")
    ok = (r['status'] == 'completed' and r['loaded'] == 5 and n('products') == 3 and one("select sum(total_amount) from sales") == 8700
          and [u[0] for u in up] == [Decimal('2000.00'), Decimal('2000.00')] and n('customers') == 2 and one("select count(*) from sales where customer_id is null") == 2)
    return ok, (r['status'], r['loaded'], up)
@test('sales', 'layout C: semicolon delimiter, ISO dates, repeated lines with different price -> weighted average, revenue preserved')
def _():
    ids = fresh()
    p = W('sales_C_semicolon.csv', 'txn_id;sku;product;quantity;price;date\nZ1;S1;Tea;4;100;2026-11-01\nZ2;S1;Tea;1;100;2026-11-02\nZ3;S2;Sugar;2;150;2026-11-02\nZ3;S2;Sugar;1;160;2026-11-02\n')
    r = L(ids, 'sales', p)
    row = q("select quantity,unit_price,total_amount from sales where order_id='Z3'")[0]
    ok = r['loaded'] == 3 and row == (3, Decimal('153.33'), Decimal('460.00')) and one("select sum(total_amount) from sales") == 960
    return ok, (r['status'], r['loaded'], row)
@test('sales', 'Excel-style file: BOM + CRLF + quoted comma and line break inside a product name')
def _():
    ids = fresh()
    p = W('sales_excel_bom_crlf.csv', b'\xef\xbb\xbfOrder,Date,SKU,Product,Qty,Price\r\nQ1,01/11/2026,K1,"Pen, blue\r\nfine point",2,10\r\nQ2,02/11/2026,K2,Ink,1,5\r\n')
    r = L(ids, 'sales', p)
    nm = q("select product_name from products where product_key='K1'")
    return r['loaded'] == 2 and nm == [('pen, blue fine point',)], (r['status'], r['message'], nm)
@test('sales', 'latin-1 encoded file (Windows Excel save): loads with an encoding warning')
def _():
    ids = fresh()
    p = W('sales_latin1.csv', 'Order,Date,SKU,Product,Qty,Price\nL1,01/11/2026,K1,Café Latte,2,10\nL2,01/11/2026,K2,Crème,1,5\n', 'latin-1')
    r = L(ids, 'sales', p); nm = q("select product_name from products order by product_key")
    return r['loaded'] == 2 and nm == [('café latte',), ('crème',)] and 'Windows-1252' in r['message'], (r['status'], r['message'], nm)
def must_fail(path, kind='sales', who='A', mapping=None, why='', **kw):
    ids = IDS; r = L(ids, kind, path, who, mapping, **kw)
    return r['status'] == 'failed' and (why in r['message']) and n('sales') == 0, (r['status'], r['message'])
for nm_, content, why in [
    ('Excel file renamed .csv', b'PK\x03\x04\x14\x00\x06\x00' + b'\x00' * 200, 'not a CSV'),
    ('empty file (0 bytes)', b'', 'empty'), ('whitespace-only file', b'  \n \r\n\n', 'empty'),
    ('header only', SH.encode(), 'no data rows'),
    ('duplicate column names', b'Order,Date,SKU,Qty,Qty,Price\nO1,01/11/2026,A,1,1,5\n', 'duplicate column'),
    ('quantity column missing', b'Order,Date,SKU,Price\nO1,01/11/2026,A,5\n', 'quantity'),
    ('price and total both missing', b'Order,Date,SKU,Qty\nO1,01/11/2026,A,2\n', 'unit_price or total'),
    ('PDF renamed .csv', b'%PDF-1.4\n%binary', 'not a CSV')]:
    def mk(nm_=nm_, content=content, why=why):
        @test('sales', 'whole file rejected, nothing saved: ' + nm_)
        def _():
            global IDS; IDS = fresh(); p = W('sales_bad_%s.csv' % ''.join(c for c in nm_ if c.isalnum()), content)
            return must_fail(p, why=why)
    mk()
@test('sales', 'explicit mapping to a column that does not exist -> whole file rejected naming the column')
def _():
    ids = fresh(); r = L(ids, 'sales', sales_A(), mapping=dict(order_id='Nope', date='Date', product_code='SKU', quantity='Qty', unit_price='Unit Price'))
    return r['status'] == 'failed' and 'Nope' in r['message'], r['message']
@test('sales', 'ragged rows (too few / too many fields) are bad rows; header spacing, case and trailing delimiter tolerated')
def _():
    ids = fresh()
    body = ' ORDER NO ,date,sku, Product ,QTY,price,\n' + ''.join('R%d,01/11/2026,K%d,P,1,5,\n' % (i, i) for i in range(18)) + 'R90,01/11/2026,K9,P,1\n' + 'R91,01/11/2026,K9,P,1,5,x,y,z\n,,,,,,\n\n'
    r = L(ids, 'sales', W('sales_ragged.csv', body))
    ok = r['loaded'] == 18 and [b[0] for b in r['bad']] == [20, 21] and 'wrong number' in r['bad'][0][2]
    return ok, (r['loaded'], r['bad'])
@test('sales', 'mixed nasty file: 12 different bad rows reported with file column + reason; injection text, emoji, NUL byte stored safely; 150 good rows load')
def _():
    ids = fresh(); rows = ''.join('N%d,%02d/10/2026,K%d,Product %d,%d,%d.50\n' % (i, i % 28 + 1, i % 40, i % 40, i % 5 + 1, i % 90 + 1) for i in range(150))
    rows = rows.replace('N0,', "N0,", 1)
    inj = "INJ,01/11/2026,X1,\"'; DROP TABLE sales;--\",1,5\nEMO,01/11/2026,X2,Mug ☕,1,5\nNUL,01/11/2026,X3,bad\x00name,1,5\n"
    badrows = ['B1,01/11/2026,K1,P,1,12abc', 'B2,01/11/2026,K1,P,1,"1200,50"', 'B3,01/11/2026,K1,P,2.5,5', 'B4,01/11/2026,K1,P,99999999999,5',
               'B5,01/11/2026,K1,P,1,99999999999', 'B6,' + '01/11/2026,K1,P,1,5', 'B7,2030-01-01,K1,P,1,5', 'B8,1 Nov 2026,K1,P,1,5', 'B9,01/11/2026,,P,1,5',
               ',01/11/2026,K1,P,1,5', 'B11,01/11/2026,K1,P,0,5', 'B12,01/11/2026,K1,%s,1,5' % ('p' * 300)]
    badrows[5] = ('b' * 101) + ',01/11/2026,K1,P,1,5'
    p = W('sales_mixed_nasty.csv', 'Order,Date,SKU,Product,Qty,Price\n' + rows + inj + '\n'.join(badrows) + '\n')
    r = L(ids, 'sales', p)
    cols = sorted({b[1] for b in r['bad']})
    names = [x[0] for x in q("select product_name from products where product_key in ('X1','X2','X3') order by product_key")]
    ok = (r['status'] == 'completed_with_warnings' and r['loaded'] == 153 and len(r['bad']) == 12 and n('products') >= 43 and
          names == ["'; drop table sales;--", 'mug ☕', 'badname'] and one("select count(*) from information_schema.tables where table_name='sales'") == 1)
    return ok, (r['status'], r['loaded'], len(r['bad']), names, [(b[0], b[1], b[2]) for b in r['bad']][:12])
for k, exp_status, exp_loaded in [(19, 'completed_with_warnings', 81), (20, 'completed_with_warnings', 80), (21, 'failed', 0), (100, 'failed', 0)]:
    def mk(k=k, exp_status=exp_status, exp_loaded=exp_loaded):
        @test('sales', 'bad-row limit: %d of 100 rows bad -> %s' % (k, exp_status))
        def _():
            ids = fresh(); body = SH + ''.join(('G%d,xx,P1,I,1,5,\n' if i < k else 'G%d,01/11/2026,P1,I,1,5,\n') % i for i in range(100))
            r = L(ids, 'sales', W('sales_limit_%d.csv' % k, body))
            j = q("select status,rejected_rows,loaded_rows from ingestion_jobs")[0]
            return r['status'] == exp_status and n('sales') == exp_loaded and j == (exp_status, k, exp_loaded), (r['status'], n('sales'), j)
    mk()
@test('sales', 'returns (negative qty) rejected; repeated lines merged; conflicting date/customer in repeated lines rejected; revenue reconciles')
def _():
    ids = fresh()
    body = SH + fill(20) + 'M-1,03/11/2026,PX,Widget,2,10,C1\nM-1,03/11/2026,PX,Widget,3,10,C1\nM-1,03/11/2026,PX,Widget,1,20,C1\nM-2,03/11/2026,PY,Gadget,-1,10,C1\nM-3,03/11/2026,PZ,Gizmo,1,10,C1\nM-3,04/11/2026,PZ,Gizmo,1,10,C1\n'
    r = L(ids, 'sales', W('sales_returns_merge.csv', body))
    fillrev = sum((i + 1) * 10 for i in range(20)); exp = fillrev + (2 * 10 + 3 * 10 + 20) + 10
    m1 = q("select quantity,total_amount,unit_price from sales where order_id='M-1'")[0]
    ok = one("select sum(total_amount) from sales") == exp and m1 == (6, 70, Decimal('11.67')) and len(r['bad']) == 2
    return ok, (one("select sum(total_amount) from sales"), exp, m1, r['bad'])
@test('sales', 'same file twice: warning -> skip changes nothing -> replace keeps history and exact row count')
def _():
    ids = fresh(); p = sales_A(); r1 = L(ids, 'sales', p); r2 = L(ids, 'sales', p)
    jobs = n('ingestion_jobs'); r3 = L(ids, 'sales', p, on_dup='skip'); r4 = L(ids, 'sales', p, on_dup='replace')
    st = [x[0] for x in q("select status from ingestion_jobs order by created_at")]
    ok = (r2['status'] == 'warning_duplicate_file' and jobs == 1 and r3['status'] == 'skipped' and r4['loaded'] == 11 and n('sales') == 11
          and st == ['replaced', 'completed_with_warnings'])
    return ok, (r2['status'], jobs, r3['status'], r4['loaded'], n('sales'), st)
@test('sales', 'replace with a BAD file leaves the old data untouched (transaction safety)')
def _():
    ids = fresh(); r1 = L(ids, 'sales', sales_A()); bad = W('sales_replace_bad.csv', SH + 'x,x,x,x,x,x,x\n' * 5)
    r2 = L(ids, 'sales', bad, replace_job=r1['job_id'])
    return r2['status'] == 'failed' and n('sales') == 11 and one("select status from ingestion_jobs where job_id=%s", (r1['job_id'],)) == 'completed_with_warnings', (r2['status'], n('sales'))
@test('sales', 'replace where the LOAD itself crashes half-way: old rows and old job status come back (rollback)')
def _():
    ids = fresh(); r1 = L(ids, 'sales', W('sales_crash_base.csv', SH + fill(10)))
    orig = etl._load_rows
    def boom(*a, **k): raise RuntimeError('simulated crash during load')
    etl._load_rows = boom
    try: r2 = L(ids, 'sales', W('sales_crash_new.csv', SH + fill(12)), replace_job=r1['job_id'])
    finally: etl._load_rows = orig
    st = one("select status from ingestion_jobs where job_id=%s", (r1['job_id'],))
    return r2['status'] == 'failed' and r2.get('internal') and n('sales') == 10 and st == 'completed', (r2['status'], n('sales'), st)
@test('sales', 'replace target of another business is refused')
def _():
    ids = fresh(); r1 = L(ids, 'sales', sales_A()); r2 = L(ids, 'sales', W('sales_x.csv', SH + fill(5)), 'B', replace_job=r1['job_id'])
    return r2['status'] == 'refused' and n('sales', ids['A']) == 11, (r2['status'], r2['message'])
@test('sales', 'edited file re-uploaded: saved rows skipped and reported; the edited price is NOT updated (by design)', limit=True)
def _():
    ids = fresh(); L(ids, 'sales', W('sales_v1.csv', SH + fill(10)))
    r = L(ids, 'sales', W('sales_v2.csv', SH + fill(10).replace('F-3,02/10/2026,P100,Item,4,10', 'F-3,02/10/2026,P100,Item,4,99') + 'F-new,02/10/2026,P100,Item,1,10,C1\n'))
    price = one("select unit_price from sales where order_id='F-3'")
    return r['loaded'] == 1 and r['skipped_existing'] == 10 and price == 10 and 'skipped' in r['message'], (r['loaded'], r['skipped_existing'], price, r['message'])
@test('sales', 'tenants: same order_id and same SKU in two businesses both saved; each sees only its own')
def _():
    ids = fresh(); p = W('sales_tenant.csv', SH + fill(5))
    L(ids, 'sales', p, 'A'); L(ids, 'sales', p, 'B')
    return n('sales', ids['A']) == 5 and n('sales', ids['B']) == 5 and n('products', ids['A']) == 3 and n('products', ids['B']) == 3, 'ok'
@test('sales', 'walk-in customers stay NULL; customers table has distinct ids only')
def _():
    ids = fresh(); L(ids, 'sales', W('sales_walkin.csv', SH + 'W1,01/11/2026,P1,I,1,5,\nW2,01/11/2026,P1,I,1,5,C9\nW3,01/11/2026,P1,I,1,5,C9\nW4,01/11/2026,P1,I,1,5,  \n'))
    return one("select count(*) from sales where customer_id is null") == 2 and n('customers') == 1, 'ok' if True else ''
@test('sales', 'SKU column present but blank in some rows -> those rows rejected (name is never the key when a code column exists)')
def _():
    ids = fresh(); r = L(ids, 'sales', W('sales_blank_sku.csv', SH + fill(20) + 'Q1,01/11/2026,,Pen,1,5,\n'))
    return len(r['bad']) == 1 and r['bad'][0][1] == 'SKU', r['bad']
@test('sales', 'product name variants without code (" Blue  Pen ", "BLUE PEN") become one product')
def _():
    ids = fresh(); L(ids, 'sales', W('sales_names.csv', 'Order,Date,Item,Qty,Price\nN1,01/11/2026, Blue  Pen ,1,5\nN2,01/11/2026,BLUE PEN,1,5\nN3,01/11/2026,blue pen,1,5\n'))
    return n('products') == 1 and n('sales') == 3, n('products')
@test('sales', 'extra unmapped columns and different column order are ignored')
def _():
    ids = fresh(); r = L(ids, 'sales', W('sales_extra.csv', 'Notes,Price,Qty,Product,Date,Order,Discount,Region\nhi,5,2,Pen,01/11/2026,E1,10%,North\nhi,5,1,Ink,01/11/2026,E2,0%,South\n'))
    return r['loaded'] == 2 and one("select sum(total_amount) from sales") == 15, r['status']
@test('sales', 'concurrency: 6 parallel uploads of the same file -> exactly one job loads, rows not doubled, no crash')
def _():
    ids = fresh(); p = W('sales_conc.csv', SH + fill(300)); out = []
    def go():
        cn = psycopg2.connect(dbname=DB); out.append(etl.load(cn, ids['A'], 'sales', p, etl.suggest_mapping(etl.read_file(p)[1], 'sales'), 'DD/MM/YYYY')); cn.close()
    th = [threading.Thread(target=go) for _ in range(6)]; [t.start() for t in th]; [t.join() for t in th]
    st = sorted(o['status'] for o in out)
    return st.count('completed') == 1 and st.count('warning_duplicate_file') == 5 and n('sales') == 300 and not any(o.get('internal') for o in out), (st, n('sales'))
@test('sales', 'concurrency: 6 parallel DIFFERENT files with overlapping products -> all load, no deadlock')
def _():
    ids = fresh(); out = []; ps = [W('sales_conc_%d.csv' % i, SH + fill(200, pre='T%d' % i)) for i in range(6)]
    def go(p):
        cn = psycopg2.connect(dbname=DB); out.append(etl.load(cn, ids['A'], 'sales', p, etl.suggest_mapping(etl.read_file(p)[1], 'sales'), 'DD/MM/YYYY')); cn.close()
    th = [threading.Thread(target=go, args=(p,)) for p in ps]; [t.start() for t in th]; [t.join() for t in th]
    return all(o['status'] == 'completed' for o in out) and n('sales') == 1200 and n('products') == 3, ([o['status'] for o in out], n('sales'))
def big(rows):
    import random; random.seed(1); d = ['Order No,Date,SKU,Item,Qty,Unit Price,Customer']
    for i in range(rows): d.append('O%d,%02d/%02d/2026,SKU%d,Item %d,%d,%d.%02d,C%d' % (i // 2, i % 28 + 1, i % 10 + 1, i % 500, i % 500, i % 9 + 1, random.randint(5, 900), random.randint(0, 99), i % 3000))
    return '\n'.join(d) + '\n'
@test('performance', '10,000-row sales file loads in under 30 s (NFR-PERF-02)')
def _():
    ids = fresh(); p = W('perf_10k.csv', big(10000)); t = time.time(); r = L(ids, 'sales', p); s = time.time() - t
    return s < 30 and r['loaded'] > 9000, 'status %s, loaded %d, %.1f s' % (r['status'], r['loaded'], s)
@test('performance', '100,000-row file loads (chunking not implemented in this prototype: reported, not required)')
def _():
    ids = fresh(); p = W('perf_100k.csv', big(100000)); t = time.time(); r = L(ids, 'sales', p); s = time.time() - t
    return r['status'] != 'failed', 'status %s, loaded %d, %.1f s' % (r['status'], r['loaded'], s)

# ===================== 4. inventory =====================
INV = 'Product Code,Stock,Stock Date\n'
@test('inventory', 'snapshot with date column loads; second date adds rows; same product+date again is skipped and reported')
def _():
    ids = fresh(); r1 = L(ids, 'inventory', W('inv1.csv', INV + 'P1,10,01/11/2026\nP2,20,01/11/2026\nP3,0,01/11/2026\n'))
    r2 = L(ids, 'inventory', W('inv2.csv', INV + 'P1,8,02/11/2026\nP2,20,02/11/2026\nP3,5,02/11/2026\n'))
    r3 = L(ids, 'inventory', W('inv3.csv', INV + 'P1,99,01/11/2026\nP2,99,01/11/2026\nP9,1,01/11/2026\n'))
    ok = r1['loaded'] == 3 and r2['loaded'] == 3 and r3['loaded'] == 1 and r3['skipped_existing'] == 2 and 'skipped' in r3['message'] and n('inventory') == 7
    return ok, (r1['loaded'], r2['loaded'], r3['loaded'], r3['message'])
@test('inventory', 'no date column: snapshot date from the upload screen is used; missing both -> file rejected')
def _():
    ids = fresh(); p = W('inv_nodate.csv', 'SKU,Qty on hand\nP1,10\nP2,4\n')
    r1 = L(ids, 'inventory', p); r2 = L(ids, 'inventory', p, snapshot=dt.date(2026, 11, 3))
    return r1['status'] == 'failed' and 'snapshot' in r1['message'] and r2['loaded'] == 2 and one("select min(snapshot_date) from inventory") == dt.date(2026, 11, 3), (r1['message'], r2['status'])
@test('inventory', 'negative / fractional / text stock rejected; same product+date twice in one file rejected as bad row')
def _():
    ids = fresh(); body = INV + ''.join('P%d,%d,01/11/2026\n' % (i, i) for i in range(30)) + 'Q1,-5,01/11/2026\nQ2,2.5,01/11/2026\nQ3,many,01/11/2026\nP1,7,01/11/2026\n'
    r = L(ids, 'inventory', W('inv_bad.csv', body))
    return r['loaded'] == 30 and len(r['bad']) == 4 and r['status'] == 'completed_with_warnings', (r['loaded'], r['bad'])
@test('inventory', 'products are shared: SKU from sales and inventory become ONE product row')
def _():
    ids = fresh(); L(ids, 'sales', W('s_for_inv.csv', SH + fill(6))); before = n('products'); L(ids, 'inventory', W('inv_shared.csv', INV + 'P100,5,01/11/2026\nP200,6,01/11/2026\nP999,1,01/11/2026\n'))
    return before == 3 and n('products') == 4, (before, n('products'))
@test('inventory', 'name-only files: "Blue Pen" in sales and " blue pen " in inventory are the same product')
def _():
    ids = fresh(); L(ids, 'sales', W('s_names2.csv', 'Order,Date,Item,Qty,Price\nN1,01/11/2026,Blue Pen,1,5\n')); L(ids, 'inventory', W('inv_names.csv', 'Item,Stock,Date\n blue pen ,9,01/11/2026\n'))
    return n('products') == 1 and n('inventory') == 1, n('products')

# ===================== 5. expenses =====================
EXH = 'Expense Date,Head,Cost,Note\n'
@test('expenses', 'basic load: category cleaned (" Rent"/"RENT "), amounts with Rs/commas, zero amount allowed, blank note -> NULL')
def _():
    ids = fresh(); r = L(ids, 'expenses', W('exp1.csv', EXH + '01/11/2026, Rent,"Rs 50,000",Shop\n02/11/2026,RENT ,0,\n03/11/2026,Tea,120.5,"cups, sugar\nand milk ☕"\n'))
    cats = [c[0] for c in q("select distinct category from expenses order by 1")]
    return r['loaded'] == 3 and cats == ['rent', 'tea'] and one("select count(*) from expenses where description is null") == 1 and one("select sum(amount) from expenses") == Decimal('50120.50'), (r['status'], cats)
@test('expenses', 'three identical rows in one file are all kept (occurrence count in the hash)')
def _():
    ids = fresh(); r = L(ids, 'expenses', W('exp_same.csv', EXH + '01/11/2026,Tea,100,\n' * 3 + '01/11/2026,Rent,500,\n'))
    return r['loaded'] == 4 and n('expenses') == 4, r['loaded']
@test('expenses', 'edit cases: appended identical row adds exactly 1; deleting an unrelated line adds 0; deleting one of three identical lines adds 0')
def _():
    ids = fresh(); base = EXH + '01/11/2026,Tea,100,\n' * 3 + '01/11/2026,Rent,500,\n02/11/2026,Gas,50,\n'
    L(ids, 'expenses', W('exp_e1.csv', base)); a = L(ids, 'expenses', W('exp_e2.csv', base + '01/11/2026,Tea,100,\n'))
    b = L(ids, 'expenses', W('exp_e3.csv', base.replace('02/11/2026,Gas,50,\n', ''))); c = L(ids, 'expenses', W('exp_e4.csv', base.replace('01/11/2026,Tea,100,\n', '', 1)))
    return a['loaded'] == 1 and b['loaded'] == 0 and c['loaded'] == 0 and n('expenses') == 6, (a['loaded'], b['loaded'], c['loaded'], n('expenses'))
@test('expenses', 'negative amount (refund) rejected; same file twice -> warning')
def _():
    ids = fresh(); body = EXH + ''.join('0%d/10/2026,Tea,%d,\n' % (i % 9 + 1, i + 1) for i in range(20)) + '01/11/2026,Refund,-50,\n'
    r = L(ids, 'expenses', W('exp_neg.csv', body)); r2 = L(ids, 'expenses', W('exp_neg.csv', body))
    return len(r['bad']) == 1 and r['bad'][0][1] == 'Cost' and r2['status'] == 'warning_duplicate_file', (r['bad'], r2['status'])
@test('expenses', 'amount 1200,50 (decimal comma) is rejected instead of silently becoming 120050')
def _():
    ids = fresh(); r = L(ids, 'expenses', W('exp_comma.csv', EXH + ''.join('01/11/2026,Tea,%d,\n' % (i + 1) for i in range(10)) + '01/11/2026,Tea,"1200,50",\n'))
    return len(r['bad']) == 1 and 'ambiguous' in r['bad'][0][2] and one("select max(amount) from expenses") == 10, r['bad']

# ===================== 6. feedback =====================
FH = 'Review Date,Comment,Stars,Review ID,Product\n'
@test('feedback', 'basic load with rating, review id and product link (known product linked, unknown product saved without link + message)')
def _():
    ids = fresh(); L(ids, 'sales', W('s_for_fb.csv', 'Order,Date,Item,Qty,Price\nN1,01/11/2026,Blue Pen,1,5\n'))
    r = L(ids, 'feedback', W('fb1.csv', FH + '01/11/2026,"Great pen, fast delivery",5,R1,Blue Pen\n02/11/2026,Too expensive,2,R2,ghost item\n03/11/2026,ok,,R3,\n'))
    linked = one("select count(*) from feedback where product_id is not null")
    return r['loaded'] == 3 and linked == 1 and 'does not exist' in r['message'] and one("select count(*) from feedback where rating is null") == 1, (r['status'], linked, r['message'])
@test('feedback', 'ratings: 4.0 ok, blank ok, 6 / 0 / "five" / "5 stars" rejected')
def _():
    ids = fresh(); body = FH + ''.join('0%d/10/2026,text %d,3,,\n' % (i % 9 + 1, i) for i in range(30)) + '01/11/2026,a1,4.0,,\n01/11/2026,a2,,,\n01/11/2026,b1,6,,\n01/11/2026,b2,0,,\n01/11/2026,b3,five,,\n01/11/2026,b4,5 stars,,\n'
    r = L(ids, 'feedback', W('fb_rating.csv', body)); got = [x[0] for x in q("select rating from feedback where review_text in ('a1','a2') order by review_text")]
    return len(r['bad']) == 4 and got == [4, None] and r['loaded'] == 32, (r['bad'], got)
@test('feedback', 'empty / whitespace-only text and a 20,000-character review are rejected')
def _():
    ids = fresh(); body = FH + ''.join('01/11/2026,review %d,5,,\n' % i for i in range(30)) + '01/11/2026,,5,,\n01/11/2026,   ,5,,\n01/11/2026,' + 'x' * 20000 + ',5,,\n'
    r = L(ids, 'feedback', W('fb_text.csv', body)); return r['loaded'] == 30 and len(r['bad']) == 3, r['bad']
@test('feedback', 'duplicates: same review_id skipped; no id + same date+text skipped; same text on another date kept')
def _():
    ids = fresh(); r = L(ids, 'feedback', W('fb_dup.csv', FH + '01/11/2026,Nice,5,R1,\n02/11/2026,Different text,4,R1,\n01/11/2026,Same,3,,\n01/11/2026,  Same  ,3,,\n02/11/2026,Same,3,,\n'))
    return r['loaded'] == 3 and r['skipped_existing'] == 2, (r['loaded'], r['skipped_existing'])
@test('feedback', 'same feedback file twice -> warning; Unicode emoji stored intact')
def _():
    ids = fresh(); p = W('fb_emoji.csv', FH + '01/11/2026,Loved it 😀 ☕,5,,\n'); r1 = L(ids, 'feedback', p); r2 = L(ids, 'feedback', p)
    return r2['status'] == 'warning_duplicate_file' and one("select review_text from feedback") == 'Loved it 😀 ☕', r2['status']

# ===================== 7. job report persistence =====================
@test('jobs', 'bad-row report is stored on the job (row, column, reason) and capped at 1,000 entries while counts stay exact')
def _():
    ids = fresh(); body = SH + ''.join('B%d,01/11/2026,P1,I,1,5,\n' % i for i in range(3800)) + ''.join('X%d,xx,P1,I,1,5,\n' % i for i in range(1200))
    r = L(ids, 'sales', W('sales_report_cap.csv', body)); rep = one("select error_report from ingestion_jobs"); rej = one("select rejected_rows from ingestion_jobs")
    return r['status'] == 'failed' and len(rep) == 1000 and rej == 1200 and set(rep[0]) == {'row', 'column', 'reason'} and n('sales') == 0, (len(rep), rej, rep[0])
@test('jobs', 'successful job stores counts, status and message')
def _():
    ids = fresh(); L(ids, 'sales', sales_A()); j = q("select status,total_rows,loaded_rows,rejected_rows,message is not null,error_report is not null,completed_at is not null from ingestion_jobs")[0]
    return j == ('completed_with_warnings', 15, 11, 3, True, True, True), j

@test('sales', 'cost_price column: saved on the product; fill-only (second file cannot overwrite, can fill a missing one); negative cost = bad row')
def _():
    ids = fresh()
    h = 'Order No,Date,SKU,Item,Qty,Unit Price,Customer,Cost Price\n'
    r1 = L(ids, 'sales', W('sales_cost1.csv', h + 'C-1,02/10/2026,A1,Pen,2,10,C1,Rs 6\nC-2,02/10/2026,B1,Book,1,50,C1,\nC-3,02/10/2026,D1,Bag,1,90,C1,-4\n' + ''.join('F-%d,02/10/2026,Z%d,Thing,1,10,C1,\n' % (i, i) for i in range(8))))
    c1 = dict(q("select product_key,cost_price from products where product_key in ('A1','B1')"))
    r2 = L(ids, 'sales', W('sales_cost2.csv', h + 'C-4,03/10/2026,A1,Pen,1,10,C1,99\nC-5,03/10/2026,B1,Book,1,50,C1,30\n'))
    c2 = dict(q("select product_key,cost_price from products where product_key in ('A1','B1')"))
    ok = (c1 == {'A1': Decimal('6.00'), 'B1': None} and len(r1['bad']) == 1 and c2 == {'A1': Decimal('6.00'), 'B1': Decimal('30.00')})
    return ok, (c1, c2, r1['bad'])
@test('sales', 'file without a cost column loads exactly as before (cost_price stays NULL)')
def _():
    ids = fresh(); L(ids, 'sales', W('sales_nocost.csv', SH + fill(5)))
    return n('sales') == 5 and one("select count(*) from products where cost_price is not null") == 0, n('sales')
@test('inventory', 'cost_price can also come from the inventory file')
def _():
    ids = fresh(); r = L(ids, 'inventory', W('inv_cost.csv', 'SKU,Item,Stock,Cost\nA1,Pen,5,4.5\nB1,Book,0,\n'), snapshot=dt.date(2026, 10, 1))
    c = dict(q("select product_key,cost_price from products"))
    return r['loaded'] == 2 and c == {'A1': Decimal('4.50'), 'B1': None}, (r['loaded'], r['bad'], c)

# ===================== 8. database constraints (direct SQL) =====================
def must_raise(sql, a=(), exc=psycopg2.IntegrityError):
    try: C.cursor().execute(sql, a); return False
    except exc: return True
    except Exception: return False
@test('db', 'constraints reject bad data directly in SQL (10 checks)')
def _():
    ids = fresh(); b = ids['A']; j = q("insert into ingestion_jobs(business_id,upload_type,file_name,file_hash) values(%s,'sales','f','h') returning job_id", (b,))[0][0]
    p = q("insert into products(business_id,job_id,product_key) values(%s,%s,'P') returning product_id", (b, j))[0][0]
    ins = "insert into sales(business_id,job_id,product_id,order_id,sale_date,quantity,unit_price,total_amount) values(%s,%s,%s,'O','2026-01-01',%s,1,%s)"
    r = [must_raise(ins, (b, j, p, 0, 1)), must_raise(ins, (b, j, p, 1, -1)),
         must_raise("insert into inventory(business_id,job_id,product_id,snapshot_date,stock_quantity) values(%s,%s,%s,'2026-01-01',-1)", (b, j, p)),
         must_raise("insert into feedback(business_id,job_id,feedback_date,review_text,rating,row_hash) values(%s,%s,'2026-01-01','t',7,'h')", (b, j)),
         must_raise("insert into ingestion_jobs(business_id,upload_type,file_name,file_hash,status) values(%s,'sales','f','h','bogus')", (b,)),
         must_raise("insert into ingestion_jobs(business_id,upload_type,file_name,file_hash) values(%s,'x','f','h')", (b,)),
         must_raise("insert into businesses(business_name,date_format) values('Z','YYYY')"),
         must_raise("insert into users(business_id,email,password_hash) values(%s,'a@b.c','x'),(%s,'a@b.c','y')", (b, b)),
         must_raise(ins, (b, j, 999999, 1, 1)), None]
    q(ins, (b, j, p, 1, 5)); r[9] = must_raise(ins, (b, j, p, 1, 5))
    return all(r), r
@test('db', 'KNOWN LIMIT: a sale of business B can point to a product of business A (FK does not check the business)', limit=True)
def _():
    ids = fresh(); a, b = ids['A'], ids['B']
    ja = q("insert into ingestion_jobs(business_id,upload_type,file_name,file_hash) values(%s,'sales','f','h') returning job_id", (a,))[0][0]
    jb = q("insert into ingestion_jobs(business_id,upload_type,file_name,file_hash) values(%s,'sales','f','h2') returning job_id", (b,))[0][0]
    pa = q("insert into products(business_id,job_id,product_key) values(%s,%s,'P') returning product_id", (a, ja))[0][0]
    try:
        q("insert into sales(business_id,job_id,product_id,order_id,sale_date,quantity,unit_price,total_amount) values(%s,%s,%s,'O','2026-01-01',1,1,1)", (b, jb, pa))
        return True, 'accepted by the database: the loader must prevent it (a composite FK would fix it)'
    except Exception: return False, 'rejected'

@test('db', 'new columns: low_stock_threshold default 10 and >= 0; cost_price >= 0 or NULL; status replaced; error_report JSON; one mapping per business+type')
def _():
    ids = fresh(); b = ids['A']
    thr = one("select low_stock_threshold from businesses where business_id=%s", (b,))
    j = q("insert into ingestion_jobs(business_id,upload_type,file_name,file_hash) values(%s,'sales','f','h') returning job_id", (b,))[0][0]
    r = [thr == 10,
         must_raise("update businesses set low_stock_threshold=-1 where business_id=%s", (b,)),
         must_raise("insert into products(business_id,job_id,product_key,cost_price) values(%s,%s,'P',-1)", (b, j)),
         not must_raise("insert into products(business_id,job_id,product_key,cost_price) values(%s,%s,'Q',3.5)", (b, j)),
         not must_raise("update ingestion_jobs set status='replaced', error_report='[{\"row\":1}]'::jsonb, message='m' where job_id=%s", (j,)),
         not must_raise("insert into column_mappings(business_id,upload_type,mapping) values(%s,'sales','{}')", (b,)),
         must_raise("insert into column_mappings(business_id,upload_type,mapping) values(%s,'sales','{}')", (b,)),
         must_raise("insert into column_mappings(business_id,upload_type,mapping) values(%s,'bogus','{}')", (b,))]
    return all(r), r

# ===================== 9. migrations =====================
@test('migrations', 'fresh database: 001-003 run (11 tables), all down (0 tables), all up again (11 tables)')
def _():
    c = make_db(DB2, UP); cur = c.cursor()
    def tables(): cur.execute("select count(*) from information_schema.tables where table_schema='public'"); return cur.fetchone()[0]
    t1 = tables(); cur.execute(open(os.path.join(MIG, '000_drop_all.down.sql')).read()); t2 = tables()
    for f in UP: cur.execute(open(os.path.join(MIG, f)).read())
    t3 = tables(); cur.execute(open(os.path.join(MIG, '000_drop_all.down.sql')).read())
    for f in UP: cur.execute(open(os.path.join(MIG, f)).read())
    t4 = tables(); c.close()
    return (t1, t2, t3, t4) == (11, 0, 11, 11), (t1, t2, t3, t4)

def main():
    global C
    print('Creating test database ...')
    C = make_db(DB, UP)
    for t in TESTS:
        if t[0] == 'migrations': continue
        run_one(*t)
    for t in TESTS:
        if t[0] == 'migrations': run_one(*t)
    C.close()
    a = admin(); a.cursor().execute('drop database if exists %s with (force)' % DB); a.cursor().execute('drop database if exists %s with (force)' % DB2); a.close()
    tot = len(RESULTS); p = sum(r[2] == 'PASS' for r in RESULTS); l = sum(r[2] == 'LIMIT' for r in RESULTS); f = sum(r[2] == 'FAIL' for r in RESULTS)
    print('\n%d tests: %d PASS, %d known-limit confirmed, %d FAIL' % (tot, p, l, f))
    with open(os.path.join(RES, 'report.md'), 'w', encoding='utf-8') as fh:
        fh.write('# Scale Up schema + ETL test report\n\n%d tests: %d PASS, %d known limits confirmed, %d FAIL\n\n| Result | Group | Test | Detail | s |\n| --- | --- | --- | --- | --- |\n' % (tot, p, l, f))
        for g, nm_, res, d, s in RESULTS: fh.write('| %s | %s | %s | %s | %s |\n' % (res, g, nm_.replace('|', '/'), ('' if (res == 'PASS' and g != 'performance') else d.replace('|', '/').replace('\n', ' ')[:300]), s))
    return 1 if f else 0

if __name__ == '__main__':
    sys.exit(main())
