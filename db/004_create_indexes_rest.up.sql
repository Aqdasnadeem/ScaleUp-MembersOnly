-- 004: additional tenant-scoped indexes for rest-table analytics and rejects.
-- Core date/job indexes and the column_mappings business/type unique index
-- are already created by 003 and 001 respectively.
BEGIN;

CREATE INDEX idx_expenses_business_category_date
    ON expenses (business_id, category, expense_date);
CREATE INDEX idx_feedback_business_rating_date
    ON feedback (business_id, rating, feedback_date);
CREATE INDEX idx_rejected_rows_business_job
    ON rejected_rows (business_id, job_id, row_number);

COMMIT;
