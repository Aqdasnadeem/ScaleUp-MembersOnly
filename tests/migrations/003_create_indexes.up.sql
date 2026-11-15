-- 003: indexes for the queries the analytics and agent tools run
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
