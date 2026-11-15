-- 001: account, upload-job and column-mapping tables
BEGIN;

-- One row per SME account
CREATE TABLE businesses (
    business_id UUID DEFAULT gen_random_uuid() NOT NULL,
    business_name VARCHAR(255) NOT NULL,
    currency CHAR(3) DEFAULT 'PKR' NOT NULL,
    date_format VARCHAR(10) DEFAULT 'DD/MM/YYYY' NOT NULL,
    low_stock_threshold INTEGER DEFAULT 10 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT pk_businesses PRIMARY KEY (business_id),
    CONSTRAINT chk_businesses_date_format CHECK (date_format IN ('DD/MM/YYYY','MM/DD/YYYY')),
    CONSTRAINT chk_businesses_low_stock CHECK (low_stock_threshold >= 0)
);

-- Login for the business owner
CREATE TABLE users (
    user_id UUID DEFAULT gen_random_uuid() NOT NULL,
    business_id UUID NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT pk_users PRIMARY KEY (user_id),
    CONSTRAINT fk_users_business_id FOREIGN KEY (business_id) REFERENCES businesses(business_id),
    CONSTRAINT uq_users_email UNIQUE (email)
);

-- One row per upload; also the worker queue
CREATE TABLE ingestion_jobs (
    job_id UUID DEFAULT gen_random_uuid() NOT NULL,
    business_id UUID NOT NULL,
    upload_type VARCHAR(20) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_hash CHAR(64) NOT NULL,
    snapshot_date DATE,
    status VARCHAR(30) DEFAULT 'pending' NOT NULL,
    total_rows INTEGER DEFAULT 0 NOT NULL,
    loaded_rows INTEGER DEFAULT 0 NOT NULL,
    rejected_rows INTEGER DEFAULT 0 NOT NULL,
    skipped_rows INTEGER DEFAULT 0 NOT NULL,
    returned_rows INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    file_key VARCHAR(255),
    message TEXT,
    error_report JSONB,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    CONSTRAINT pk_ingestion_jobs PRIMARY KEY (job_id),
    CONSTRAINT fk_ingestion_jobs_business_id FOREIGN KEY (business_id) REFERENCES businesses(business_id),
    CONSTRAINT chk_jobs_upload_type CHECK (upload_type IN ('sales','inventory','expenses','feedback')),
    CONSTRAINT chk_jobs_status CHECK (status IN ('pending','processing','completed','completed_with_warnings','failed','replaced')),
    CONSTRAINT chk_jobs_counts CHECK (total_rows >= 0 AND loaded_rows >= 0 AND rejected_rows >= 0 AND skipped_rows >= 0 AND returned_rows >= 0)
);

-- Saved column mapping per business and file type
CREATE TABLE column_mappings (
    mapping_id BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    business_id UUID NOT NULL,
    upload_type VARCHAR(20) NOT NULL,
    mapping JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT pk_column_mappings PRIMARY KEY (mapping_id),
    CONSTRAINT fk_column_mappings_business_id FOREIGN KEY (business_id) REFERENCES businesses(business_id),
    CONSTRAINT uq_mappings_business_type UNIQUE (business_id, upload_type),
    CONSTRAINT chk_mappings_type CHECK (upload_type IN ('sales','inventory','expenses','feedback'))
);

COMMIT;
