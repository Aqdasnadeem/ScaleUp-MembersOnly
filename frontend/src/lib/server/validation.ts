export type DateFormat = "DMY" | "MDY";

export interface PasswordRuleResults {
  length: boolean;
  letter: boolean;
  number: boolean;
  byteLength: number;
  valid: boolean;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateBusinessName(value: string): string | null {
  const name = value.trim();
  if (name.length < 2 || name.length > 80) {
    return "Business name must be between 2 and 80 characters.";
  }
  return null;
}

export function checkPasswordRules(password: string): PasswordRuleResults {
  const byteLength = new TextEncoder().encode(password).byteLength;
  const length = password.length >= 8 && byteLength <= 72;
  const letter = /\p{L}/u.test(password);
  const number = /\p{N}/u.test(password);
  return {
    length,
    letter,
    number,
    byteLength,
    valid: length && letter && number,
  };
}

export function passwordValidationMessage(password: string): string | null {
  const rules = checkPasswordRules(password);
  if (rules.byteLength > 72) return "Password must be no more than 72 bytes.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!rules.letter) return "Password must contain at least one letter.";
  if (!rules.number) return "Password must contain at least one number.";
  return null;
}

function isCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function parseBusinessDate(
  value: string,
  format: DateFormat,
): string | null {
  const input = value.trim();
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(input);
  if (isoMatch) {
    const [, yearText, monthText, dayText] = isoMatch;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    if (!isCalendarDate(year, month, day)) return null;
    return `${yearText}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const parts = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(input);
  if (!parts) return null;
  const first = Number(parts[1]);
  const second = Number(parts[2]);
  const yearText = parts[3];
  const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
  const day = format === "DMY" ? first : second;
  const month = format === "DMY" ? second : first;
  if (!isCalendarDate(year, month, day)) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatDatePreview(value: string, format: DateFormat): string {
  const isoDate = parseBusinessDate(value, format);
  if (!isoDate) throw new Error("The preview date could not be parsed.");
  const [yearText, monthText, dayText] = isoDate.split("-");
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)));
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function validateProfileChanges(input: {
  businessName: string;
  dateFormat: string;
}): { businessName: string; dateFormat: DateFormat } | { error: string; field: string } {
  const businessName = input.businessName.trim();
  const nameError = validateBusinessName(businessName);
  if (nameError) return { error: nameError, field: "businessName" };
  if (input.dateFormat !== "DMY" && input.dateFormat !== "MDY") {
    return { error: "Choose a supported date format.", field: "dateFormat" };
  }
  return { businessName, dateFormat: input.dateFormat };
}
