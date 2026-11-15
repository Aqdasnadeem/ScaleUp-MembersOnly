# Single source of truth for the Scale Up core schema (ERD + migrations are generated from this).
# column: (name, type, null, default, kind, note)  kind: PK / FK / UQ / '' ; FK target in FKS
T = {}
def tbl(name, purpose, cols, uniques=(), checks=(), group='core'):
    T[name] = dict(purpose=purpose, cols=cols, uniques=list(uniques), checks=list(checks), group=group)

UUID = 'UUID'
tbl('businesses', 'One row per SME account', [
 ('business_id', UUID, False, 'gen_random_uuid()', 'PK'),
 ('business_name', 'VARCHAR(255)', False, None, ''),
 ('currency', 'CHAR(3)', False, "'PKR'", ''),
 ('date_format', 'VARCHAR(10)', False, "'DD/MM/YYYY'", ''),
 ('low_stock_threshold', 'INTEGER', False, '10', ''),
 ('created_at', 'TIMESTAMPTZ', False, 'now()', ''),
], checks=[("date_format IN ('DD/MM/YYYY','MM/DD/YYYY')", 'chk_businesses_date_format'), ('low_stock_threshold >= 0', 'chk_businesses_low_stock')])

tbl('users', 'Login for the business owner', [
 ('user_id', UUID, False, 'gen_random_uuid()', 'PK'),
 ('business_id', UUID, False, None, 'FK'),
 ('email', 'VARCHAR(255)', False, None, 'UQ'),
 ('password_hash', 'VARCHAR(255)', False, None, ''),
 ('created_at', 'TIMESTAMPTZ', False, 'now()', ''),
], uniques=[(['email'], 'uq_users_email')])

tbl('ingestion_jobs', 'One row per upload; also the worker queue', [
 ('job_id', UUID, False, 'gen_random_uuid()', 'PK'),
 ('business_id', UUID, False, None, 'FK'),
 ('upload_type', 'VARCHAR(20)', False, None, ''),
 ('file_name', 'VARCHAR(255)', False, None, ''),
 ('file_hash', 'CHAR(64)', False, None, ''),
 ('snapshot_date', 'DATE', True, None, ''),
 ('status', 'VARCHAR(30)', False, "'pending'", ''),
 ('total_rows', 'INTEGER', False, '0', ''),
 ('loaded_rows', 'INTEGER', False, '0', ''),
 ('rejected_rows', 'INTEGER', False, '0', ''),
 ('skipped_rows', 'INTEGER', False, '0', ''),
 ('returned_rows', 'INTEGER', False, '0', ''),
 ('created_at', 'TIMESTAMPTZ', False, 'now()', ''),
 ('file_key', 'VARCHAR(255)', True, None, ''),
 ('message', 'TEXT', True, None, ''),
 ('error_report', 'JSONB', True, None, ''),
 ('started_at', 'TIMESTAMPTZ', True, None, ''),
 ('completed_at', 'TIMESTAMPTZ', True, None, ''),
], checks=[
 ("upload_type IN ('sales','inventory','expenses','feedback')", 'chk_jobs_upload_type'),
 ("status IN ('pending','processing','completed','completed_with_warnings','failed','replaced')", 'chk_jobs_status'),
 ('total_rows >= 0 AND loaded_rows >= 0 AND rejected_rows >= 0 AND skipped_rows >= 0 AND returned_rows >= 0', 'chk_jobs_counts'),
])

tbl('column_mappings', 'Saved column mapping per business and file type', [
 ('mapping_id', 'BIGINT', False, 'GENERATED ALWAYS AS IDENTITY', 'PK'),
 ('business_id', UUID, False, None, 'FK'),
 ('upload_type', 'VARCHAR(20)', False, None, ''),
 ('mapping', 'JSONB', False, None, ''),
 ('updated_at', 'TIMESTAMPTZ', False, 'now()', ''),
], uniques=[(['business_id','upload_type'], 'uq_mappings_business_type')],
 checks=[("upload_type IN ('sales','inventory','expenses','feedback')", 'chk_mappings_type')])

def data_cols(pk, extra, tail=()):
    return [(pk, 'BIGINT', False, 'GENERATED ALWAYS AS IDENTITY', 'PK'),
            ('business_id', UUID, False, None, 'FK'),
            ('job_id', UUID, False, None, 'FK')] + extra + list(tail) + [('created_at', 'TIMESTAMPTZ', False, 'now()', '')]

