-- 001 (P2-06): core tables - businesses, users, ingestion_jobs, customers, products, sales, inventory
-- Rules: PK, FK, NOT NULL, CHECK; business_id on business-scoped tables; users has no role column (FYP-1: one role).
-- PKs: businesses, users and ingestion_jobs use UUID because the app uses them as UUIDs (JWT business_id, job_id).
--      The other tables use GENERATED ALWAYS AS IDENTITY. Decision to confirm with the advisor.
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

-- Login for the business owner (FYP-1: one role, Business user; no role column)
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
-- Column names used by the app: upload_type (sales, inventory, expenses, feedback), message (job message),
-- file_key (where the CSV is stored).
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

-- Built by the ETL from customer ids in sales
CREATE TABLE customers (
    customer_id BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    business_id UUID NOT NULL,
    job_id UUID NOT NULL,
    customer_key VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT pk_customers PRIMARY KEY (customer_id),
    CONSTRAINT fk_customers_business_id FOREIGN KEY (business_id) REFERENCES businesses(business_id),
    CONSTRAINT fk_customers_job_id FOREIGN KEY (job_id) REFERENCES ingestion_jobs(job_id),
    CONSTRAINT uq_customers_business_key UNIQUE (business_id, customer_key)
);

-- Built by the ETL from sales and inventory files; cost_price is nullable (no cost = margin N/A, never 0)
CREATE TABLE products (
    product_id BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    business_id UUID NOT NULL,
    job_id UUID NOT NULL,
    product_key VARCHAR(255) NOT NULL,
    product_name VARCHAR(255),
    category VARCHAR(100),
    cost_price NUMERIC(12,2),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT pk_products PRIMARY KEY (product_id),
    CONSTRAINT fk_products_business_id FOREIGN KEY (business_id) REFERENCES businesses(business_id),
    CONSTRAINT fk_products_job_id FOREIGN KEY (job_id) REFERENCES ingestion_jobs(job_id),
    CONSTRAINT uq_products_business_key UNIQUE (business_id, product_key),
    CONSTRAINT chk_products_cost CHECK (cost_price IS NULL OR cost_price >= 0)
);

-- One row per order line (returns are not loaded; see BR-24)
CREATE TABLE sales (
    sale_id BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    business_id UUID NOT NULL,
    job_id UUID NOT NULL,
    product_id BIGINT NOT NULL,
    customer_id BIGINT,
    order_id VARCHAR(100) NOT NULL,
    sale_date DATE NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    total_amount NUMERIC(14,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT pk_sales PRIMARY KEY (sale_id),
    CONSTRAINT fk_sales_business_id FOREIGN KEY (business_id) REFERENCES businesses(business_id),
    CONSTRAINT fk_sales_job_id FOREIGN KEY (job_id) REFERENCES ingestion_jobs(job_id),
    CONSTRAINT fk_sales_product_id FOREIGN KEY (product_id) REFERENCES products(product_id),
    CONSTRAINT fk_sales_customer_id FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    CONSTRAINT uq_sales_business_order_product UNIQUE (business_id, order_id, product_id),
    CONSTRAINT chk_sales_quantity CHECK (quantity > 0),
    CONSTRAINT chk_sales_unit_price CHECK (unit_price >= 0),
    CONSTRAINT chk_sales_total CHECK (total_amount >= 0)
);

-- Stock snapshot per product and date (one location per business in FYP-1)
CREATE TABLE inventory (
    inventory_id BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    business_id UUID NOT NULL,
    job_id UUID NOT NULL,
    product_id BIGINT NOT NULL,
    snapshot_date DATE NOT NULL,
    stock_quantity INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT pk_inventory PRIMARY KEY (inventory_id),
    CONSTRAINT fk_inventory_business_id FOREIGN KEY (business_id) REFERENCES businesses(business_id),
    CONSTRAINT fk_inventory_job_id FOREIGN KEY (job_id) REFERENCES ingestion_jobs(job_id),
    CONSTRAINT fk_inventory_product_id FOREIGN KEY (product_id) REFERENCES products(product_id),
    CONSTRAINT uq_inventory_business_product_date UNIQUE (business_id, product_id, snapshot_date),
    CONSTRAINT chk_inventory_stock CHECK (stock_quantity >= 0)
);

COMMIT;
