-- P2-07 demo seed for the schema created by migrations 001-004.
-- Run with psql from the project root. Supply a scrypt hash with
-- -v seed_password_hash='<hash>' to create accounts that can log in.
-- The default is deliberately not a valid login credential.
\set ON_ERROR_STOP on
\if :{?seed_password_hash}
\else
\set seed_password_hash '!placeholder-cannot-log-in'
\endif

BEGIN;

CREATE TEMP TABLE p207_seed_businesses (
    business_name VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    business_id UUID NOT NULL
) ON COMMIT DROP;

INSERT INTO businesses (business_id, business_name)
SELECT seeded.business_id, seeded.business_name
FROM (
    VALUES
        ('Demo Traders', 'demo@scaleup.test', '00000000-0000-4000-8000-000000000701'::UUID),
        ('Corner Store', 'corner@scaleup.test', '00000000-0000-4000-8000-000000000702'::UUID)
) AS seeded(business_name, email, business_id)
WHERE NOT EXISTS (
    SELECT 1 FROM users u WHERE u.email = seeded.email
)
AND NOT EXISTS (
    SELECT 1 FROM businesses b WHERE b.business_name = seeded.business_name
)
ON CONFLICT (business_id) DO NOTHING;

INSERT INTO p207_seed_businesses (business_name, email, business_id)
SELECT seeded.business_name,
       seeded.email,
       COALESCE(
           (SELECT u.business_id FROM users u WHERE u.email = seeded.email),
           (SELECT b.business_id FROM businesses b
            WHERE b.business_name = seeded.business_name
            ORDER BY b.created_at, b.business_id
            LIMIT 1)
       )
FROM (
    VALUES
        ('Demo Traders', 'demo@scaleup.test'),
        ('Corner Store', 'corner@scaleup.test')
) AS seeded(business_name, email);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM p207_seed_businesses seeded
        JOIN users u ON u.email = seeded.email
        JOIN businesses b ON b.business_id = u.business_id
        WHERE b.business_name <> seeded.business_name
    ) THEN
        RAISE EXCEPTION 'A demo user email is already registered to a different business';
    END IF;
END;
$$;

INSERT INTO users (business_id, email, password_hash)
SELECT business_id, email, :'seed_password_hash'
FROM p207_seed_businesses
ON CONFLICT (email) DO NOTHING;

INSERT INTO ingestion_jobs (
    job_id, business_id, upload_type, file_name, file_hash, status,
    total_rows, loaded_rows, rejected_rows
)
SELECT seeded.job_id, business.business_id, seeded.upload_type,
       seeded.file_name, seeded.file_hash, seeded.status,
       seeded.total_rows, seeded.loaded_rows, seeded.rejected_rows
FROM (
    VALUES
        ('Demo Traders', '00000000-0000-4000-8000-000000000711'::UUID,
         'expenses', 'demo_expenses.csv', repeat('a', 64), 'completed_with_warnings', 3, 2, 1),
        ('Demo Traders', '00000000-0000-4000-8000-000000000712'::UUID,
         'feedback', 'demo_feedback.csv', repeat('b', 64), 'completed', 2, 2, 0),
        ('Corner Store', '00000000-0000-4000-8000-000000000721'::UUID,
         'expenses', 'corner_expenses.csv', repeat('c', 64), 'completed_with_warnings', 3, 2, 1),
        ('Corner Store', '00000000-0000-4000-8000-000000000722'::UUID,
         'feedback', 'corner_feedback.csv', repeat('d', 64), 'completed', 2, 2, 0)
) AS seeded(business_name, job_id, upload_type, file_name, file_hash,
            status, total_rows, loaded_rows, rejected_rows)
JOIN p207_seed_businesses business USING (business_name)
ON CONFLICT (job_id) DO NOTHING;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM (
            VALUES
                ('Demo Traders', '00000000-0000-4000-8000-000000000711'::UUID, 'expenses'),
                ('Demo Traders', '00000000-0000-4000-8000-000000000712'::UUID, 'feedback'),
                ('Corner Store', '00000000-0000-4000-8000-000000000721'::UUID, 'expenses'),
                ('Corner Store', '00000000-0000-4000-8000-000000000722'::UUID, 'feedback')
        ) AS seeded(business_name, job_id, upload_type)
        JOIN p207_seed_businesses business USING (business_name)
        LEFT JOIN ingestion_jobs job ON job.job_id = seeded.job_id
        WHERE job.job_id IS NULL
           OR job.business_id <> business.business_id
           OR job.upload_type <> seeded.upload_type
    ) THEN
        RAISE EXCEPTION 'A seed upload job ID is already assigned to a different business or upload type';
    END IF;
END;
$$;

