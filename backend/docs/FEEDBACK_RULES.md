# Feedback text rules (ticket P2-53)

Feedback uploads (customer reviews) have their own rules, separate from the sales, inventory and expense rules in `CLEANING_RULES.md` (P2-13). Code: `backend/app/schemas.py` (`FeedbackRow`), `backend/app/cleaning.py`, `backend/app/transform.py` (row hash). Tests: `backend/tests/test_feedback_rules.py`.

Each rule shows the value before cleaning and after cleaning. "Refused" means the row goes to the bad-row report with the reason shown.

| Rule | Column | Rule | Before | After / result |
|---|---|---|---|---|
| F1 | Review | Control characters removed, repeated spaces collapsed, trimmed. Empty is refused. Max 10,000 characters. | `"  Great   product!\n"` | `Great product!` |
| F1 | Review | Only spaces | `"   "` | refused: `empty` |
| F2 | Rating | Optional. Whole number from 1 to 5. `3.0` counts as 3. | `"3.0"` | `3` |
| F2 | Rating | Decimal part that is not zero | `"2.5"` | refused: `not a whole number` |
| F2 | Rating | Outside 1 to 5 | `"9"` or `"0"` | refused: `must be 1 to 5` |
| F2 | Rating | Blank (allowed, no rating) | `""` | `null` |
| F3 | Review ID | Optional. Trimmed. Max 100 characters. Blank means no ID. | `"  R-001 "` / `"   "` | `R-001` / `null` |
| F4 | Product | Optional. Lowercase and trimmed, same key as sales and inventory (C2). Blank means no product. | `" Blue Pen "` | `blue pen` |
| F5 | Date | Same date convention as the other uploads (C6, business setting DD/MM/YYYY or MM/DD/YYYY). | `03/10/2026` with DD/MM/YYYY | `2026-10-03` |

## Duplicates (F6)

Two review lines are the same review when their row key is the same. The key is the code as it is today (`backend/app/transform.py`, feedback branch), which matches the prototype test in `run_tests.py` ("no id + same date+text skipped"):

- If the review has a review ID, the key is the ID (`id:<review_id>`). Two lines with the same ID are one review, even if the text differs.
- If there is no ID, the key is the date and the cleaned review text (`dt:<date>|<text>`). The rating is not part of the key. Lines that differ only in extra spaces are the same after cleaning (F1).
- Re-uploading a file does not add rows (`on conflict (business_id, row_hash) do nothing`).
- Every skipped line is counted in the job `message` by the pipeline ("N rows skipped: already saved earlier"). Nothing is dropped without a count.

Known limit, to say in the demo: two genuine reviews with the same text on the same day, with no review ID, are counted as one. The sir-approved occurrence count (BR-09) applies to expenses, not to feedback. Changing this would break the prototype test, so it is not changed.

Wording issue (not changed): the skipped message says "already saved earlier" even for a repeat inside the same file.
