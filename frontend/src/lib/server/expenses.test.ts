import assert from "node:assert/strict";
import test from "node:test";
import { parseExpenseCategories, parseExpenseEntries } from "../expenses";

test("expense category and entry responses preserve zero, changes and empty entries", () => {
  const categories = {
    month: "2026-03", previous_month: "2026-02",
    categories: [
      { category: "rent", total: 150, previous_total: 100, change_percent: 50 },
      { category: "new", total: 20, previous_total: 0, change_percent: null },
      { category: "old", total: 0, previous_total: 80, change_percent: -100 },
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
