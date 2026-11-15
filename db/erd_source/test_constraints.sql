\set ON_ERROR_STOP off
\set QUIET on
INSERT INTO businesses(business_name) VALUES ('Biz A'),('Biz B');
INSERT INTO ingestion_jobs(business_id,upload_type,file_name,file_hash) SELECT business_id,'sales','a.csv',repeat('a',64) FROM businesses WHERE business_name='Biz A';
\echo '--- valid inserts (expect no error)'
INSERT INTO products(business_id,job_id,product_key,product_name) SELECT b.business_id,j.job_id,'P1','pen' FROM businesses b JOIN ingestion_jobs j USING(business_id) WHERE b.business_name='Biz A';
INSERT INTO sales(business_id,job_id,product_id,order_id,sale_date,quantity,unit_price,total_amount) SELECT business_id,job_id,product_id,'O1','2026-10-01',2,5,10 FROM products;
\echo '--- 1 duplicate sale key (expect unique violation)'
INSERT INTO sales(business_id,job_id,product_id,order_id,sale_date,quantity,unit_price,total_amount) SELECT business_id,job_id,product_id,'O1','2026-10-02',1,5,5 FROM products;
\echo '--- 2 ON CONFLICT DO NOTHING skips it silently (expect INSERT 0 0)'
INSERT INTO sales(business_id,job_id,product_id,order_id,sale_date,quantity,unit_price,total_amount) SELECT business_id,job_id,product_id,'O1','2026-10-02',1,5,5 FROM products ON CONFLICT DO NOTHING;
\echo '--- 3 quantity 0 (expect check violation)'
INSERT INTO sales(business_id,job_id,product_id,order_id,sale_date,quantity,unit_price,total_amount) SELECT business_id,job_id,product_id,'O2','2026-10-02',0,5,0 FROM products;
\echo '--- 4 negative price (expect check violation)'
INSERT INTO sales(business_id,job_id,product_id,order_id,sale_date,quantity,unit_price,total_amount) SELECT business_id,job_id,product_id,'O3','2026-10-02',1,-5,5 FROM products;
\echo '--- 5 missing product (expect FK violation)'
INSERT INTO sales(business_id,job_id,product_id,order_id,sale_date,quantity,unit_price,total_amount) SELECT business_id,job_id,99999,'O4','2026-10-02',1,5,5 FROM products;
\echo '--- 6 NULL business_id (expect not-null violation)'
INSERT INTO expenses(business_id,job_id,expense_date,category,amount,row_hash) VALUES (NULL,gen_random_uuid(),'2026-10-01','rent',100,repeat('b',64));
\echo '--- 7 bad status (expect check violation)'
UPDATE ingestion_jobs SET status='weird';
\echo '--- 8 bad upload_type (expect check violation)'
INSERT INTO ingestion_jobs(business_id,upload_type,file_name,file_hash) SELECT business_id,'products','x.csv',repeat('c',64) FROM businesses LIMIT 1;
\echo '--- 9 rating 9 (expect check violation)'
INSERT INTO feedback(business_id,job_id,feedback_date,review_text,rating,row_hash) SELECT business_id,job_id,'2026-10-01','nice',9,repeat('d',64) FROM ingestion_jobs;
\echo '--- 10 feedback without product + valid rating (expect ok)'
INSERT INTO feedback(business_id,job_id,feedback_date,review_text,rating,row_hash) SELECT business_id,job_id,'2026-10-01','nice',5,repeat('d',64) FROM ingestion_jobs;
\echo '--- 11 sale without customer (walk-in) is stored with NULL customer (expect ok, count 1)'
SELECT count(*) FROM sales WHERE customer_id IS NULL;
\echo '--- 12 inventory duplicate snapshot (expect unique violation on 2nd)'
INSERT INTO inventory(business_id,job_id,product_id,snapshot_date,stock_quantity) SELECT business_id,job_id,product_id,'2026-10-01',5 FROM products;
INSERT INTO inventory(business_id,job_id,product_id,snapshot_date,stock_quantity) SELECT business_id,job_id,product_id,'2026-10-01',7 FROM products;
\echo '--- 13 negative stock (expect check violation)'
INSERT INTO inventory(business_id,job_id,product_id,snapshot_date,stock_quantity) SELECT business_id,job_id,product_id,'2026-10-02',-1 FROM products;
\echo '--- 14 delete business that still has rows (expect FK violation)'
DELETE FROM businesses WHERE business_name='Biz A';
\echo '--- 15 negative low_stock_threshold (expect check violation)'
UPDATE businesses SET low_stock_threshold=-1 WHERE business_name='Biz B';
\echo '--- 16 negative cost_price (expect check violation)'
UPDATE products SET cost_price=-5;
\echo '--- 17 cost_price 3.50 and NULL (expect ok)'
UPDATE products SET cost_price=3.50;
UPDATE products SET cost_price=NULL;
\echo '--- 18 status replaced (expect ok)'
UPDATE ingestion_jobs SET status='replaced';
\echo '--- 19 error_report JSONB stored (expect ok)'
UPDATE ingestion_jobs SET error_report='[{"row":3,"reason":"bad date"}]'::jsonb, message='3 rows rejected';
\echo '--- 20 column_mappings: one per business+type (2nd insert expect unique violation)'
INSERT INTO column_mappings(business_id,upload_type,mapping) SELECT business_id,'sales','{"order_id":"Inv No"}' FROM businesses WHERE business_name='Biz B';
INSERT INTO column_mappings(business_id,upload_type,mapping) SELECT business_id,'sales','{"order_id":"X"}' FROM businesses WHERE business_name='Biz B';
\echo '--- 21 column_mappings bad upload_type (expect check violation)'
INSERT INTO column_mappings(business_id,upload_type,mapping) SELECT business_id,'products','{}' FROM businesses WHERE business_name='Biz B';
