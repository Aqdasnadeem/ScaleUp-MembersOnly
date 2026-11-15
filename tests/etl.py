"""Scale Up ETL prototype: read -> validate -> clean -> merge -> load (one transaction).
Prototype for testing the schema and the business rules. Not the final worker code."""
import csv, hashlib, io, json, re, datetime as dt
from decimal import Decimal
import psycopg2

LIMIT = 0.20          # BR-13: config constant
MAX_ERRORS = 1000     # error_report is capped; counts stay exact
NA = {'', 'n/a', 'na', 'null', 'none', 'nan', '-', '--'}
_CUR = r'(?:rs\.?|pkr|usd|\$|£|€)'
CUR_START = re.compile(r'^' + _CUR + r'\s*', re.I)
CUR_END = re.compile(r'\s*' + _CUR + r'$', re.I)
THOUS = re.compile(r'^[0-9]{1,3}(,[0-9]{3})+(\.[0-9]+)?$')
PLAIN = re.compile(r'^[0-9]+(\.[0-9]+)?$')
TIME = re.compile(r'^(.+?)[ T]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?\s*([ap]m)?$', re.I)

class RowError(Exception):
    def __init__(self, col, reason): self.col, self.reason = col, reason

class FileError(Exception):
    pass

# ---------- cell parsers ----------
def parse_num(s, col):
    t = s.strip()
    if t.lower() in NA: raise RowError(col, 'empty')
    neg = False
    if t.startswith('(') and t.endswith(')'): neg, t = True, t[1:-1].strip()
    t = CUR_END.sub('', CUR_START.sub('', t)).replace(' ', '').replace(' ', '')
    if t[:1] in ('+', '-'):
        if neg: raise RowError(col, 'not a number')
        neg, t = t[0] == '-', t[1:]
    if ',' in t:
        if not THOUS.match(t): raise RowError(col, 'ambiguous comma (use 1200.50 or 1,200.50)')
        t = t.replace(',', '')
    elif not PLAIN.match(t): raise RowError(col, 'not a number')
    d = Decimal(t)
    return -d if neg else d

def parse_int(s, col):
    d = parse_num(s, col)
    if d != d.to_integral_value(): raise RowError(col, 'not a whole number')
    if abs(d) > 2_000_000_000: raise RowError(col, 'number too large')
    return int(d)

def parse_date(s, fmt, col):
    t = s.strip()
    if t.lower() in NA: raise RowError(col, 'empty')
    m = TIME.match(t)
    if m: t = m.group(1).strip()
    if re.fullmatch(r'\d{4}-\d{1,2}-\d{1,2}', t):
        y, mo, d = map(int, t.split('-'))
    elif re.fullmatch(r'\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4}', t):
        a, b, y = map(int, re.split(r'[/.\-]', t))
        d, mo = (a, b) if fmt == 'DD/MM/YYYY' else (b, a)
    else:
        raise RowError(col, 'date does not match ' + fmt)
    try: v = dt.date(y, mo, d)
    except ValueError: raise RowError(col, 'not a real date')
    if v < dt.date(2000, 1, 1) or v > dt.date.today() + dt.timedelta(days=1):
        raise RowError(col, 'date out of range (2000-01-01 to today)')
    return v

def clean_text(s, col, maxlen, required=True):
    t = re.sub(r'[\x00-\x08\x0b-\x1f\x7f]', '', s)
    t = re.sub(r'\s+', ' ', t).strip()
    if not t:
        if required: raise RowError(col, 'empty')
        return None
    if len(t) > maxlen: raise RowError(col, 'too long (max %d characters)' % maxlen)
    return t

