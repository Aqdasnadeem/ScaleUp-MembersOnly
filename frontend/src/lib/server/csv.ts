import { parseBusinessDate, type DateFormat } from "./validation";

export const UPLOAD_CATEGORIES = [
  "sales",
  "inventory",
  "expenses",
  "feedback",
] as const;

export type UploadCategory = (typeof UPLOAD_CATEGORIES)[number];

export interface CsvErrorRow {
  rowNumber: number;
  messages: string[];
}

export interface CsvValidationResult {
  valid: boolean;
  missingColumns: string[];
  generalErrors: string[];
  rowErrors: CsvErrorRow[];
  rowsProcessed: number;
  rows: Array<{ rowNumber: number; data: Record<string, string> }>;
}

export type CsvColumnMapping = Record<string, string>;

interface CsvRecord {
  rowNumber: number;
  values: string[];
}

const REQUIRED_COLUMNS: Record<UploadCategory, readonly string[]> = {
  sales: [
    "order_id",
    "date",
    "customer_id",
    "product_id",
    "quantity",
    "unit_price",
    "total_amount",
  ],
  inventory: [
    "sku_id",
    "product_name",
    "category",
    "current_stock",
    "min_threshold",
    "unit_price",
  ],
  expenses: ["expense_id", "date", "category", "amount", "vendor", "description"],
  feedback: [
    "feedback_id",
    "date",
    "customer_name",
    "rating",
    "review_text",
    "product_id",
  ],
};

const NUMERIC_COLUMNS: Record<UploadCategory, readonly string[]> = {
  sales: ["quantity", "unit_price", "total_amount"],
  inventory: ["current_stock", "min_threshold", "unit_price"],
  expenses: ["amount", "budget"],
  feedback: ["rating"],
};

const INTEGER_COLUMNS = new Set(["current_stock", "min_threshold", "rating"]);

function parseCsv(text: string): {
  records: CsvRecord[];
  errors: string[];
} {
  const records: CsvRecord[] = [];
  const errors: string[] = [];
  let values: string[] = [];
  let value = "";
  let inQuotes = false;
  let line = 1;
  let recordStartLine = 1;

  const finishRecord = () => {
    values.push(value.trim());
    if (values.some((cell) => cell.length > 0)) {
      records.push({ rowNumber: recordStartLine, values });
    }
    values = [];
    value = "";
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inQuotes) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
      } else if (character === "\r" || character === "\n") {
        if (character === "\r" && text[index + 1] === "\n") index += 1;
        value += "\n";
        line += 1;
      } else {
        value += character;
      }
      continue;
    }

    if (character === '"') {
      if (value.trim()) errors.push(`Unexpected quote on line ${line}.`);
      inQuotes = true;
    } else if (character === ",") {
      values.push(value.trim());
      value = "";
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      finishRecord();
      line += 1;
      recordStartLine = line;
    } else {
      value += character;
    }
  }

  if (inQuotes) {
    errors.push(`Unclosed quoted field starting on line ${recordStartLine}.`);
  } else if (value.length > 0 || values.length > 0) {
    finishRecord();
  }

  return { records, errors };
}

