import type { UploadCategory } from "./csv";

export type AssistantQuestionType =
  | "profit_change"
  | "reorder_items"
  | "customer_reviews"
  | "sales_forecast"
  | "unsupported";

export interface BusinessRecord {
  category: UploadCategory;
  fileName: string;
  rowNumber: number;
  data: Record<string, string>;
}

export interface AssistantEvidence {
  source: string;
  fileName: string;
  rowNumber: number;
  rowData: Record<string, string>;
}

export interface ComputedAnswer {
  type: AssistantQuestionType;
  answer: string;
  toolsUsed: string[];
  evidence: AssistantEvidence[];
  aggregates: Record<string, unknown>;
}

const CATEGORY_LABELS: Record<UploadCategory, string> = {
  sales: "Sales",
  inventory: "Stock",
  expenses: "Expenses",
  feedback: "Reviews",
};

function amount(record: BusinessRecord, field: string): number {
  const parsed = Number(record.data[field]);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatRs(value: number): string {
  return `Rs ${new Intl.NumberFormat("en-PK", {
    maximumFractionDigits: 2,
  }).format(value)}`;
}

function monthOf(record: BusinessRecord): string | null {
  const date = record.data.date;
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 7) : null;
}

function evidenceFor(records: BusinessRecord[]): AssistantEvidence[] {
  return records.map((record) => ({
    source: CATEGORY_LABELS[record.category],
    fileName: record.fileName,
    rowNumber: record.rowNumber,
    rowData: { ...record.data },
  }));
}

export function classifyQuestion(question: string): AssistantQuestionType {
  const normalized = question.toLowerCase();
  if (/\b(forecast|predict|prediction|next month|future sales)\b/.test(normalized)) {
    return "sales_forecast";
  }
  if (/\bcustomers?\b|\breviews?\b|\bfeedback\b|\bwhat\b.*\b(say|saying)\b/.test(normalized)) {
    return "customer_reviews";
  }
  if (/\b(profit|margin|earnings)\b/.test(normalized)) {
    return "profit_change";
  }
  if (/\b(reorder|reordering|restock|stock|inventory|out of stock|low stock)\b/.test(normalized)) {
    return "reorder_items";
  }
  return "unsupported";
}

function unavailableAnswer(
  type: AssistantQuestionType,
  message: string,
  categories: UploadCategory[],
): ComputedAnswer {
  return {
    type,
    answer: message,
    toolsUsed: categories.length
      ? categories.map((category) => CATEGORY_LABELS[category])
      : ["No matching records"],
    evidence: [],
    aggregates: { availableRecordTypes: categories },
  };
}