# ---------- reading ----------
def read_file(path):
    raw = open(path, 'rb').read()
    if not raw.strip(): raise FileError('file is empty')
    if b'\x00' in raw[:4096] or raw[:2] == b'PK' or raw[:4] == b'%PDF':
        raise FileError('not a CSV text file (looks like Excel, PDF or binary)')
    warn = []
    try: text = raw.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = raw.decode('cp1252', errors='replace'); warn.append('file is not UTF-8; read as Windows-1252')
    first = next((l for l in text.splitlines() if l.strip()), '')
    counts = {d: first.count(d) for d in [',', ';', '\t', '|']}
    delim = max(counts, key=counts.get) if max(counts.values()) else ','
    rows = [r for r in csv.reader(io.StringIO(text, newline=''), delimiter=delim)]
    rows = [(i + 1, r) for i, r in enumerate(rows)]
    rows = [(n, r) for n, r in rows if any(c.strip() for c in r)]
    if not rows: raise FileError('file is empty')
    hdr = [h.strip() for h in rows[0][1]]
    while hdr and hdr[-1] == '': hdr.pop()
    norm = [h.lower() for h in hdr]
    if len(set(norm)) != len(norm): raise FileError('duplicate column names in header')
    if len(rows) < 2: raise FileError('file has a header but no data rows')
    return raw, hdr, norm, rows[1:], warn

SYN = {
 'order_id': 'order no|order id|order|invoice|invoiceno|invoice no|invoice number|transaction|transaction id|txn id|txn_id|receipt|bill no|order number|order name',
 'date': 'date|sale date|order date|invoicedate|invoice date|txn date|transaction date|expense date|review date|date of sale|snapshot date|stock date',
 'product_code': 'sku|stockcode|stock code|product id|productid|product code|item code|code|item id|lineitem sku|variant sku|article code',
 'product_name': 'product|item|item name|description|product name|name|item description|lineitem name|product title',
 'quantity': 'qty|quantity|units|units sold|qty sold|lineitem quantity|quantity sold',
 'unit_price': 'unit price|unitprice|price|rate|price per unit|selling price|lineitem price|mrp',
 'total': 'total|line total|amount|revenue|sales|total amount',
 'customer': 'customer|customer id|customerid|cust id|client|client id|buyer',
 'category': 'category|expense category|type|head',
 'stock_quantity': 'stock|stock quantity|qty on hand|on hand|quantity|qty|stock qty|in stock|units in stock',
 'amount': 'amount|cost|expense|value|total|price|debit|withdrawal|paid out|amount paid',
 'description': 'description|note|notes|details|remarks|memo',
 'review_text': 'review|review text|comment|comments|feedback|text|customer feedback|review body|body|review description|message',
 'rating': 'rating|stars|score|star rating',
 'review_id': 'review id|reviewid|id|feedback id',
 'cost_price': 'cost price|cost|unit cost|purchase price|buying price|cost per unit',
}
FIELDS = {
 'sales': ['order_id', 'date', 'product_code', 'product_name', 'quantity', 'unit_price', 'total', 'customer', 'category', 'cost_price'],
 'inventory': ['product_code', 'product_name', 'stock_quantity', 'date', 'cost_price'],
 'expenses': ['date', 'category', 'amount', 'description'],
 'feedback': ['date', 'review_text', 'rating', 'review_id', 'product_name'],
}
def _n(s): return re.sub(r'[^a-z0-9]', '', s.lower())
def suggest_mapping(header, kind):
    out, used = {}, set()
    for f in FIELDS[kind]:
        key = f if f != 'date' or kind != 'expenses' else 'date'
        syn = [_n(x) for x in SYN.get(key, '').split('|')]
        for h in header:
            if h not in used and _n(h) in syn:
                out[f] = h; used.add(h); break
    return out

