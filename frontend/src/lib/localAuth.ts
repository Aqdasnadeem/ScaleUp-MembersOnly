import { SESSION_STORAGE_KEY } from "./demo-data";

export const PROFILE_UPDATED_EVENT = "scaleup:profile-updated";

export interface DemoSession {
  email: string;
  businessName?: string;
  demo?: boolean;
  verified?: boolean;
}

export function readDemoSession(): DemoSession | null {
  const stored = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!stored) return null;
  const parsed: unknown = JSON.parse(stored);
  if (
    typeof parsed !== "object"
    || parsed === null
    || !("email" in parsed)
    || typeof parsed.email !== "string"
  ) {
    throw new Error("Saved account display information has an invalid format.");
  }
  const businessName = "businessName" in parsed && typeof parsed.businessName === "string"
    ? parsed.businessName
    : undefined;
  const demo = "demo" in parsed && typeof parsed.demo === "boolean"
    ? parsed.demo
    : undefined;
  return { email: parsed.email, businessName, demo };
}

export function saveDemoSession(session: DemoSession): void {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
}

export function clearDemoSession(): void {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  window.localStorage.removeItem("scaleup-mock-session");
  window.localStorage.removeItem("scaleup-demo-account");
  window.localStorage.removeItem("scaleup-uploaded-datasets");
  window.localStorage.removeItem("scaleup-analysis-history");
  window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
}
