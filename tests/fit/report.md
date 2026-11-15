# Can the schema take any dataset? (fit test)

Every file below was loaded through the same ETL into a fresh database built by migrations 001-003.
REAL = a public dataset downloaded from GitHub, nobody on the team wrote it. SHAPE = a layout we wrote ourselves, copying a common export format.

| File | Source | Type | Result | Loaded | Rejected | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| REAL Online Retail II (1.07M rows) | REAL | sales | completed_with_warnings | 999117 | 22955 | **Fits** |
| REAL SampleSuperstore | REAL | sales | failed | 0 | 0 | **Cannot load** |
| REAL stock_codes.csv | REAL | inventory | failed | 0 | 0 | **Cannot load** |
| Shopify order export | SHAPE | sales | completed | 40 | 0 | **Fits** |
| Shopify export, auto-suggest only | SHAPE | sales | failed | 0 | 0 | **Needs the mapping screen** |
| POS daily summary (no order id) | SHAPE | sales | failed | 0 | 0 | **Needs an ETL rule** |
| Inventory with 2 warehouses | SHAPE | inventory | failed | 0 | 4 | **Needs a schema change** |
| Bank statement expenses | SHAPE | expenses | completed_with_warnings | 16 | 4 | **Fits with a loss** |
| Review export | SHAPE | feedback | completed_with_warnings | 25 | 0 | **Fits** |
| Pivot file (months as columns) | SHAPE | sales | failed | 0 | 0 | **Needs an ETL rule** |
| Sales with Currency column | SHAPE | sales | completed | 20 | 0 | **Fits with a risk** |
| Sales with tax/discount/shipping | SHAPE | sales | completed | 20 | 0 | **Fits with a loss** |

## What each result means

**REAL Online Retail II (1.07M rows)** — Fits. Returns (negative quantity) are rejected: 22,950 real rows. Time of day in InvoiceDate and the Country column are dropped.
  Rejection reasons: must be more than 0 (returns are not supported yet) (22950); negative price (5)
  Job message: 45299 repeated order+product lines merged
  Rows in the database: sales 999117, products 4984, customers 5881

**REAL SampleSuperstore** — Cannot load. This copy of the file has no order id and no date column at all, only aggregates. No schema can fix that; the user must export the order-level file.
  Job message: required field not mapped: order_id, date, product_code or product_name

**REAL stock_codes.csv** — Cannot load. Not an inventory file: product codes and a count with no column name.
  Job message: required field not mapped: stock_quantity

**Shopify order export** — Fits. Loads once the order id (column "Name") and date are set on the mapping screen.
  Rows in the database: sales 40, products 1, customers 40

**Shopify export, auto-suggest only** — Needs the mapping screen. Auto-suggest cannot guess that "Name" is the order id or "Paid at" the date. This is what the mapping screen (BR-24) is for.
  Job message: required field not mapped: order_id, date

**POS daily summary (no order id)** — Needs an ETL rule. Daily totals have no order id. The ETL could build one from date + product; the table itself would not change.
  Job message: required field not mapped: order_id, unit_price or total

**Inventory with 2 warehouses** — Needs a schema change. Same product and date in two locations is a duplicate for us: the whole file is rejected. A location column and a 3-part key would be needed (open issue OI-6).
  Rejection reasons: same product and date twice in the file (4)
  Job message: more than 20% of rows are bad; nothing saved

**Bank statement expenses** — Fits with a loss. Debit rows load as expenses. Credit rows (income) have no table; they are reported as bad rows.
  Rejection reasons: empty (4)
  Rows in the database: expenses 16

**Review export** — Fits. 
  Job message: some feedback rows name a product that does not exist; saved without a product link
  Rows in the database: feedback 25

**Pivot file (months as columns)** — Needs an ETL rule. Months as columns. The ETL would have to unpivot first; the tables would not change.
  Job message: required field not mapped: order_id, date, quantity, unit_price or total

**Sales with Currency column** — Fits with a risk. Currency is one per business, so a mixed-currency file silently adds PKR and USD together.
  Rows in the database: sales 20, products 4, customers 5

**Sales with tax/discount/shipping** — Fits with a loss. Extra columns are ignored and the line total is stored. Net vs gross or tax reporting would need new columns.
  Rows in the database: sales 20, products 5

## The real dataset in numbers

UCI Online Retail II, 1,067,371 data rows, loaded in 74 seconds on the test machine:

- 999,117 sales lines loaded
- 45,299 repeated order + product lines merged into the rows above (BR-18)
- 22,955 rejected: 22,950 returns (quantity 0 or less) and 5 negative prices = 2.15%, far below the 20% limit
- 4,984 products and 5,881 customers derived from the same file

## Changes this test caused

- Added column-name synonyms so auto-suggest finds Lineitem sku / Lineitem quantity / Lineitem price, Body, Debit, Order Number.
- No schema change was needed for any file that loaded.

## Things that WOULD need a migration later (ask the advisor now)

| # | Case | What breaks today | What it would cost |
| --- | --- | --- | --- |
| 1 | Stock in more than one location | The whole inventory file is rejected as duplicates | New column + new unique key on inventory. The expensive one, because the key changes |
| 2 | Returns / refunds | 2.15% of real rows dropped; sales are never reduced | New column or a returns table |
| 3 | Mixed currencies in one file | Totals are added up as if one currency | Currency per sale instead of per business |
| 4 | Tax, discount, shipping | Stored only inside the line total | New columns on sales |
| 5 | Time of day, city / country | Dropped; no hourly or regional analysis | sale_date becomes a timestamp; customers get columns |

Adding a column or a table later is a normal migration and does not touch existing rows. Changing a unique key (case 1) does, which is why it is worth deciding before FYP-2.
