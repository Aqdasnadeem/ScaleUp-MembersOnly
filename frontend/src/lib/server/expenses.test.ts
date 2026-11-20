import assert from "node:assert/strict";
import test from "node:test";
import { parseExpenseCategories, parseExpenseEntries } from "../expenses";

test("expense category and entry responses preserve zero, changes and empty entries", () => {
  const categories = {
    month: "2026-03", previous_month: "2026-02",
    categories: [
      { category: "rent", total: 150, previous_total: 100, change_percent: 50, unusual_increase: false, anomaly_status: "normal", anomaly_score: 50, anomaly_explanation: "Spending is within the normal month-over-month range." },
      { category: "new", total: 20, previous_total: null, change_percent: null, unusual_increase: null, anomaly_status: "insufficient_history", anomaly_score: null, anomaly_explanation: "Previous month data is required for month-over-month comparison." },
      { category: "old", total: 0, previous_total: 80, change_percent: -100, unusual_increase: true, anomaly_status: "flagged", anomaly_score: -100, anomaly_explanation: "Spending increased by -100% (PKR -80), exceeding both thresholds." },
    ],
  };
  assert.deepEqual(parseExpenseCategories(categories), categories);
  const entries = { month: "2026-03", category: "rent", entries: [{ expense_id: 1, date: "2026-03-01", amount: 0, description: null }] };
  assert.deepEqual(parseExpenseEntries(entries), entries);
  assert.deepEqual(parseExpenseEntries({ ...entries, entries: [] }).entries, []);
});

test("expense responses reject missing and invalid values", () => {
  assert.throws(() => parseExpenseCategories({ month: "2026-03", previous_month: "2026-02", categories: [{ category: "rent", total: null, previous_total: 0, change_percent: null }] }), /invalid expense categories/);
  assert.throws(() => parseExpenseEntries({ month: "2026-03", category: "rent", entries: [{ expense_id: 1, date: "2026-02-30", amount: 1, description: null }] }), /invalid expense entries/);
  assert.throws(() => parseExpenseEntries({ month: "2026-03", category: "rent", entries: [{ expense_id: 1, date: "2026-03-01", amount: -1, description: null }] }), /invalid expense entries/);
});
