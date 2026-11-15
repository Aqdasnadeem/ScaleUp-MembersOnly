import assert from "node:assert/strict";
import test from "node:test";
import { createDemoDashboard } from "../demo-dashboard";

test("builds the read-only dashboard from the shared analytics fixtures", () => {
  const dashboard = createDemoDashboard();

  assert.equal(dashboard.metrics.revenue, 342_500);
  assert.equal(dashboard.metrics.expenses, 224_200);
  assert.equal(dashboard.metrics.inventoryValue, 374_900);
  assert.equal(dashboard.metrics.revenue - dashboard.metrics.expenses, 118_300);
  assert.equal(dashboard.metrics.lowStockCount, 3);
  assert.equal(dashboard.monthlyRevenue.length, 10);
  assert.equal(dashboard.customerReviewSummary.count, 4);
  assert.ok(dashboard.alerts.some((alert) =>
    alert.title === "Courier costs above the monthly budget"
      && alert.evidence[0]?.fileName === "expenses-oct-2026.csv"
      && alert.evidence[0]?.rowNumber === 3,
  ));
});
