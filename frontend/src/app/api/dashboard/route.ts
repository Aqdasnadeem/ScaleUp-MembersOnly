import { getAuthenticatedUser } from "@/lib/server/auth";
import { getUserRecords } from "@/lib/server/data";
import { withUserTransaction } from "@/lib/server/db";
import { errorResponse, logApiError, serviceUnavailableResponse } from "@/lib/server/http";

function numberField(row: Record<string, string>, field: string): number {
  const value = Number(row[field]);
  return Number.isFinite(value) ? value : 0;
}

function monthOf(row: Record<string, string>): string | null {
  const date = row.date;
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 7) : null;
}

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return errorResponse(401, "Sign in to view your dashboard.");

    const dashboard = await withUserTransaction(user.id, async (client) => {
      const records = await getUserRecords(client, user.id);
      const sales = records.filter((record) => record.category === "sales");
      const expenses = records.filter((record) => record.category === "expenses");
      const inventory = records.filter((record) => record.category === "inventory");
      const reviews = records.filter((record) => record.category === "feedback");

      const monthly = new Map<string, { revenue: number; expenses: number }>();
      for (const record of sales) {
        const month = monthOf(record.data);
        if (!month) continue;
        const totals = monthly.get(month) ?? { revenue: 0, expenses: 0 };
        totals.revenue += numberField(record.data, "total_amount");
        monthly.set(month, totals);
      }
      for (const record of expenses) {
        const month = monthOf(record.data);
        if (!month) continue;
        const totals = monthly.get(month) ?? { revenue: 0, expenses: 0 };
        totals.expenses += numberField(record.data, "amount");
        monthly.set(month, totals);
      }

      const lowStockItems = inventory
        .filter((record) => numberField(record.data, "current_stock") <= numberField(record.data, "min_threshold"))
        .map((record) => ({
          sku: record.data.sku_id,
          productName: record.data.product_name,
          category: record.data.category,
          currentStock: numberField(record.data, "current_stock"),
          reorderThreshold: numberField(record.data, "min_threshold"),
          fileName: record.fileName,
          rowNumber: record.rowNumber,
          rowData: record.data,
        }));

      const inventoryLevels = inventory.map((record) => ({
        sku: record.data.sku_id,
        productName: record.data.product_name,
        currentStock: numberField(record.data, "current_stock"),
        reorderThreshold: numberField(record.data, "min_threshold"),
      }));

      const expenseBudgets = new Map<string, {
        actual: number;
        budget: number;
        records: typeof expenses;
      }>();
      const expenseCategories = new Map<string, { amount: number; budget: number }>();
      for (const record of expenses) {
        const month = monthOf(record.data) ?? "undated";
        const category = record.data.category || "Uncategorized";
        const key = `${month}:${category}`;
        const totals = expenseBudgets.get(key) ?? { actual: 0, budget: 0, records: [] };
        totals.actual += numberField(record.data, "amount");
        totals.budget = Math.max(totals.budget, numberField(record.data, "budget"));
        totals.records.push(record);
        expenseBudgets.set(key, totals);

        const categoryTotals = expenseCategories.get(category) ?? { amount: 0, budget: 0 };
        categoryTotals.amount += numberField(record.data, "amount");
        categoryTotals.budget += numberField(record.data, "budget");
        expenseCategories.set(category, categoryTotals);
      }
      const expenseAlerts = [...expenseBudgets.entries()]
        .filter(([, totals]) => totals.budget > 0 && totals.actual > totals.budget)
        .map(([key, totals]) => {
          const [month, category] = key.split(":");
          return {
            id: `expense-${encodeURIComponent(key)}`,
            type: "expense_over_budget",
            category: "expenses",
            title: `${category} is over budget`,
            detail: `${month}: Rs ${totals.actual.toLocaleString("en-PK")} spent against Rs ${totals.budget.toLocaleString("en-PK")}.`,
            evidence: totals.records.map((record) => ({
              fileName: record.fileName,
              rowNumber: record.rowNumber,
              data: record.data,
            })),
          };
        });

      const ratingCounts = { positive: 0, neutral: 0, negative: 0 };
      let ratingTotal = 0;
      for (const record of reviews) {
        const rating = numberField(record.data, "rating");
        ratingTotal += rating;
        if (rating >= 4) ratingCounts.positive += 1;
        else if (rating === 3) ratingCounts.neutral += 1;
        else if (rating > 0) ratingCounts.negative += 1;
      }

      const orderIds = new Set(sales.map((record) => record.data.order_id).filter(Boolean));
      const monthSeries = [...monthly.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .slice(-6)
        .map(([month, values]) => ({ month, ...values }));
      const datasets = await client.query<{
        id: string;
        category: string;
        file_name: string;
        row_count: number;
        uploaded_at: Date;
      }>(
        `SELECT id, category, file_name, row_count, uploaded_at
         FROM datasets
         WHERE user_id = $1
         ORDER BY uploaded_at DESC`,
        [user.id],
      );

      return {
        metrics: {
          revenue: sales.reduce((total, record) => total + numberField(record.data, "total_amount"), 0),
          expenses: expenses.reduce((total, record) => total + numberField(record.data, "amount"), 0),
          lowStockCount: lowStockItems.length,
          totalOrders: orderIds.size,
          inventoryValue: inventory.reduce(
            (total, record) => total
              + numberField(record.data, "current_stock") * numberField(record.data, "unit_price"),
            0,
          ),
        },
        monthlyRevenue: monthSeries,
        inventoryLevels,
        expenseBreakdown: [...expenseCategories.entries()].map(([category, totals]) => ({
          category,
          amount: totals.amount,
          budget: totals.budget,
        })),
        lowStockItems,
        customerReviewSummary: {
          count: reviews.length,
          averageRating: reviews.length ? ratingTotal / reviews.length : 0,
          ...ratingCounts,
        },
        alerts: [
          ...lowStockItems.map((item) => ({
            id: `stock-${encodeURIComponent(item.sku)}`,
            type: "low_stock",
            category: "inventory",
            title: `${item.productName} needs reordering`,
            detail: `${item.currentStock} units in stock; reorder at ${item.reorderThreshold}.`,
            evidence: [{
              fileName: item.fileName,
              rowNumber: item.rowNumber,
              data: item.rowData,
            }],
          })),
          ...expenseAlerts,
        ],
        datasets: datasets.rows.map((dataset) => ({
          id: dataset.id,
          category: dataset.category,
          fileName: dataset.file_name,
          rows: Number(dataset.row_count),
          uploadedAt: dataset.uploaded_at.toISOString(),
        })),
      };
    });

    return Response.json(dashboard);
  } catch (error) {
    logApiError("dashboard", error);
    return serviceUnavailableResponse();
  }
}
