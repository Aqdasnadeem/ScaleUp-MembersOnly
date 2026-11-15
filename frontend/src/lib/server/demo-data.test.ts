import assert from "node:assert/strict";
import test from "node:test";
import {
  getPeriodFinancials,
  inventoryValue,
  mockExpensesBreakdown,
  mockProducts,
  mockMetrics,
  mockOrderLines,
  REVENUE_YTD,
  totalExpenses,
  TOTAL_UNITS_SOLD,
} from "../demoData";

test("demo revenue and expense totals agree across reporting views", () => {
  const thirtyDays = getPeriodFinancials("30D");
  const ninetyDays = getPeriodFinancials("90D");
  const yearToDate = getPeriodFinancials("YTD");

  assert.ok(thirtyDays.expenses <= ninetyDays.expenses);
  assert.ok(ninetyDays.expenses <= yearToDate.expenses);
  assert.equal(yearToDate.revenue, REVENUE_YTD);
  assert.equal(yearToDate.expenses, totalExpenses);
  assert.equal(totalExpenses, mockExpensesBreakdown.reduce((sum, item) => sum + item.amount, 0));
  assert.notEqual(thirtyDays.change, ninetyDays.change);
  assert.notEqual(ninetyDays.change, yearToDate.change);
});

test("product units and inventory valuation are calculated from catalog records", () => {
  assert.equal(TOTAL_UNITS_SOLD, mockProducts.reduce((sum, product) => sum + product.unitsSold, 0));
  assert.equal(mockMetrics.totalOrders, new Set(mockOrderLines.map((line) => line.orderId)).size);
  assert.equal(inventoryValue, 374_900);
  const topProduct = mockProducts.reduce((top, product) =>
    product.revenue > top.revenue ? product : top,
  );
  assert.equal(topProduct.name, "Laptop Aluminum Riser Stand");
});