# ---------- row logic ----------
def _row_fn(kind, get, mapped, fmt, snapshot):
    def prod():
        code = get('product_code'); name = get('product_name')
        c = clean_text(code, 'product_code', 255) if code is not None else None
        nm = clean_text(name, 'product_name', 255, required=(code is None)) if name is not None else None
        nm = nm.lower() if nm else None
        return (c or nm), nm
    def cost():
        if 'cost_price' not in mapped: return None
        v = get('cost_price')
        if v is None or v.strip().lower() in NA: return None
        c = parse_num(v, 'cost_price')
        if c < 0: raise RowError('cost_price', 'negative cost')
        c = c.quantize(Decimal('0.01'))
        if c >= Decimal('1e10'): raise RowError('cost_price', 'amount too large')
        return c
    if kind == 'sales':
        def f(r):
            oid = clean_text(get('order_id'), 'order_id', 100)
            key, nm = prod()
            d = parse_date(get('date'), fmt, 'date')
            q = parse_int(get('quantity'), 'quantity')
            if q <= 0: raise RowError('quantity', 'must be more than 0 (returns are not supported yet)')
            up = get('unit_price') if 'unit_price' in mapped else None
            tt = get('total') if 'total' in mapped else None
            if up is not None and up.strip().lower() not in NA:
                p = parse_num(up, 'unit_price')
                if p < 0: raise RowError('unit_price', 'negative price')
                total = p * q
            elif tt is not None and tt.strip().lower() not in NA:
                total = parse_num(tt, 'total')
                if total < 0: raise RowError('total', 'negative amount')
            else:
                raise RowError('unit_price', 'empty (no price and no total)')
            total = total.quantize(Decimal('0.01'))
            if total >= Decimal('1e12') or (total / q) >= Decimal('1e10'): raise RowError('unit_price', 'amount too large')
            cat = clean_text(get('category'), 'category', 100, False) if 'category' in mapped else None
            cust = clean_text(get('customer'), 'customer', 255, False) if 'customer' in mapped else None
            return dict(oid=oid, key=key, name=nm, cat=cat.lower() if cat else None, d=d, q=q, tot=total, cust=cust, cost=cost())
        return f
    if kind == 'inventory':
        def f(r):
            key, nm = prod()
            s = parse_int(get('stock_quantity'), 'stock_quantity')
            if s < 0: raise RowError('stock_quantity', 'negative stock')
            d = parse_date(get('date'), fmt, 'date') if 'date' in mapped else snapshot
            return dict(key=key, name=nm, d=d, stock=s, cost=cost())
        return f
    if kind == 'expenses':
        def f(r):
            d = parse_date(get('date'), fmt, 'date')
            cat = clean_text(get('category'), 'category', 100).lower()
            a = parse_num(get('amount'), 'amount')
            if a < 0: raise RowError('amount', 'negative amount (refunds not supported yet)')
            a = a.quantize(Decimal('0.01'))
            if a >= Decimal('1e12'): raise RowError('amount', 'amount too large')
            desc = clean_text(get('description'), 'description', 10000, False) if 'description' in mapped else None
            return dict(d=d, cat=cat, a=a, desc=desc)
        return f
    def f(r):  # feedback
        d = parse_date(get('date'), fmt, 'date')
        txt = clean_text(get('review_text'), 'review_text', 10000)
        rt = None
        if 'rating' in mapped and get('rating').strip().lower() not in NA:
            rt = parse_int(get('rating'), 'rating')
            if not 1 <= rt <= 5: raise RowError('rating', 'must be 1 to 5')
        rid = clean_text(get('review_id'), 'review_id', 100, False) if 'review_id' in mapped else None
        pn = clean_text(get('product_name'), 'product_name', 255, False) if 'product_name' in mapped else None
        return dict(d=d, txt=txt, rt=rt, rid=rid, pn=pn.lower() if pn else None)
    return f

