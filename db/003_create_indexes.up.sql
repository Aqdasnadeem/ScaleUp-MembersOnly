-- 003 (P2-06 part): indexes for the P2-06 tables. P2-07 appends its own indexes (expenses, feedback, rejected_rows).
BEGIN;
CREATE INDEX idx_jobs_business_hash ON ingestion_jobs (business_id, file_hash);
CREATE INDEX idx_customers_job ON customers (job_id);
CREATE INDEX idx_products_job ON products (job_id);
CREATE INDEX idx_sales_business_date ON sales (business_id, sale_date);
CREATE INDEX idx_sales_product ON sales (product_id);
CREATE INDEX idx_sales_customer ON sales (customer_id);
CREATE INDEX idx_sales_job ON sales (job_id);
CREATE INDEX idx_inventory_job ON inventory (job_id);
COMMIT;
