import type { DashboardResponse } from "@/app/demo/dashboard/DemoDashboardView";
import {
  itemsAtRisk,
  inventoryValue,
  mockAnomalies,
  mockExpensesBreakdown,
  mockFeedback,
  mockInventory,
  mockMetrics,
  mockRevenueTrend,
  REVENUE_YTD,
  totalExpenses,
} from "@/lib/demo-data";

export function createDemoDashboard(): DashboardResponse {
  const inventoryLevels = mockInventory.map((item) => ({
    sku: item.id,
    productName: item.name,
    currentStock: item.currentStock,
    reorderThreshold: item.minThreshold,
  }));
  const lowStockItems = mockInventory
    .map((item, index) => ({ item, rowNumber: index + 2 }))
    .filter(({ item }) => item.currentStock <= item.minThreshold)
    .map(({ item, rowNumber }) => ({
      sku: item.id,
      productName: item.name,
      category: item.category,
      currentStock: item.currentStock,
      reorderThreshold: item.minThreshold,
      fileName: "inventory-oct-2026.csv",
      rowNumber,
      rowData: {
        sku_id: item.id,
        product_name: item.name,
        category: item.category,
        current_stock: String(item.currentStock),
        min_threshold: String(item.minThreshold),
        unit_price: String(item.unitPrice),
      },
    }));

  const courierExpense = mockExpensesBreakdown.find((item) => item.category === "Logistics & Shipping");
  const keyboardEvidence = lowStockItems.find((item) => item.sku === "SKU-102");
  const firstReview = mockFeedback[0];
  const alerts: DashboardResponse["alerts"] = mockAnomalies
    .filter((anomaly) => anomaly.category !== "feedback")
    .map((anomaly) => ({
      id: anomaly.id,
      type: anomaly.category === "expenses" ? "expense_over_budget" : "low_stock",
      category: anomaly.category === "expenses" ? "expenses" : "inventory",
      title: anomaly.title,
      detail: anomaly.description,
      evidence: anomaly.category === "expenses" && courierExpense
        ? [{
            fileName: "expenses-oct-2026.csv",
            rowNumber: 3,
            data: {
              category: courierExpense.category,
              amount: String(courierExpense.amount),
              budget: String(courierExpense.budget),
            },
          }]
        : keyboardEvidence
          ? [{ fileName: keyboardEvidence.fileName, rowNumber: keyboardEvidence.rowNumber, data: keyboardEvidence.rowData }]
          : firstReview
            ? [{
                fileName: "customer-reviews-oct-2026.csv",
                rowNumber: 2,
                data: {
                  feedback_id: firstReview.id,
                  customer_name: firstReview.customer,
                  date: firstReview.date,
                  sentiment: firstReview.sentiment,
                  review_text: firstReview.comment,
                },
              }]
            : [],
    }));
  const datasets: DashboardResponse["datasets"] = [
    { id: "demo-sales", category: "sales", fileName: "sales-oct-2026.csv", rows: mockRevenueTrend.length, uploadedAt: "2026-10-30T12:00:00.000Z" },
    { id: "demo-expenses", category: "expenses", fileName: "expenses-oct-2026.csv", rows: mockExpensesBreakdown.length, uploadedAt: "2026-10-30T12:00:00.000Z" },
    { id: "demo-inventory", category: "inventory", fileName: "inventory-oct-2026.csv", rows: mockInventory.length, uploadedAt: "2026-10-30T12:00:00.000Z" },
    { id: "demo-feedback", category: "feedback", fileName: "customer-reviews-oct-2026.csv", rows: mockFeedback.length, uploadedAt: "2026-10-30T12:00:00.000Z" },
  ];

  return {
    metrics: {
      revenue: REVENUE_YTD,
      expenses: totalExpenses,
      lowStockCount: itemsAtRisk,
      totalOrders: mockMetrics.totalOrders,
      inventoryValue,
    },
    monthlyRevenue: mockRevenueTrend.map((point, index) => ({
      month: `2026-${String(index + 1).padStart(2, "0")}`,
      revenue: point.revenue,
      expenses: point.expenses,
    })),
    inventoryLevels,
    expenseBreakdown: mockExpensesBreakdown.map(({ category, amount, budget }) => ({
      category,
      amount,
      budget,
    })),
    lowStockItems,
    customerReviewSummary: {
      count: mockFeedback.length,
      averageRating: 0,
      positive: mockFeedback.filter((review) => review.sentiment === "Positive").length,
      neutral: mockFeedback.filter((review) => review.sentiment === "Neutral").length,
      negative: mockFeedback.filter((review) => review.sentiment === "Negative").length,
    },
    alerts,
    datasets,
  };
}
