# Scale Up schema + ETL test report

62 tests: 59 PASS, 3 known limits confirmed, 0 FAIL

| Result | Group | Test | Detail | s |
| --- | --- | --- | --- | --- |
| PASS | parsers | numbers: 18 accepted/rejected forms behave as specified |  | 0.0 |
| PASS | parsers | whole numbers: 2.0 ok, 2.5 and 99999999999 rejected |  | 0.0 |
| PASS | parsers | dates: 14 forms behave as specified (DD/MM business) |  | 0.0 |
| LIMIT | parsers | same date text reads differently per business format (ambiguity is real) | DD/MM gives 2026-02-11, MM/DD gives 2026-11-02: a wrong business setting silently shifts dates; only a mass of invalid dates (e.g. 25/12) is caught | 0.0 |
| PASS | parsers | text cleaning: whitespace, control characters, length |  | 0.0 |
| PASS | mapping | auto-suggest maps the three sales layouts and the other file types |  | 0.0 |
| PASS | mapping | saved mapping: upsert per business and file type, isolated between businesses |  | 0.03 |
| PASS | sales | layout A: Rs/spaces/case cleaned, repeated line merged, 3 bad rows reported at exact row numbers (20% = loads) |  | 0.04 |
| PASS | sales | layout B: no SKU, total only, MM/DD dates: key from cleaned name, unit_price derived |  | 0.05 |
| PASS | sales | layout C: semicolon delimiter, ISO dates, repeated lines with different price -> weighted average, revenue preserved |  | 0.04 |
| PASS | sales | Excel-style file: BOM + CRLF + quoted comma and line break inside a product name |  | 0.06 |
| PASS | sales | latin-1 encoded file (Windows Excel save): loads with an encoding warning |  | 0.04 |
| PASS | sales | whole file rejected, nothing saved: Excel file renamed .csv |  | 0.05 |
| PASS | sales | whole file rejected, nothing saved: empty file (0 bytes) |  | 0.05 |
| PASS | sales | whole file rejected, nothing saved: whitespace-only file |  | 0.04 |
| PASS | sales | whole file rejected, nothing saved: header only |  | 0.04 |
| PASS | sales | whole file rejected, nothing saved: duplicate column names |  | 0.04 |
| PASS | sales | whole file rejected, nothing saved: quantity column missing |  | 0.04 |
| PASS | sales | whole file rejected, nothing saved: price and total both missing |  | 0.04 |
| PASS | sales | whole file rejected, nothing saved: PDF renamed .csv |  | 0.04 |
| PASS | sales | explicit mapping to a column that does not exist -> whole file rejected naming the column |  | 0.04 |
| PASS | sales | ragged rows (too few / too many fields) are bad rows; header spacing, case and trailing delimiter tolerated |  | 0.04 |
| PASS | sales | mixed nasty file: 12 different bad rows reported with file column + reason; injection text, emoji, NUL byte stored safely; 150 good rows load |  | 0.06 |
| PASS | sales | bad-row limit: 19 of 100 rows bad -> completed_with_warnings |  | 0.06 |
| PASS | sales | bad-row limit: 20 of 100 rows bad -> completed_with_warnings |  | 0.05 |
| PASS | sales | bad-row limit: 21 of 100 rows bad -> failed |  | 0.04 |
| PASS | sales | bad-row limit: 100 of 100 rows bad -> failed |  | 0.03 |
| PASS | sales | returns (negative qty) rejected; repeated lines merged; conflicting date/customer in repeated lines rejected; revenue reconciles |  | 0.05 |
| PASS | sales | same file twice: warning -> skip changes nothing -> replace keeps history and exact row count |  | 0.07 |
| PASS | sales | replace with a BAD file leaves the old data untouched (transaction safety) |  | 0.05 |
| PASS | sales | replace where the LOAD itself crashes half-way: old rows and old job status come back (rollback) |  | 0.05 |
| PASS | sales | replace target of another business is refused |  | 0.06 |
| LIMIT | sales | edited file re-uploaded: saved rows skipped and reported; the edited price is NOT updated (by design) | (1, 10, Decimal('10.00'), '10 rows skipped: already saved earlier (duplicates are never overwritten)') | 0.07 |
| PASS | sales | tenants: same order_id and same SKU in two businesses both saved; each sees only its own |  | 0.08 |
| PASS | sales | walk-in customers stay NULL; customers table has distinct ids only |  | 0.05 |
| PASS | sales | SKU column present but blank in some rows -> those rows rejected (name is never the key when a code column exists) |  | 0.05 |
| PASS | sales | product name variants without code (" Blue  Pen ", "BLUE PEN") become one product |  | 0.05 |
| PASS | sales | extra unmapped columns and different column order are ignored |  | 0.05 |
| PASS | sales | concurrency: 6 parallel uploads of the same file -> exactly one job loads, rows not doubled, no crash |  | 0.11 |
| PASS | sales | concurrency: 6 parallel DIFFERENT files with overlapping products -> all load, no deadlock |  | 0.13 |
| PASS | performance | 10,000-row sales file loads in under 30 s (NFR-PERF-02) | status completed, loaded 10000, 0.6 s | 0.65 |
| PASS | performance | 100,000-row file loads (chunking not implemented in this prototype: reported, not required) | status completed, loaded 100000, 12.7 s | 12.94 |
| PASS | inventory | snapshot with date column loads; second date adds rows; same product+date again is skipped and reported |  | 0.08 |
| PASS | inventory | no date column: snapshot date from the upload screen is used; missing both -> file rejected |  | 0.06 |
| PASS | inventory | negative / fractional / text stock rejected; same product+date twice in one file rejected as bad row |  | 0.04 |
| PASS | inventory | products are shared: SKU from sales and inventory become ONE product row |  | 0.07 |
| PASS | inventory | name-only files: "Blue Pen" in sales and " blue pen " in inventory are the same product |  | 0.07 |
| PASS | expenses | basic load: category cleaned (" Rent"/"RENT "), amounts with Rs/commas, zero amount allowed, blank note -> NULL |  | 0.08 |
| PASS | expenses | three identical rows in one file are all kept (occurrence count in the hash) |  | 0.06 |
| PASS | expenses | edit cases: appended identical row adds exactly 1; deleting an unrelated line adds 0; deleting one of three identical lines adds 0 |  | 0.08 |
| PASS | expenses | negative amount (refund) rejected; same file twice -> warning |  | 0.05 |
| PASS | expenses | amount 1200,50 (decimal comma) is rejected instead of silently becoming 120050 |  | 0.04 |
| PASS | feedback | basic load with rating, review id and product link (known product linked, unknown product saved without link + message) |  | 0.05 |
| PASS | feedback | ratings: 4.0 ok, blank ok, 6 / 0 / "five" / "5 stars" rejected |  | 0.04 |
| PASS | feedback | empty / whitespace-only text and a 20,000-character review are rejected |  | 0.05 |
| PASS | feedback | duplicates: same review_id skipped; no id + same date+text skipped; same text on another date kept |  | 0.05 |
| PASS | feedback | same feedback file twice -> warning; Unicode emoji stored intact |  | 0.05 |
| PASS | jobs | bad-row report is stored on the job (row, column, reason) and capped at 1,000 entries while counts stay exact |  | 0.12 |
| PASS | jobs | successful job stores counts, status and message |  | 0.07 |
| PASS | db | constraints reject bad data directly in SQL (10 checks) |  | 0.05 |
| LIMIT | db | KNOWN LIMIT: a sale of business B can point to a product of business A (FK does not check the business) | accepted by the database: the loader must prevent it (a composite FK would fix it) | 0.05 |
| PASS | migrations | fresh database: 001-004 run, 004 down then up, all down then all up again |  | 0.17 |
