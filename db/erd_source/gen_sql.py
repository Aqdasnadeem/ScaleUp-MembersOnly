from spec import *
def col_sql(c):
    n,t,null,d,k=c
    s=f'    {n} {t}'
    if d: s+=(' '+d) if d.startswith('GENERATED') else f' DEFAULT {d}'
    if not null: s+=' NOT NULL'
    return s
def create(name):
    t=T[name]; lines=[]
    for c in t['cols']: lines.append(col_sql(c))
    pk=[c[0] for c in t['cols'] if c[4]=='PK'][0]
    lines.append(f'    CONSTRAINT pk_{name} PRIMARY KEY ({pk})')
    for (tn,cn),parent in FK.items():
        if tn!=name: continue
        ppk=[c[0] for c in T[parent]['cols'] if c[4]=='PK'][0]
        lines.append(f'    CONSTRAINT fk_{name}_{cn} FOREIGN KEY ({cn}) REFERENCES {parent}({ppk})')
    for cols,cn in t['uniques']: lines.append(f'    CONSTRAINT {cn} UNIQUE ({", ".join(cols)})')
    for expr,cn in t['checks']: lines.append(f'    CONSTRAINT {cn} CHECK ({expr})')
    return f'-- {t["purpose"]}\nCREATE TABLE {name} (\n'+',\n'.join(lines)+'\n);\n'
def wr(fn,body): open('migrations/'+fn,'w').write(body)
wr('001_create_core_tables.up.sql','-- 001: account, upload-job and column-mapping tables\nBEGIN;\n\n'+'\n'.join(create(n) for n in ['businesses','users','ingestion_jobs','column_mappings'])+'\nCOMMIT;\n')
wr('002_create_data_tables.up.sql','-- 002: business data tables (every row has business_id and job_id)\nBEGIN;\n\n'+'\n'.join(create(n) for n in ['customers','products','sales','inventory','expenses','feedback','rejected_rows'])+'\nCOMMIT;\n')
idx='''-- 003: indexes for the queries the analytics and agent tools run
BEGIN;
CREATE INDEX idx_jobs_business_hash ON ingestion_jobs (business_id, file_hash);
CREATE INDEX idx_customers_job ON customers (job_id);
CREATE INDEX idx_products_job ON products (job_id);
CREATE INDEX idx_sales_business_date ON sales (business_id, sale_date);
CREATE INDEX idx_sales_product ON sales (product_id);
CREATE INDEX idx_sales_customer ON sales (customer_id);
CREATE INDEX idx_sales_job ON sales (job_id);
CREATE INDEX idx_inventory_job ON inventory (job_id);
CREATE INDEX idx_expenses_business_date ON expenses (business_id, expense_date);
CREATE INDEX idx_expenses_job ON expenses (job_id);
CREATE INDEX idx_feedback_business_date ON feedback (business_id, feedback_date);
CREATE INDEX idx_feedback_product ON feedback (product_id);
CREATE INDEX idx_feedback_job ON feedback (job_id);
CREATE INDEX idx_rejected_job ON rejected_rows (job_id, row_number);
COMMIT;
'''
wr('003_create_indexes.up.sql',idx)
down='-- Down: drops everything created by 001 to 003\nBEGIN;\n'+''.join(f'DROP TABLE IF EXISTS {n};\n' for n in reversed(ORDER))+'COMMIT;\n'
wr('000_drop_all.down.sql',down)