INSERT INTO column_mappings (business_id, upload_type, mapping)
SELECT business.business_id, seeded.upload_type, seeded.mapping
FROM (
    VALUES
        ('Demo Traders', 'expenses',
         '{"date":"Date","category":"Category","amount":"Amount","description":"Description"}'::JSONB),
        ('Demo Traders', 'feedback',
         '{"date":"Date","review_text":"Review","rating":"Rating","review_id":"Review ID"}'::JSONB),
        ('Corner Store', 'expenses',
         '{"date":"Expense Date","category":"Type","amount":"Cost","description":"Note"}'::JSONB),
        ('Corner Store', 'feedback',
         '{"date":"Review Date","review_text":"Comment","rating":"Stars","review_id":"Reference"}'::JSONB)
) AS seeded(business_name, upload_type, mapping)
JOIN p207_seed_businesses business USING (business_name)
ON CONFLICT (business_id, upload_type)
DO UPDATE SET mapping = EXCLUDED.mapping, updated_at = now();

INSERT INTO expenses (
    business_id, job_id, expense_date, category, amount, description, row_hash
)
SELECT business.business_id, seeded.job_id, seeded.expense_date,
       seeded.category, seeded.amount, seeded.description, seeded.row_hash
FROM (
    VALUES
        ('Demo Traders', '00000000-0000-4000-8000-000000000711'::UUID,
         DATE '2026-11-01', 'rent', 85000.00::NUMERIC, 'November shop rent', repeat('1', 64)),
        ('Demo Traders', '00000000-0000-4000-8000-000000000711'::UUID,
         DATE '2026-11-03', 'utilities', 23150.00::NUMERIC, 'Electricity and water', repeat('2', 64)),
        ('Corner Store', '00000000-0000-4000-8000-000000000721'::UUID,
         DATE '2026-11-01', 'rent', 62000.00::NUMERIC, 'November storefront rent', repeat('3', 64)),
        ('Corner Store', '00000000-0000-4000-8000-000000000721'::UUID,
         DATE '2026-11-04', 'supplies', 7850.00::NUMERIC, 'Packaging and cleaning supplies', repeat('4', 64))
) AS seeded(business_name, job_id, expense_date, category, amount, description, row_hash)
JOIN p207_seed_businesses business USING (business_name)
ON CONFLICT (business_id, row_hash) DO NOTHING;

INSERT INTO feedback (
    business_id, job_id, feedback_date, review_text, rating, review_id, row_hash
)
SELECT business.business_id, seeded.job_id, seeded.feedback_date,
       seeded.review_text, seeded.rating, seeded.review_id, seeded.row_hash
FROM (
    VALUES
        ('Demo Traders', '00000000-0000-4000-8000-000000000712'::UUID,
         DATE '2026-11-02', 'Helpful staff and fresh products; checkout was quick.', 5::SMALLINT, 'DT-REV-001', repeat('5', 64)),
        ('Demo Traders', '00000000-0000-4000-8000-000000000712'::UUID,
         DATE '2026-11-04', 'The item was good, but the queue was longer than expected.', 4::SMALLINT, 'DT-REV-002', repeat('6', 64)),
        ('Corner Store', '00000000-0000-4000-8000-000000000722'::UUID,
         DATE '2026-11-02', 'Great service and the order was ready on time.', 5::SMALLINT, 'CS-REV-001', repeat('7', 64)),
        ('Corner Store', '00000000-0000-4000-8000-000000000722'::UUID,
         DATE '2026-11-05', 'The selection was good, although one item was unavailable.', 3::SMALLINT, 'CS-REV-002', repeat('8', 64))
) AS seeded(business_name, job_id, feedback_date, review_text, rating, review_id, row_hash)
JOIN p207_seed_businesses business USING (business_name)
ON CONFLICT (business_id, row_hash) DO NOTHING;

INSERT INTO rejected_rows (business_id, job_id, row_number, column_name, reason)
SELECT business.business_id, seeded.job_id, seeded.row_number,
       seeded.column_name, seeded.reason
FROM (
    VALUES
        ('Demo Traders', '00000000-0000-4000-8000-000000000711'::UUID,
         4, 'Amount', 'not a valid amount'),
        ('Corner Store', '00000000-0000-4000-8000-000000000721'::UUID,
         4, 'Cost', 'not a valid amount')
) AS seeded(business_name, job_id, row_number, column_name, reason)
JOIN p207_seed_businesses business USING (business_name)
WHERE NOT EXISTS (
    SELECT 1
    FROM rejected_rows existing
    WHERE existing.business_id = business.business_id
      AND existing.job_id = seeded.job_id
      AND existing.row_number = seeded.row_number
      AND existing.column_name = seeded.column_name
      AND existing.reason = seeded.reason
);

SELECT business.business_name,
       (SELECT count(*) FROM users u WHERE u.business_id = business.business_id) AS users,
       (SELECT count(*) FROM expenses e WHERE e.business_id = business.business_id) AS expenses,
       (SELECT count(*) FROM feedback f WHERE f.business_id = business.business_id) AS feedback,
       (SELECT count(*) FROM column_mappings m WHERE m.business_id = business.business_id) AS column_mappings,
       (SELECT count(*) FROM rejected_rows r WHERE r.business_id = business.business_id) AS rejected_rows
FROM p207_seed_businesses business
ORDER BY business.business_name;

COMMIT;
