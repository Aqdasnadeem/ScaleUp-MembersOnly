-- 004 (P2-07): indexes for the 002 tables. Depends on 002.
-- Index names use the prefix idx_ like 003. Foreign-key columns are indexed so deletes and joins stay fast.
BEGIN;

CREATE INDEX idx_expenses_job ON expenses (job_id);
CREATE INDEX idx_expenses_business_date ON expenses (business_id, expense_date);

CREATE INDEX idx_feedback_job ON feedback (job_id);
CREATE INDEX idx_feedback_product ON feedback (product_id);
CREATE INDEX idx_feedback_business_date ON feedback (business_id, feedback_date);

CREATE INDEX idx_rejected_job ON rejected_rows (job_id, row_number);

COMMIT;
