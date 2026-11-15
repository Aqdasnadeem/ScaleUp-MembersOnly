-- Down: drops all 11 tables created by migrations 001 to 004, children first.
BEGIN;
DROP TABLE IF EXISTS rejected_rows;
DROP TABLE IF EXISTS feedback;
DROP TABLE IF EXISTS expenses;
DROP TABLE IF EXISTS inventory;
DROP TABLE IF EXISTS sales;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS column_mappings;
DROP TABLE IF EXISTS ingestion_jobs;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS businesses;
COMMIT;
