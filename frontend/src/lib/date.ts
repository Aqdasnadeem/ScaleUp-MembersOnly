export const DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];
export const DEFAULT_DATE_FORMAT: DateFormat = "DD/MM/YYYY";

function isDateFormat(value: string | undefined): value is DateFormat {
  return DATE_FORMATS.some((format) => format === value);
}

// Reads the YYYY-MM-DD part by text so a timezone can never shift the day.
export function formatDate(value: string | null | undefined, format?: string): string {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  const [, year, month, day] = match;
  const selected = isDateFormat(format) ? format : DEFAULT_DATE_FORMAT;
  if (selected === "MM/DD/YYYY") return `${month}/${day}/${year}`;
  if (selected === "YYYY-MM-DD") return `${year}-${month}-${day}`;
  return `${day}/${month}/${year}`;
}