export function validateCsv(
  input: string,
  category: UploadCategory,
  dateFormat: DateFormat = "DMY",
  columnMapping?: CsvColumnMapping,
): CsvValidationResult {
  const parsed = parseCsv(input.replace(/^\uFEFF/, ""));
  const result: CsvValidationResult = {
    valid: false,
    missingColumns: [],
    generalErrors: [...parsed.errors],
    rowErrors: [],
    rowsProcessed: Math.max(0, parsed.records.length - 1),
    rows: [],
  };
  const headerRecord = parsed.records[0];
  if (!headerRecord) {
    result.generalErrors.push("The CSV file is empty or has no header row.");
    return result;
  }

  const headers = headerRecord.values.map((header) => header.trim().toLowerCase());
  if (headers.some((header) => !header)) {
    result.generalErrors.push("Column names cannot be empty.");
  }
  if (new Set(headers).size !== headers.length) {
    result.generalErrors.push("Column names must be unique.");
  }
  const availableHeaders = new Map(
    headerRecord.values.map((header, index) => [header.trim().toLowerCase(), index]),
  );
  const targetColumns = [...REQUIRED_COLUMNS[category], ...(category === "expenses" ? ["budget"] : [])];
  const mapping = columnMapping
    ? new Map(Object.entries(columnMapping).map(([target, source]) => [target, source.trim().toLowerCase()]))
    : new Map(headers.map((header) => [header, header]));
  const unsupportedTargets = columnMapping
    ? [...mapping.keys()].filter((target) => !targetColumns.includes(target))
    : [];
  if (unsupportedTargets.length) result.generalErrors.push("The column mapping includes unsupported target fields.");
  const unmappedSources = [...mapping.values()].filter((source) => !availableHeaders.has(source));
  if (unmappedSources.length) result.generalErrors.push("The column mapping refers to a column that is not in this CSV.");
  const usedSources = [...mapping.values()];
  if (new Set(usedSources).size !== usedSources.length) {
    result.generalErrors.push("Each source column can only be mapped once.");
  }
  result.missingColumns = REQUIRED_COLUMNS[category].filter((column) => !mapping.has(column));
  if (result.missingColumns.length) {
    result.generalErrors.push(
      `Missing required columns: ${result.missingColumns.join(", ")}.`,
    );
  }
  if (result.generalErrors.length) return result;

  const numericColumns = NUMERIC_COLUMNS[category].filter((column) => mapping.has(column));
  for (const record of parsed.records.slice(1)) {
    const rowMessages: string[] = [];
    if (record.values.length !== headers.length) {
      rowMessages.push(
        `Expected ${headers.length} columns but found ${record.values.length}.`,
      );
    }

    const data: Record<string, string> = {};
    for (const [target, source] of mapping) {
      const index = availableHeaders.get(source);
      if (index === undefined) continue;
      data[target] = record.values[index] ?? "";
      if (
        REQUIRED_COLUMNS[category].includes(target)
        && !data[target].trim()
      ) {
        rowMessages.push(`${target} is required.`);
      }
    }

    if ("date" in data && data.date) {
      const isoDate = parseBusinessDate(data.date, dateFormat);
      if (!isoDate) {
        rowMessages.push(`date is not valid for the ${dateFormat} file format.`);
      } else {
        data.date = isoDate;
      }
    }

    for (const column of numericColumns) {
      const rawValue = data[column]?.trim() ?? "";
      if (!rawValue && category === "expenses" && column === "budget") continue;
      if (!/^\d+(?:\.\d+)?$/.test(rawValue)) {
        rowMessages.push(`${column} must be a non-negative number.`);
        continue;
      }
      const numericValue = Number(rawValue);
      if (!Number.isFinite(numericValue)) {
        rowMessages.push(`${column} must be a finite number.`);
      } else if (INTEGER_COLUMNS.has(column) && !Number.isInteger(numericValue)) {
        rowMessages.push(`${column} must be a whole number.`);
      } else if (category === "feedback" && column === "rating" && (numericValue < 1 || numericValue > 5)) {
        rowMessages.push("rating must be between 1 and 5.");
      }
    }

    if (rowMessages.length) {
      result.rowErrors.push({ rowNumber: record.rowNumber, messages: rowMessages });
    } else {
      result.rows.push({ rowNumber: record.rowNumber, data });
    }
  }

  if (!result.rows.length && !result.rowErrors.length) {
    result.generalErrors.push("No data rows were found.");
  }
  result.valid =
    result.missingColumns.length === 0
    && result.generalErrors.length === 0
    && result.rowErrors.length === 0
    && result.rows.length > 0;
  return result;
}
