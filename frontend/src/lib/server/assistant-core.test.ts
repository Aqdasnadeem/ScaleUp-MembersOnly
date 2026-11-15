import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyQuestion,
  computeAssistantAnswer,
  safeFiguresForGemini,
  type BusinessRecord,
} from "./assistant-core";

const records: BusinessRecord[] = [
  {
    category: "sales",
    fileName: "sales.csv",
    rowNumber: 2,
    data: { order_id: "AUG-1", date: "2026-08-01", product_id: "SKU-1", total_amount: "312000" },
  },
  {
    category: "sales",
    fileName: "sales.csv",
    rowNumber: 3,
    data: { order_id: "SEP-1", date: "2026-09-01", product_id: "SKU-1", total_amount: "342500" },
  },
  {
    category: "sales",
    fileName: "sales.csv",
    rowNumber: 4,
    data: { order_id: "OCT-1", date: "2026-10-01", product_id: "SKU-1", total_amount: "320000" },
  },
  {
    category: "expenses",
    fileName: "expenses.csv",
    rowNumber: 2,
    data: { expense_id: "SEP-C", date: "2026-09-02", category: "Courier", amount: "22365", budget: "22000" },
  },
  {
    category: "expenses",
    fileName: "expenses.csv",
    rowNumber: 3,
    data: { expense_id: "SEP-O", date: "2026-09-03", category: "Other", amount: "159635" },
  },
  {
    category: "expenses",
    fileName: "expenses.csv",
    rowNumber: 4,
    data: { expense_id: "OCT-C", date: "2026-10-02", category: "Courier", amount: "33100", budget: "22000" },
  },
  {
    category: "expenses",
    fileName: "expenses.csv",
    rowNumber: 5,
    data: { expense_id: "OCT-O", date: "2026-10-03", category: "Other", amount: "191100" },
  },
  {
    category: "inventory",
    fileName: "inventory.csv",
    rowNumber: 2,
    data: { sku_id: "SKU-KEY", product_name: "Mechanical Keyboard", current_stock: "0", min_threshold: "15" },
  },
  {
    category: "inventory",
    fileName: "inventory.csv",
    rowNumber: 3,
    data: { sku_id: "SKU-MOUSE", product_name: "Wireless Mouse", current_stock: "4", min_threshold: "20" },
  },
  {
    category: "feedback",
    fileName: "reviews.csv",
    rowNumber: 2,
    data: { feedback_id: "R-1", rating: "1", review_text: "Courier took 6 days to deliver." },
  },
  {
    category: "feedback",
    fileName: "reviews.csv",
    rowNumber: 3,
    data: { feedback_id: "R-2", rating: "5", review_text: "Excellent product quality." },
  },
];

test("classifies exactly the four supported question types", () => {
  assert.equal(classifyQuestion("Why did profit change?"), "profit_change");
  assert.equal(classifyQuestion("Which stock needs reordering?"), "reorder_items");
  assert.equal(classifyQuestion("What are customers saying about stock?"), "customer_reviews");
  assert.equal(classifyQuestion("What is the sales forecast?"), "sales_forecast");
  assert.equal(classifyQuestion("What is my business tax liability?"), "unsupported");
});

test("computes profit changes, courier increases, and supporting stock evidence", () => {
  const answer = computeAssistantAnswer("Why did profit change?", records);
  assert.equal(answer.type, "profit_change");
  assert.equal(answer.aggregates.previousProfit, 160_500);
  assert.equal(answer.aggregates.currentProfit, 95_800);
  assert.equal(answer.aggregates.courierChangePercent, 48);
  assert.deepEqual(answer.toolsUsed, ["Sales", "Expenses", "Stock"]);
  assert.ok(answer.evidence.some((row) => row.rowData.product_name === "Mechanical Keyboard"));

  const figures = JSON.stringify(safeFiguresForGemini(answer));
  assert.doesNotMatch(figures, /sales\.csv|expenses\.csv|rowData|OCT-C/);
});

test("returns only inventory rows at or below reorder levels", () => {
  const answer = computeAssistantAnswer("Which items need reordering?", records);
  assert.equal(answer.type, "reorder_items");
  assert.equal(answer.evidence.length, 2);
  assert.ok(answer.evidence.every((row) => row.source === "Stock"));
});

test("summarizes review themes without sending review text as Gemini figures", () => {
  const answer = computeAssistantAnswer("What are customers saying?", records);
  assert.equal(answer.type, "customer_reviews");
  assert.equal(answer.aggregates.reviewCount, 2);
  assert.equal(answer.evidence.length, 2);
  assert.doesNotMatch(
    JSON.stringify(safeFiguresForGemini(answer)),
    /Courier took 6 days|Excellent product quality/,
  );
});

test("forecasts revenue with a three-month moving average and exact source rows", () => {
  const answer = computeAssistantAnswer("What is the sales forecast?", records);
  assert.equal(answer.type, "sales_forecast");
  assert.ok(Math.abs(Number(answer.aggregates.forecastRevenue) - 324_833.3333333333) < 0.01);
  assert.equal(answer.evidence.length, 3);
  assert.match(answer.answer, /2026-11/);
});

test("clearly rejects questions outside the four supported types", () => {
  const answer = computeAssistantAnswer("How much tax should I pay?", records);
  assert.equal(answer.type, "unsupported");
  assert.match(answer.answer, /Only four question types are supported right now/);
  assert.deepEqual(answer.evidence, []);
});
