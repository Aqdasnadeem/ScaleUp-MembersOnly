# Speaker notes: Relational schema and ETL (13 slides; slide 13 is a backup)

## Slide 1: cover

Intro: this topic covers how uploaded business data is stored (the relational schema) and how it gets there (the ETL pipeline). The deliverable is diagrams and design only, no code or demo. Say the flow out loud here instead of showing a slide: the user uploads a CSV, maps the columns, the background worker validates, cleans and transforms it, the valid rows load into PostgreSQL tables, and the dashboard and the AI agent read those tables.

## Slide 2: erd-full

Spend about 1:30 here. Walk the diagram in this order: (1) businesses is the account; users and ingestion_jobs hang off it, one business to many of each. (2) The dashed box holds the six tables that are loaded from files. Each row carries business_id and job_id, so all of them are one-to-many from businesses and from ingestion_jobs; this is also how every query is scoped to one business. (3) Inside the box: products and customers are built by the ETL (gold). One product has many sales, inventory snapshots and feedback rows; a feedback row may have no product (0..1). A sale may have no customer (walk-in, 0..1). (4) Expenses has no link to products or customers: an expense row only has date, category, amount and description. Notation is crow's foot: double bar means exactly one, circle and bar means zero or one, the three-pronged foot means many. Every table has a primary key, every foreign key is marked FK with its parent, and every column has a PostgreSQL type. The diagram is generated from the same spec as the SQL migrations, which were run on a fresh PostgreSQL 16 database. If someone asks for a closer look, open the PNG or PDF.

## Slide 3: Account and reference tables

Six reference tables. ingestion_jobs does two jobs: it is the history of uploads, and it is the queue the background worker reads, so we do not need a separate queue system. Products and customers have no screen of their own: the user never types them in, they appear automatically from the files. product_key is the SKU or product_id when the file has one, otherwise the cleaned product name. column_mappings is what makes the mapping screen remember a user’s choice, and the bad-row report now lives on ingestion_jobs itself, so the user can see it after the background worker has finished.

## Slide 4: File columns and unique keys

Two things on one slide: what each file must contain, and what counts as a duplicate. We keep the required columns as few as possible because real SME files are messy and often merged; optional columns are used when they exist and the website shows a clear empty state when they do not. The database enforces the unique keys itself, so even a bug in our code cannot create double sales. Sales key is order number plus product code, never only the name (confirmed). Product and customer keys use the code first and the cleaned name only if the file has no code. Expenses: two identical expenses in one file get occurrence numbers 1 and 2, so both are kept (confirmed). We use an occurrence number instead of the raw row number, so deleting a line from the file does not shift the numbers and load old expenses twice. Feedback key is still our proposal. Column names can change when the CSV templates are final.

## Slide 5: Column mapping for different file layouts

Sir confirmed a mapping screen, with an auto-suggested match that is saved so the user does not map every time, and a template for those who want fixed names. Why: real SME files rarely match our column names, and some files merge several things, for example a sales file that also has product names. The saved mapping lives in the column_mappings table, one per business and file type. The ETL applies it first, before validation.

## Slide 6: Five stages, run by the background worker

The whole pipeline runs in the background worker, not in the web request, so the user can keep working while a big file is processed. The job row in ingestion_jobs shows the status. The important design choice is the order: the whole file is validated first, and nothing is written until validation passes. Loading uses COPY into a staging table, then one INSERT with ON CONFLICT DO NOTHING inside a single transaction, which is fast for big files and safe against duplicates.

## Slide 7: Check the whole file first, then clean valid rows

Two levels of checks. File checks are about the structure: if a required header is missing, no row can be trusted, so the whole file is rejected. Row checks are about single values: a bad date only affects that row, and every rejected row is reported with row number, column and reason. The same-file check looks at the content, not the name, so renaming does not help; it is a warning and the user chooses skip or replace (confirmed). Cleaning only happens on rows that passed validation. The goal is that the same product written in different ways ends up as one product, and that dates and amounts are real data types. The date format comes from the business profile (day first or month first). We lowercase names for matching and plan to keep the original spelling for display.

## Slide 8: Building products and customers from the files