function computeProfitChange(records: BusinessRecord[]): ComputedAnswer {
  const sales = records.filter((record) => record.category === "sales");
  const expenses = records.filter((record) => record.category === "expenses");
  const inventory = records.filter((record) => record.category === "inventory");
  if (!sales.length || !expenses.length) {
    const available = [
      ...(sales.length ? (["sales"] as const) : []),
      ...(expenses.length ? (["expenses"] as const) : []),
    ];
    return unavailableAnswer(
      "profit_change",
      "Upload sales and expenses CSV files to calculate the change in profit.",
      [...available],
    );
  }

  const months = [...new Set([...sales, ...expenses].map(monthOf).filter(
    (month): month is string => month !== null,
  ))].sort();
  if (months.length < 2) {
    return unavailableAnswer(
      "profit_change",
      "At least two months of sales and expense records are needed to compare profit.",
      ["sales", "expenses"],
    );
  }

  const currentMonth = months.at(-1)!;
  const previousMonth = months.at(-2)!;
  const monthRecords = [...sales, ...expenses].filter((record) => {
    const month = monthOf(record);
    return month === currentMonth || month === previousMonth;
  });
  const salesInMonth = (month: string) =>
    sales
      .filter((record) => monthOf(record) === month)
      .reduce((total, record) => total + amount(record, "total_amount"), 0);
  const expensesInMonth = (month: string) =>
    expenses
      .filter((record) => monthOf(record) === month)
      .reduce((total, record) => total + amount(record, "amount"), 0);
  const previousRevenue = salesInMonth(previousMonth);
  const currentRevenue = salesInMonth(currentMonth);
  const previousExpenses = expensesInMonth(previousMonth);
  const currentExpenses = expensesInMonth(currentMonth);
  const previousProfit = previousRevenue - previousExpenses;
  const currentProfit = currentRevenue - currentExpenses;
  const courierRecords = expenses.filter((record) => {
    const category = record.data.category?.toLowerCase() ?? "";
    return /courier|logistic|shipping|delivery/.test(category)
      && (monthOf(record) === currentMonth || monthOf(record) === previousMonth);
  });
  const courierSpend = (month: string) =>
    courierRecords
      .filter((record) => monthOf(record) === month)
      .reduce((total, record) => total + amount(record, "amount"), 0);
  const previousCourierSpend = courierSpend(previousMonth);
  const currentCourierSpend = courierSpend(currentMonth);
  const courierChangePercent = previousCourierSpend > 0
    ? Number((((currentCourierSpend - previousCourierSpend) / previousCourierSpend) * 100).toFixed(1))
    : null;
  const stockoutRecords = inventory.filter(
    (record) => amount(record, "current_stock") <= amount(record, "min_threshold"),
  );
  const usedRecords = [
    ...monthRecords,
    ...inventory,
  ];
  const profitDifference = currentProfit - previousProfit;
  let answer = `Profit changed from ${formatRs(previousProfit)} in ${previousMonth} to ${formatRs(currentProfit)} in ${currentMonth}.`;
  if (profitDifference < 0) answer = `Profit fell by ${formatRs(Math.abs(profitDifference))} from ${previousMonth} to ${currentMonth}.`;
  else if (profitDifference > 0) answer = `Profit increased by ${formatRs(profitDifference)} from ${previousMonth} to ${currentMonth}.`;

  if (currentCourierSpend > 0 && courierChangePercent !== null) {
    answer += ` Courier costs ${courierChangePercent >= 0 ? "rose" : "fell"} ${Math.abs(courierChangePercent).toFixed(0)}% compared with the previous month.`;
  }
  if (stockoutRecords.length) {
    answer += ` ${stockoutRecords.map((record) => record.data.product_name).filter(Boolean).join(", ")} ${stockoutRecords.length === 1 ? "is" : "are"} at or below reorder level.`;
  }

  const budgetsByCategory = new Map<string, number>();
  for (const record of expenses.filter((row) => monthOf(row) === currentMonth && row.data.budget)) {
    const category = record.data.category ?? "";
    budgetsByCategory.set(
      category,
      Math.max(budgetsByCategory.get(category) ?? 0, amount(record, "budget")),
    );
  }
  const productRevenue = new Map<string, number>();
  for (const record of sales.filter((row) => {
    const month = monthOf(row);
    return month === currentMonth || month === previousMonth;
  })) {
    const key = `${record.data.product_id ?? ""}:${monthOf(record)}`;
    productRevenue.set(key, (productRevenue.get(key) ?? 0) + amount(record, "total_amount"));
  }

  return {
    type: "profit_change",
    answer,
    toolsUsed: ["Sales", "Expenses", ...(inventory.length ? ["Stock"] : [])],
    evidence: evidenceFor(usedRecords),
    aggregates: {
      previousMonth,
      currentMonth,
      previousRevenue,
      currentRevenue,
      previousExpenses,
      currentExpenses,
      previousProfit,
      currentProfit,
      profitDifference,
      previousCourierSpend,
      currentCourierSpend,
      courierChangePercent,
      currentExpenseBudgets: Object.fromEntries(budgetsByCategory),
      stockAtOrBelowReorderThreshold: stockoutRecords.map((record) => ({
        product: record.data.product_name,
        currentStock: amount(record, "current_stock"),
        reorderThreshold: amount(record, "min_threshold"),
      })),
      recordsChecked: {
        sales: monthRecords.filter((row) => row.category === "sales").length,
        expenses: monthRecords.filter((row) => row.category === "expenses").length,
        inventory: inventory.length,
      },
      stockItemRevenueChange: stockoutRecords.map((record) => ({
        product: record.data.product_name,
        previousMonthRevenue: productRevenue.get(`${record.data.sku_id ?? ""}:${previousMonth}`) ?? 0,
        currentMonthRevenue: productRevenue.get(`${record.data.sku_id ?? ""}:${currentMonth}`) ?? 0,
      })),
    },
  };
}

function computeReorderItems(records: BusinessRecord[]): ComputedAnswer {
  const inventory = records.filter((record) => record.category === "inventory");
  if (!inventory.length) {
    return unavailableAnswer(
      "reorder_items",
      "Upload an inventory CSV file to check which items need reordering.",
      [],
    );
  }
  const lowStock = inventory.filter(
    (record) => amount(record, "current_stock") <= amount(record, "min_threshold"),
  );
  const answer = lowStock.length
    ? `${lowStock.length} item${lowStock.length === 1 ? "" : "s"} ${lowStock.length === 1 ? "needs" : "need"} reordering: ${lowStock.map((record) => record.data.product_name).join(", ")}.`
    : "No inventory items are at or below their reorder threshold.";

  return {
    type: "reorder_items",
    answer,
    toolsUsed: ["Stock"],
    evidence: evidenceFor(inventory),
    aggregates: {
      itemsToReorder: lowStock.map((record) => ({
        product: record.data.product_name,
        currentStock: amount(record, "current_stock"),
        reorderThreshold: amount(record, "min_threshold"),
      })),
      recordsChecked: inventory.length,
    },
  };
}

