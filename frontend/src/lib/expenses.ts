export type ExpenseAnomalyStatus = "normal" | "flagged" | "insufficient_history" | "incomplete_data";

export interface ExpenseCategory {
  category: string;
  total: number;
  previous_total: number | null;
  change_percent: number | null;
  unusual_increase: boolean | null;
  anomaly_status: ExpenseAnomalyStatus;
  anomaly_score: number | null;
  anomaly_explanation: string | null;
}

export interface ExpenseCategoriesResponse {
  month: string;
  previous_month: string;
  categories: ExpenseCategory[];
}

export interface ExpenseEntry {
  expense_id: number;
  date: string;
  amount: number;
  description: string | null;
}

export interface ExpenseEntriesResponse {
  month: string;
  category: string;
  entries: ExpenseEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

const ANOMALY_STATUSES: ExpenseAnomalyStatus[] = ["normal", "flagged", "insufficient_history", "incomplete_data"];

export function parseExpenseCategories(value: unknown): ExpenseCategoriesResponse {
  if (!isRecord(value) || typeof value.month !== "string" || typeof value.previous_month !== "string" || !Array.isArray(value.categories)) {
    throw new Error("The server returned an invalid expense categories response.");
  }
  const categories = value.categories.map((item: unknown) => {
    if (
      !isRecord(item) || typeof item.category !== "string" || !item.category || !isAmount(item.total) ||
      !isNullableFiniteNumber(item.previous_total) || !isNullableFiniteNumber(item.change_percent) ||
      !(item.unusual_increase === null || typeof item.unusual_increase === "boolean") ||
      !(typeof item.anomaly_status === "string" && ANOMALY_STATUSES.includes(item.anomaly_status as ExpenseAnomalyStatus)) ||
      !isNullableFiniteNumber(item.anomaly_score) ||
      !(item.anomaly_explanation === null || typeof item.anomaly_explanation === "string")
    ) {
      throw new Error("The server returned an invalid expense categories response.");
    }
    return {
      category: item.category, total: item.total, previous_total: item.previous_total, change_percent: item.change_percent,
      unusual_increase: item.unusual_increase, anomaly_status: item.anomaly_status as ExpenseAnomalyStatus,
      anomaly_score: item.anomaly_score, anomaly_explanation: item.anomaly_explanation,
    };
  });
  return { month: value.month, previous_month: value.previous_month, categories };
}

export function parseExpenseEntries(value: unknown): ExpenseEntriesResponse {
  if (!isRecord(value) || typeof value.month !== "string" || typeof value.category !== "string" || !Array.isArray(value.entries)) {
    throw new Error("The server returned an invalid expense entries response.");
  }
  const entries = value.entries.map((entry: unknown) => {
    if (!isRecord(entry) || typeof entry.expense_id !== "number" || !Number.isSafeInteger(entry.expense_id) || entry.expense_id <= 0 ||
      typeof entry.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) ||
      !Number.isFinite(Date.parse(`${entry.date}T00:00:00Z`)) ||
      new Date(`${entry.date}T00:00:00Z`).toISOString().slice(0, 10) !== entry.date ||
      !isAmount(entry.amount) || !(entry.description === null || typeof entry.description === "string")) {
      throw new Error("The server returned an invalid expense entries response.");
    }
    return { expense_id: entry.expense_id, date: entry.date, amount: entry.amount, description: entry.description };
  });
  return { month: value.month, category: value.category, entries };
}