tbl('customers', 'Built by the ETL from customer ids in sales', data_cols('customer_id', [
 ('customer_key', 'VARCHAR(255)', False, None, ''),
]), uniques=[(['business_id','customer_key'], 'uq_customers_business_key')], group='data')

tbl('products', 'Built by the ETL from sales and inventory files', data_cols('product_id', [
 ('product_key', 'VARCHAR(255)', False, None, ''),
 ('product_name', 'VARCHAR(255)', True, None, ''),
 ('category', 'VARCHAR(100)', True, None, ''),
 ('cost_price', 'NUMERIC(12,2)', True, None, ''),
]), uniques=[(['business_id','product_key'], 'uq_products_business_key')], checks=[('cost_price IS NULL OR cost_price >= 0', 'chk_products_cost')], group='data')

tbl('sales', 'One row per order line', data_cols('sale_id', [
 ('product_id', 'BIGINT', False, None, 'FK'),
 ('customer_id', 'BIGINT', True, None, 'FK'),
 ('order_id', 'VARCHAR(100)', False, None, ''),
 ('sale_date', 'DATE', False, None, ''),
 ('quantity', 'INTEGER', False, None, ''),
 ('unit_price', 'NUMERIC(12,2)', False, None, ''),
 ('total_amount', 'NUMERIC(14,2)', False, None, ''),
]), uniques=[(['business_id','order_id','product_id'], 'uq_sales_business_order_product')],
 checks=[('quantity > 0', 'chk_sales_quantity'), ('unit_price >= 0', 'chk_sales_unit_price'), ('total_amount >= 0', 'chk_sales_total')], group='data')

tbl('inventory', 'Stock snapshot per product and date', data_cols('inventory_id', [
 ('product_id', 'BIGINT', False, None, 'FK'),
 ('snapshot_date', 'DATE', False, None, ''),
 ('stock_quantity', 'INTEGER', False, None, ''),
]), uniques=[(['business_id','product_id','snapshot_date'], 'uq_inventory_business_product_date')],
 checks=[('stock_quantity >= 0', 'chk_inventory_stock')], group='data')

tbl('expenses', 'One row per expense', data_cols('expense_id', [
 ('expense_date', 'DATE', False, None, ''),
 ('category', 'VARCHAR(100)', False, None, ''),
 ('amount', 'NUMERIC(14,2)', False, None, ''),
 ('description', 'TEXT', True, None, ''),
 ('row_hash', 'CHAR(64)', False, None, ''),
]), uniques=[(['business_id','row_hash'], 'uq_expenses_business_hash')],
 checks=[('amount >= 0', 'chk_expenses_amount')], group='data')

tbl('feedback', 'One row per customer review', data_cols('feedback_id', [
 ('product_id', 'BIGINT', True, None, 'FK'),
 ('feedback_date', 'DATE', False, None, ''),
 ('review_text', 'TEXT', False, None, ''),
 ('rating', 'SMALLINT', True, None, ''),
 ('review_id', 'VARCHAR(100)', True, None, ''),
 ('row_hash', 'CHAR(64)', False, None, ''),
]), uniques=[(['business_id','row_hash'], 'uq_feedback_business_hash')],
 checks=[('rating IS NULL OR rating BETWEEN 1 AND 5', 'chk_feedback_rating')], group='data')

tbl('rejected_rows', 'One row per bad row of an upload, with the reason', data_cols('rejected_id', [
 ('row_number', 'INTEGER', False, None, ''),
 ('column_name', 'VARCHAR(255)', True, None, ''),
 ('reason', 'TEXT', False, None, ''),
]), checks=[('row_number >= 1', 'chk_rejected_row_number')], group='data')

# FK targets: (table, column) -> parent table ; cardinality "parent_end .. child_end"
FK = {
 ('users','business_id'):'businesses', ('ingestion_jobs','business_id'):'businesses',
}
for t in ('customers','products','sales','inventory','expenses','feedback','rejected_rows'):
    FK[(t,'business_id')] = 'businesses'; FK[(t,'job_id')] = 'ingestion_jobs'
FK[('column_mappings','business_id')]='businesses'
FK[('sales','product_id')]='products'; FK[('sales','customer_id')]='customers'
FK[('inventory','product_id')]='products'; FK[('feedback','product_id')]='products'
ORDER = ['businesses','users','ingestion_jobs','column_mappings','customers','products','sales','inventory','expenses','feedback','rejected_rows']