function reviewTheme(text: string): string {
  const normalized = text.toLowerCase();
  if (/courier|shipping|delivery|late|arriv/.test(normalized)) return "delivery";
  if (/stock|available|out of stock|reorder/.test(normalized)) return "availability";
  if (/price|cost|expensive|cheap|value/.test(normalized)) return "price";
  if (/quality|durable|broken|comfortable|excellent|poor/.test(normalized)) return "product quality";
  return "other";
}

function computeCustomerReviews(records: BusinessRecord[]): ComputedAnswer {
  const reviews = records.filter((record) => record.category === "feedback");
  if (!reviews.length) {
    return unavailableAnswer(
      "customer_reviews",
      "Upload a customer reviews CSV file to summarize what customers are saying.",
      [],
    );
  }

  const themeCounts: Record<string, number> = {};
  const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
  let ratingTotal = 0;
  for (const review of reviews) {
    const rating = amount(review, "rating");
    ratingTotal += rating;
    if (rating >= 4) sentimentCounts.positive += 1;
    else if (rating === 3) sentimentCounts.neutral += 1;
    else sentimentCounts.negative += 1;
    const theme = reviewTheme(review.data.review_text ?? "");
    themeCounts[theme] = (themeCounts[theme] ?? 0) + 1;
  }
  const averageRating = ratingTotal / reviews.length;
  const rankedThemes = Object.entries(themeCounts).sort((left, right) => right[1] - left[1]);
  const themeSummary = rankedThemes
    .slice(0, 2)
    .map(([theme, count]) => `${theme} (${count})`)
    .join(" and ");

  return {
    type: "customer_reviews",
    answer: `${reviews.length} customer review${reviews.length === 1 ? "" : "s"} average ${averageRating.toFixed(1)} out of 5. The most common themes are ${themeSummary || "not yet clear"}.`,
    toolsUsed: ["Reviews"],
    evidence: evidenceFor(reviews),
    aggregates: {
      reviewCount: reviews.length,
      averageRating,
      sentimentCounts,
      themes: themeCounts,
      recordsChecked: reviews.length,
    },
  };
}

function computeSalesForecast(records: BusinessRecord[]): ComputedAnswer {
  const sales = records.filter((record) => record.category === "sales");
  if (!sales.length) {
    return unavailableAnswer(
      "sales_forecast",
      "Upload a sales CSV file to calculate a sales forecast.",
      [],
    );
  }

  const revenueByMonth = new Map<string, number>();
  for (const record of sales) {
    const month = monthOf(record);
    if (month) {
      revenueByMonth.set(
        month,
        (revenueByMonth.get(month) ?? 0) + amount(record, "total_amount"),
      );
    }
  }
  const recentMonths = [...revenueByMonth.keys()].sort().slice(-3);
  if (recentMonths.length < 2) {
    return unavailableAnswer(
      "sales_forecast",
      "At least two months of sales records are needed to forecast revenue.",
      ["sales"],
    );
  }
  const forecast = recentMonths.reduce(
    (total, month) => total + (revenueByMonth.get(month) ?? 0),
    0,
  ) / recentMonths.length;
  const lastMonth = recentMonths.at(-1)!;
  const nextMonthDate = new Date(`${lastMonth}-01T00:00:00.000Z`);
  nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth() + 1);
  const nextMonth = nextMonthDate.toISOString().slice(0, 7);
  const usedRecords = sales.filter((record) => {
    const month = monthOf(record);
    return month !== null && recentMonths.includes(month);
  });

  return {
    type: "sales_forecast",
    answer: `The ${recentMonths.length}-month moving average forecasts about ${formatRs(forecast)} in sales for ${nextMonth}.`,
    toolsUsed: ["Sales"],
    evidence: evidenceFor(usedRecords),
    aggregates: {
      method: "moving_average",
      recentMonthlyRevenue: recentMonths.map((month) => ({
        month,
        revenue: revenueByMonth.get(month) ?? 0,
      })),
      forecastMonth: nextMonth,
      forecastRevenue: forecast,
      recordsChecked: usedRecords.length,
    },
  };
}

export function computeAssistantAnswer(
  question: string,
  records: BusinessRecord[],
): ComputedAnswer {
  const type = classifyQuestion(question);
  switch (type) {
    case "profit_change":
      return computeProfitChange(records);
    case "reorder_items":
      return computeReorderItems(records);
    case "customer_reviews":
      return computeCustomerReviews(records);
    case "sales_forecast":
      return computeSalesForecast(records);
    case "unsupported":
      return {
        type,
        answer:
          "Only four question types are supported right now: profit changes, items that need reordering, what customers say, and the sales forecast.",
        toolsUsed: [],
        evidence: [],
        aggregates: {},
      };
  }
}

export function safeFiguresForGemini(answer: ComputedAnswer): Record<string, unknown> {
  return {
    questionType: answer.type,
    ...answer.aggregates,
  };
}