# ---------- main entry ----------
def load(conn, biz, kind, path, mapping, fmt, snapshot=None, on_dup=None, replace_job=None):
    """Returns dict(status, job_id, loaded, skipped_existing, bad, message, warnings)."""
    cur = conn.cursor()
    def fail(msg, tot=0, bad=(), h='0' * 64, warn=()):
        cur.execute("""insert into ingestion_jobs(business_id,upload_type,file_name,file_hash,status,total_rows,loaded_rows,rejected_rows,message,error_report,completed_at)
                       values(%s,%s,%s,%s,'failed',%s,0,%s,%s,%s,now()) returning job_id""",
                    (biz, kind, path.split('/')[-1][:255], h, tot, len(bad), msg, json.dumps(rep(bad))))
        jid = cur.fetchone()[0]; conn.commit()
        return dict(status='failed', job_id=jid, loaded=0, skipped_existing=0, bad=list(bad), message=msg, warnings=list(warn))
    def rep(bad): return [dict(row=a, column=b, reason=c) for a, b, c in list(bad)[:MAX_ERRORS]]
    try:
        raw, hdr, norm, recs, warn = read_file(path)
    except FileError as e:
        return fail(str(e))
    # mapping -> indexes
    mp = {k: v.strip().lower() for k, v in mapping.items() if v}
    missing = [f'{k} ("{mapping[k]}")' for k, v in mp.items() if v not in norm]
    if missing: return fail('mapped column not found in file: ' + ', '.join(missing), warn=warn)
    idx = {k: norm.index(v) for k, v in mp.items()}
    need = {'sales': ['order_id', 'date', 'quantity'], 'inventory': ['stock_quantity'], 'expenses': ['date', 'category', 'amount'],
            'feedback': ['date', 'review_text']}[kind]
    lacking = [k for k in need if k not in idx]
    if kind in ('sales', 'inventory') and not ({'product_code', 'product_name'} & set(idx)): lacking.append('product_code or product_name')
    if kind == 'sales' and not ({'unit_price', 'total'} & set(idx)): lacking.append('unit_price or total')
    if kind == 'inventory' and 'date' not in idx and snapshot is None: lacking.append('date column or snapshot_date from the upload screen')
    if lacking: return fail('required field not mapped: ' + ', '.join(lacking), warn=warn)
    h = hashlib.sha256(raw + b'|' + str(snapshot).encode() + b'|' + kind.encode()).hexdigest()
    # rows
    col_name = {k: hdr[i] for k, i in idx.items()}
    rowfn = _row_fn(kind, lambda k: cells[idx[k]] if k in idx else None, set(idx), fmt, snapshot)
    good, bad = [], []
    for rn, r in recs:
        if len(r) > len(hdr) and not any(c.strip() for c in r[len(hdr):]): r = r[:len(hdr)]
        if len(r) != len(hdr):
            bad.append((rn, '(row)', 'wrong number of columns: %d, header has %d' % (len(r), len(hdr)))); continue
        cells = r
        try: good.append((rn, rowfn(r)))
        except RowError as e: bad.append((rn, col_name.get(e.col, e.col), e.reason))
    total_rows = len(recs)
    if total_rows and len(bad) / total_rows > LIMIT:
        return fail('more than %d%% of rows are bad; nothing saved' % int(LIMIT * 100), total_rows, bad, h, warn)
    # post-pass: merge / duplicate checks inside the file
    rows = []
    if kind == 'sales':
        m = {}
        for rn, g in good:
            k = (g['oid'], g['key'])
            if k in m:
                p = m[k]
                if p['d'] != g['d'] or p['cust'] != g['cust']:
                    bad.append((rn, 'order_id', 'same order + product with a different date or customer')); continue
                p['q'] += g['q']; p['tot'] += g['tot']; p['merged'] += 1
            else: m[k] = dict(g, merged=0)
        rows = list(m.values())
    elif kind == 'inventory':
        seen = set()
        for rn, g in good:
            k = (g['key'], g['d'])
            if k in seen: bad.append((rn, 'product', 'same product and date twice in the file')); continue
            seen.add(k); rows.append(g)
    elif kind == 'expenses':
        occ = {}
        for rn, g in good:
            c = (g['d'], g['cat'], g['a'], g['desc'] or '')
            occ[c] = occ.get(c, 0) + 1
            g['hash'] = hashlib.sha256('|'.join([g['d'].isoformat(), g['cat'], str(g['a']), g['desc'] or '', str(occ[c])]).encode()).hexdigest()
            rows.append(g)
    else:
        for rn, g in good:
            k = ('id:' + g['rid']) if g['rid'] else ('dt:%s|%s' % (g['d'].isoformat(), g['txt']))
            g['hash'] = hashlib.sha256(k.encode()).hexdigest(); rows.append(g)
    if total_rows and len(bad) / total_rows > LIMIT:
        return fail('more than %d%% of rows are bad; nothing saved' % int(LIMIT * 100), total_rows, bad, h, warn)
    # ---- load: one transaction ----
    try:
        cur.execute("select pg_advisory_xact_lock(hashtext(%s))", (str(biz) + kind + h,))
        cur.execute("select job_id from ingestion_jobs where business_id=%s and upload_type=%s and file_hash=%s and status like 'completed%%' order by created_at desc limit 1", (biz, kind, h))
        prev = cur.fetchone()
        if prev and on_dup is None and replace_job is None:
            conn.rollback(); return dict(status='warning_duplicate_file', job_id=None, loaded=0, skipped_existing=0, bad=bad, message='same file content already loaded (job %s): choose skip or replace' % prev[0], warnings=warn)
        if prev and on_dup == 'skip':
            conn.rollback(); return dict(status='skipped', job_id=None, loaded=0, skipped_existing=0, bad=bad, message='skipped', warnings=warn)
        target = replace_job or (prev[0] if prev and on_dup == 'replace' else None)
        if target:
            cur.execute("select business_id,upload_type from ingestion_jobs where job_id=%s", (target,))
            o = cur.fetchone()
            if not o or str(o[0]) != str(biz) or o[1] != kind:
                conn.rollback(); return dict(status='refused', job_id=None, loaded=0, skipped_existing=0, bad=bad, message='replace target is not this business/type', warnings=warn)
            for t in ('sales', 'inventory', 'expenses', 'feedback'):
                if t == {'sales': 'sales', 'inventory': 'inventory', 'expenses': 'expenses', 'feedback': 'feedback'}[kind]:
                    cur.execute("delete from " + t + " where job_id=%s and business_id=%s", (target, biz))
            cur.execute("update ingestion_jobs set status='replaced' where job_id=%s", (target,))
        cur.execute("""insert into ingestion_jobs(business_id,upload_type,file_name,file_hash,snapshot_date,status,total_rows)
                       values(%s,%s,%s,%s,%s,'processing',%s) returning job_id""", (biz, kind, path.split('/')[-1][:255], h, snapshot, total_rows))
        jid = cur.fetchone()[0]
        loaded = _load_rows(cur, biz, jid, kind, rows)
        skipped = len(rows) - loaded
        notes = list(warn)
        if skipped: notes.append('%d rows skipped: already saved earlier (duplicates are never overwritten)' % skipped)
        if kind == 'sales':
            mg = sum(r['merged'] for r in rows)
            if mg: notes.append('%d repeated order+product lines merged' % mg)
        if kind == 'feedback':
            cur.execute("select count(*) from feedback where job_id=%s and product_id is null", (jid,))
            nul = cur.fetchone()[0]
            if nul and any(r['pn'] for r in rows): notes.append('some feedback rows name a product that does not exist; saved without a product link')
        status = 'completed_with_warnings' if (bad or notes) else 'completed'
        cur.execute("update ingestion_jobs set status=%s, loaded_rows=%s, rejected_rows=%s, message=%s, error_report=%s, completed_at=now() where job_id=%s",
                    (status, loaded, len(bad), '; '.join(notes) or None, json.dumps(rep(bad)), jid))
        conn.commit()
        return dict(status=status, job_id=jid, loaded=loaded, skipped_existing=skipped, bad=bad, message='; '.join(notes), warnings=notes)
    except Exception as e:
        conn.rollback()
        r = fail('internal error: ' + type(e).__name__ + ': ' + str(e).splitlines()[0], total_rows, bad, h, warn)
        r['internal'] = True
        return r

