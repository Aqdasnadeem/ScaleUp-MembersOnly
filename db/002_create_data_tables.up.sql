-- 002 (P2-07): expenses, feedback, column_mappings, rejected_rows.
-- Depends on 001 (P2-06): businesses, ingestion_jobs, products.
BEGIN;

-- Saved column mapping per business and file type. The UNIQUE (business_id, upload_type) is the ON CONFLICT target in routes_uploads.py.
CREATE TABLE column_mappings (
    mapping_id BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    business_id UUID NOT NULL,
    upload_type VARCHAR(20) NOT NULL,
    mapping JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT pk_column_mappings PRIMARY KEY (mapping_id),
    CONSTRAINT fk_column_mappings_business_id FOREIGN KEY (business_id) REFERENCES businesses(business_id),
    CONSTRAINT uq_mappings_business_type UNIQUE (business_id, upload_type),
    CONSTRAINT chk_mappings_type CHECK (upload_type IN ('sales', 'inventory', 'expenses', 'feedback'))
);

-- One row per expense
CREATE TABLE expenses (
    expense_id BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    business_id UUID NOT NULL,
    job_id UUID NOT NULL,
    expense_date DATE NOT NULL,
    category VARCHAR(100) NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    description TEXT,
    row_hash CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT pk_expenses PRIMARY KEY (expense_id),
    CONSTRAINT fk_expenses_business_id FOREIGN KEY (business_id) REFERENCES businesses(business_id),
    CONSTRAINT fk_expenses_job_id FOREIGN KEY (job_id) REFERENCES ingestion_jobs(job_id),
    CONSTRAINT uq_expenses_business_hash UNIQUE (business_id, row_hash),
    CONSTRAINT chk_expenses_amount CHECK (amount >= 0)
);

-- One row per customer review. product_id is NULL when the review names no known product.
CREATE TABLE feedback (
    feedback_id BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    business_id UUID NOT NULL,
    job_id UUID NOT NULL,
    product_id BIGINT,
    feedback_date DATE NOT NULL,
    review_text TEXT NOT NULL,
    rating SMALLINT,
    review_id VARCHAR(100),
    row_hash CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT pk_feedback PRIMARY KEY (feedback_id),
    CONSTRAINT fk_feedback_business_id FOREIGN KEY (business_id) REFERENCES businesses(business_id),
    CONSTRAINT fk_feedback_job_id FOREIGN KEY (job_id) REFERENCES ingestion_jobs(job_id),
    CONSTRAINT fk_feedback_product_id FOREIGN KEY (product_id) REFERENCES products(product_id),
    CONSTRAINT uq_feedback_business_hash UNIQUE (business_id, row_hash),
    CONSTRAINT chk_feedback_rating CHECK (rating IS NULL OR rating BETWEEN 1 AND 5)
);

-- One row per bad row of an upload, with the reason. At most ERROR_REPORT_MAX rows per job (config.py);
-- the exact count is ingestion_jobs.rejected_rows.
CREATE TABLE rejected_rows (
    rejected_id BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    business_id UUID NOT NULL,
    job_id UUID NOT NULL,
    row_number INTEGER NOT NULL,
    column_name VARCHAR(255),
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT pk_rejected_rows PRIMARY KEY (rejected_id),
    CONSTRAINT fk_rejected_rows_business_id FOREIGN KEY (business_id) REFERENCES businesses(business_id),
    CONSTRAINT fk_rejected_rows_job_id FOREIGN KEY (job_id) REFERENCES ingestion_jobs(job_id),
    CONSTRAINT chk_rejected_row_number CHECK (row_number >= 1)
);

COMMIT;