Transform is where the raw file turns into the relational model. The user never uploads a products file or a customers file: products and customers are derived. This keeps the upload simple (four file types) but still gives us proper tables to join on. Repeated lines of one order and product are summed into one line, with quantity and line total added up, so no revenue is lost. Customers are kept as a table because sales can point to them, but no profile details are stored, only the id from the file. After loading, the worker refreshes the summary tables that the dashboard reads, and queues feedback rows for the NLP step.

## Slide 9: What happens to errors and repeats

Left side is the rule for bad rows. If the structure is wrong, the file is rejected. If more than 20 percent of the data rows are bad, we save nothing, because the file is probably the wrong file or badly broken. Otherwise we load the valid rows in one transaction and report the bad ones so the user can fix them. A file with some bad rows ends as completed_with_warnings; a file with no bad rows ends as completed. Exactly 20 percent still loads. The 20 percent is a config constant. Right side is duplicates. Because duplicates are skipped and not overwritten, uploading the whole corrected file again is always safe. If the user edits a row that was already saved and uploads again, it is saved as a new row and the old one stays; the replace option removes the earlier upload by job_id and covers this. Known limit: a corrected inventory row for a product and date that already exist is skipped.

## Slide 10: A sales file with five data rows

Walk through the table row by row. Rows 1 and 2 are loaded, and the products in rows 1 and 2 become one product, blue pen, after cleaning. Row 2 has no customer, so it is a walk-in sale. Row 3 repeats order A-102 with the same product, so it is merged into row 2 and the sales line has quantity 2; with the same price, the total stays exact. Row 4 has an impossible date, 31 February, so it is rejected and reported with its row number, the column and the reason. Row 5 is loaded. Notebook and C-09 only appear in the rejected row, so no product or customer is created for them. This is an invented example for the presentation.

## Slide 11: Online Retail II, 1,067,371 rows, loaded in 224 seconds

An earlier team run on Online Retail I (541,909 rows) gave the same picture. This is our own run, not a copy of someone else's numbers: the public Online Retail II file, 1,067,371 rows, through the same loader and the same migrations we just showed, in 224 seconds on a laptop with 8 GB RAM (about 70 seconds on a faster machine); a second machine gave identical counts. 999,117 sales lines were loaded, 45,299 repeated order-and-product lines were merged into them, and 22,955 rows were rejected, which is 2.1 percent, far below our 20 percent limit. Almost every rejection is a return: this dataset marks returns with a negative quantity and we do not track returns yet, so they are reported, not loaded. The same file also produced 4,984 products and 5,881 customers, which proves the derive-from-file idea on real data. We then threw deliberately different file shapes at the schema: a Shopify order export, a daily POS summary with no order id, a bank statement, a pivot file with months as columns, and an inventory file with two warehouses. Everything either loaded or failed with a clear message, and only the two-warehouse case would need the database to change, which is why we want the advisor to confirm one location for FYP-1. If asked about returns, say the plan is a separate returns handling in FYP-2. If asked about the merge: of the 42,084 order-and-product pairs that repeat, 31,046 have the same price and the same quantity. We cannot tell if those are real repeats or double entries, so we sum them and state it as an assumption; if every one were a double entry, revenue would be overstated by at most 2.3 percent. Revenue is gross because returns are rejected, not subtracted. Same-file re-upload (warning, then skip or replace) is covered by the automated tests, not by this big run.

## Slide 12: Design decisions

Closing: the schema gives the agent clean, trustworthy tables, and the ETL makes sure only validated, de-duplicated rows reach them. The user always gets a clear report of what was loaded, skipped or rejected. These are the design decisions we agreed, plus the known limits: an edited row is loaded as a new row (replace covers it), a corrected inventory snapshot for an existing product and date is skipped, and stock in two locations cannot be loaded because the key is product plus date. Three things on this slide are ours, not the advisor’s: the weighted-average price for merged lines, the optional cost price, and the one-location assumption. Returns are the main future work. Then invite questions.

## Slide 13: Supporting tables

Besides the ten core tables, five supporting tables are needed to run the website. They are not uploaded: they are written by the upload screen, the ETL worker, the NLP worker, the analytics worker or the AI agent. analysis_history comes from the proposal (maintain analysis history) and from the member's database design. We checked the website pages (dashboard, analytics, evidence, history) and these tables cover what they show.
