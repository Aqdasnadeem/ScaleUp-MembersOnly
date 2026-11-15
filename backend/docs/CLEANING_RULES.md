# Cleaning and transformation rules (ticket P2-13)

Code: `app/cleaning.py` (cell rules) and `app/transform.py` (merge inside the file). Every row of the "Before / After" columns is a test in `tests/test_cleaning.py`.

**Date convention (written down as the ticket asks):** dates are read with the business setting `businesses.date_format`, either `DD/MM/YYYY` or `MM/DD/YYYY` (BR-21). `2026-10-03` (ISO) is always accepted. Known limit: if the setting is wrong and every day in the file is 12 or less, nothing can detect it.

| ID | Rule | Before | After | Test |
| --- | --- | --- | --- | --- |
| C1 | Text: remove control characters, collapse repeated spaces, trim | `  Blue   Pen ` | `Blue Pen` | `test_c1_clean_text` |
| C1 | Empty required text is an error | `   ` | error: empty | `test_c1_empty_required_is_error` |
| C1 | Longer than the column | 101 characters (max 100) | error: too long | `test_c1_too_long_is_error` |
| C2 | Names (product, category, expense category) are lowercased too | ` Blue Pen ` / `MOUSE` | `blue pen` / `mouse` | `test_c2_names_lowercase` |
| C3 | Numbers: currency symbol and thousand commas removed | `Rs 1,200.50` | `1200.50` | `test_c3_numbers` |
| C3 | Brackets mean negative | `(500)` | `-500` | `test_c3_numbers` |
| C3 | A lone comma is refused (could be a decimal comma) | `1200,50` | error: ambiguous comma | `test_c3_refused` |
| C3 | Text in a number column | `12abc` | error: not a number | `test_c3_refused` |
| C3 | Money has 2 decimals (half-even rounding); absurd sizes refused | `12.3` / `1e12` | `12.30` / error: too large | `test_c3_money_*` |
| C4 | Whole numbers only (quantity, stock, rating) | `3.0` / `2.5` | `3` / error: not a whole number | `test_c4_*` |
| C5 | Blank markers mean "no value": empty, `n/a`, `null`, `none`, `nan`, `-`, `--`. Optional value becomes NULL | `N/A` | NULL (or error if required) | `test_c5_*` |
| C6 | Date by business format | `02/11/2026` | DD/MM: 2 Nov 2026; MM/DD: 11 Feb 2026 | `test_c6_same_text_two_formats` |
| C6 | Other separators and a time of day are accepted, the time is dropped | `03.10.2026 14:30` | `2026-10-03` | `test_c6_formats_and_time_dropped` |
| C6 | Impossible or out-of-range dates (before 2000-01-01 or after today in Asia/Karachi, BR-22; both limits are in `app/config.py`) | `31/02/2026`, `01/01/1999` | error: not a real date / out of range | `test_c6_refused`, `test_c6_today_in_karachi_ok_tomorrow_refused`, `test_c6_karachi_day_is_used_not_the_server_day` |
| C7 | Price: if the file has a unit price, line total = price x quantity; if it has only a total, the total is kept and the unit price is total / quantity | `qty 4, total 100` | line total 100, unit price 25 | `test_total_only_file_derives_price_and_checks_negative` |
| C8 | Product key: the product code if the file has one; the cleaned name only when there is no code column (BR-03) | no SKU column, ` Blue Pen ` | key `blue pen` | `test_name_is_key_only_when_no_code_column` |
| C9 | File: UTF-8 (BOM allowed) or Windows-1252; comma, semicolon, tab or pipe detected; empty lines ignored; Excel / PDF / binary, empty file, duplicate header, header only are refused (whole file fails) | `a;b` | two columns | `test_c9_*` |
| C10 | Merge repeated order + product lines inside the file (BR-18): quantity and line total are added, unit price = total / quantity (weighted average); a different date or customer is a bad row | A1 Pen 2 x 10 and A1 Pen 3 x 20 | A1 Pen, qty 5, total 80, price 16.00 | `tests/test_loader.py::test_repeated_lines_merge_with_weighted_average_and_exact_revenue` |
| C10 | A re-upload of the merged file never doubles the quantity (merge happens in memory, never `quantity = quantity + new` in SQL) | same file twice | qty stays 5 | `test_reupload_of_merged_file_does_not_double_quantities` |
| C10 | Expenses: identical rows in one file are all kept; the row hash includes the occurrence number (BR-09) | `Chai 500` twice | 2 rows | `test_expenses_identical_rows_both_kept_and_reupload_adds_nothing` |
| C10 | Inventory: same product and date twice in one file is a bad row (BR-06) | | bad row | `test_inventory_*` |
| C11 | Returns: a sales line with a NEGATIVE quantity is counted in `returned_rows`, not loaded (revenue is gross) and is not a bad row, so it stays outside the 20% limit (bad rows / all rows except returns). Quantity 0 is still a bad row | `A2,Cap,-3,5` | not loaded; job message "1 return lines ... value 15.00" | `tests/test_returns_cost_role.py::test_returns_*`, `test_a_file_with_many_returns_*` |
| C12 | cost_price is fill-only (BR-23): a different cost in a later file never overwrites the saved one; the job message warns with the number of products | saved 4, new file 5 | cost stays 4; "Warning: 1 products have a different cost" | `test_a_different_cost_keeps_the_saved_one_and_warns` |

Revenue is always `SUM(total_amount)`, never quantity x price (BR-20).
