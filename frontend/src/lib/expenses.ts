export interface ExpenseCategory {
  category: string;
  total: number;
  previous_total: number;
  change_percent: number | null;
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

export function parseExpenseCategories(value: unknown): ExpenseCategoriesResponse {
  if (!isRecord(value) || typeof value.month !== "string" || typeof value.previous_month !== "string" || !Array.isArray(value.categories)) {
    throw new Error("The server returned an invalid expense categories response.");
  }
  const categories = value.categories.map((item: unknown) => {
    if (!isRecord(item) || typeof item.category !== "string" || !item.category || !isAmount(item.total) || !isAmount(item.previous_total) ||
      !(item.change_percent === null || (typeof item.change_percent === "number" && Number.isFinite(item.change_percent)))) {
      throw new Error("The server returned an invalid expense categories response.");
    }
    return { category: item.category, total: item.total, previous_total: item.previous_total, change_percent: item.change_percent };
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