def _copy(cur, table_ddl, rows, name='stg'):
    cur.execute(table_ddl)
    buf = io.StringIO(); w = csv.writer(buf)
    for r in rows: w.writerow(r)
    buf.seek(0)
    cur.copy_expert("copy " + name + " from stdin with (format csv)", buf)

def _load_rows(cur, biz, jid, kind, rows):
    if kind == 'sales':
        _copy(cur, "create temp table stg(order_id text, pkey text, pname text, cat text, ckey text, d date, q int, up numeric, tot numeric) on commit drop",
              [(r['oid'], r['key'], r['name'] or '', r['cat'] or '', r['cust'] or '', r['d'], r['q'], round(r['tot'] / r['q'], 2), r['tot']) for r in rows])
        _prod(cur, biz, jid, rows)
        cur.execute("insert into customers(business_id,job_id,customer_key) select distinct %s::uuid,%s::uuid,ckey from stg where ckey<>'' order by ckey on conflict (business_id,customer_key) do nothing", (biz, jid))
        cur.execute("""insert into sales(business_id,job_id,product_id,customer_id,order_id,sale_date,quantity,unit_price,total_amount)
            select %s::uuid,%s::uuid,p.product_id,c.customer_id,s.order_id,s.d,s.q,s.up,s.tot from stg s
            join products p on p.business_id=%s and p.product_key=s.pkey
            left join customers c on c.business_id=%s and c.customer_key=nullif(s.ckey,'')
            order by s.order_id, s.pkey on conflict (business_id,order_id,product_id) do nothing""", (biz, jid, biz, biz))
        return cur.rowcount
    if kind == 'inventory':
        _copy(cur, "create temp table stg(pkey text, pname text, cat text, d date, stock int) on commit drop",
              [(r['key'], r['name'] or '', '', r['d'], r['stock']) for r in rows])
        _prod(cur, biz, jid, rows)
        cur.execute("""insert into inventory(business_id,job_id,product_id,snapshot_date,stock_quantity)
            select %s::uuid,%s::uuid,p.product_id,s.d,s.stock from stg s join products p on p.business_id=%s and p.product_key=s.pkey
            order by s.pkey, s.d on conflict (business_id,product_id,snapshot_date) do nothing""", (biz, jid, biz))
        return cur.rowcount
    if kind == 'expenses':
        _copy(cur, "create temp table stg(d date, cat text, a numeric, descr text, h text) on commit drop",
              [(r['d'], r['cat'], r['a'], r['desc'] or '', r['hash']) for r in rows])
        cur.execute("""insert into expenses(business_id,job_id,expense_date,category,amount,description,row_hash)
            select %s::uuid,%s::uuid,d,cat,a,nullif(descr,''),h from stg order by h on conflict (business_id,row_hash) do nothing""", (biz, jid))
        return cur.rowcount
    _copy(cur, "create temp table stg(d date, txt text, rt int, rid text, pn text, h text) on commit drop",
          [(r['d'], r['txt'], r['rt'] if r['rt'] is not None else '', r['rid'] or '', r['pn'] or '', r['hash']) for r in rows])
    cur.execute("""insert into feedback(business_id,job_id,product_id,feedback_date,review_text,rating,review_id,row_hash)
        select %s::uuid,%s::uuid,
          (select p.product_id from products p where p.business_id=%s and (p.product_key=s.pn or p.product_name=s.pn) order by (p.product_key=s.pn) desc, p.product_id limit 1),
          s.d,s.txt,s.rt,nullif(s.rid,''),s.h from stg s order by s.h on conflict (business_id,row_hash) do nothing""", (biz, jid, biz))
    return cur.rowcount

