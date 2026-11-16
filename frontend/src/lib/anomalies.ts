export type AnomalyType = "sales" | "expenses" | "inventory";

export interface Anomaly {
  id: string;
  type: AnomalyType;
  date: string;
  metric: string;
  value: number;
  baseline: number;
  change_percent: number;
  unit: "currency" | "units";
  explanation: string;
  evidence: Array<{ date: string; value: number }>;
}

export interface AnomaliesResponse {
  start_date: string;
  end_date: string;
  anomalies: Anomaly[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseAnomalies(value: unknown): AnomaliesResponse {
  if (!isRecord(value) || !isDate(value.start_date) || !isDate(value.end_date) || !Array.isArray(value.anomalies)) {
    throw new Error("The server returned an invalid anomalies response.");
  }
  const anomalies = value.anomalies.map((item: unknown): Anomaly => {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id ||
      (item.type !== "sales" && item.type !== "expenses" && item.type !== "inventory") ||
      !isDate(item.date) || typeof item.metric !== "string" || !item.metric ||
      !isNumber(item.value) || item.value < 0 || !isNumber(item.baseline) || item.baseline <= 0 ||
      !isNumber(item.change_percent) || (item.unit !== "currency" && item.unit !== "units") ||
      typeof item.explanation !== "string" || !item.explanation || !Array.isArray(item.evidence) || item.evidence.length < 2) {
      throw new Error("The server returned an invalid anomalies response.");
    }
    const evidence = item.evidence.map((point: unknown) => {
      if (!isRecord(point) || !isDate(point.date) || !isNumber(point.value) || point.value < 0) {
        throw new Error("The server returned invalid anomaly evidence.");
      }
      return { date: point.date, value: point.value };
    });
    return {
      id: item.id, type: item.type, date: item.date, metric: item.metric,
      value: item.value, baseline: item.baseline, change_percent: item.change_percent,
      unit: item.unit, explanation: item.explanation, evidence,
    };
  });
  return { start_date: value.start_date, end_date: value.end_date, anomalies };
}
