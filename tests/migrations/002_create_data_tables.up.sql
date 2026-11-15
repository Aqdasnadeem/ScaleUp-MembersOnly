-- 002: business data tables (every row has business_id and job_id)
BEGIN;

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

-- Built by the ETL from sales and inventory files
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

-- One row per order line
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

-- Stock snapshot per product and date
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

-- One row per customer review
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

-- One row per bad row of an upload, with the reason
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