def _prod(cur, biz, jid, rows):
    first = {}
    for r in rows:
        v = first.setdefault(r['key'], [r.get('name') or '', r.get('cat') or '', None])   # first row in the file wins
        if v[2] is None and r.get('cost') is not None: v[2] = r['cost']                  # first cost seen wins
    _copy(cur, "create temp table pstg(pkey text, pname text, cat text, cost numeric) on commit drop",
          [(k, v[0], v[1], '' if v[2] is None else v[2]) for k, v in first.items()], 'pstg')
    # cost_price is fill-only: an existing cost is never overwritten, a missing one is filled
    cur.execute("""insert into products(business_id,job_id,product_key,product_name,category,cost_price)
        select %s::uuid,%s::uuid,pkey,nullif(pname,''),nullif(cat,''),cost from pstg order by pkey
        on conflict (business_id,product_key) do update set cost_price = coalesce(products.cost_price, excluded.cost_price)""", (biz, jid))

def save_mapping(conn, biz, kind, mapping):
    cur = conn.cursor()
    cur.execute("""insert into column_mappings(business_id,upload_type,mapping) values(%s,%s,%s)
                   on conflict (business_id,upload_type) do update set mapping=excluded.mapping, updated_at=now()""", (biz, kind, json.dumps(mapping)))
    conn.commit()

def get_mapping(conn, biz, kind):
    cur = conn.cursor()
    cur.execute("select mapping from column_mappings where business_id=%s and upload_type=%s", (biz, kind))
    r = cur.fetchone(); return r[0] if r else None
