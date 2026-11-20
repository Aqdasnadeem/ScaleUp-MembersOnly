import { parseProductRanking, type ProductRankingResponse } from "./product-ranking";
import { parseAnomalies, type AnomaliesResponse } from "./anomalies";
import {
  parseExpenseCategories,
  parseExpenseEntries,
  type ExpenseCategoriesResponse,
  type ExpenseEntriesResponse,
} from "./expenses";
import {
  parseInventoryAlerts,
  parseInventoryHistory,
  parseInventoryProduct,
  parseInventoryProducts,
  type InventoryAlertsResponse,
  type InventoryHistoryResponse,
  type InventoryProduct,
} from "./inventory";

const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");
const TOKEN_KEY = "scaleup_token";
const ROLE_KEY = "scaleup_role";

export type AccountRole = "business_user" | "super_admin";

export type UploadType = "sales" | "inventory" | "expenses" | "feedback";
export type JobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "completed_with_warnings"
  | "failed"
  | "replaced";

const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  completed_with_warnings: "Completed with warnings",
  failed: "Failed",
  replaced: "Replaced",
};

/** Human-readable label for a job status; use this everywhere a status is shown instead of the raw value. */
export function formatJobStatus(status: JobStatus): string {
  return JOB_STATUS_LABELS[status] ?? status;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  business_id: string | number | null;
  business_name: string | null;
  role: AccountRole;
}

export interface MeResponse {
  business_id: string | number;
  business_name: string;
  currency: string;
  date_format: string;
  plan: "free" | "pro";
}

export interface PreviewResponse {
  columns: string[];
  suggested_mapping: Record<string, string | null> | null;
  saved_mapping: Record<string, string | null> | null;
  fields: unknown;
  required: unknown;
  needs_snapshot_date: boolean;
}

export interface UploadJob {
  job_id: string | number;
  upload_type: UploadType;
  file_name: string;
  status: JobStatus;
  total_rows: number | null;
  loaded_rows: number | null;
  skipped_rows: number | null;
  rejected_rows: number | null;
  returned_rows: number | null;
  message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface UploadErrorRow {
  row: number;
  column: string | null;
  reason: string;
}

export interface UploadJobDetail extends UploadJob {
  error_report: UploadErrorRow[];
}

export type SalesTrendInterval = "daily" | "monthly";

export interface SalesAnalyticsResponse {
  start_date: string;
  end_date: string;
  interval: SalesTrendInterval;
  metrics: {
    gross_revenue: number;
    orders: number;
    average_order_value: number;
  };
  trend: Array<{
    period: string;
    gross_revenue: number;
  }>;
}

export type CreateUploadResult =
  | { kind: "queued"; job_id: string | number; status: "pending" }
  | { kind: "skipped"; existing_job_id: string | number }
  | { kind: "duplicate"; existing_job_id: string | number };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    throw new ApiError("Unable to save your session in this browser.", 0);
  }
}

// Role is stored client-side only to decide where to redirect after login / which nav to bounce
// from (UX only). The server never trusts this value — every /admin route re-checks the role
// claim inside the JWT itself.
export function getRole(): AccountRole | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(ROLE_KEY);
    return value === "super_admin" || value === "business_user" ? value : null;
  } catch {
    return null;
  }
}

export function setRole(role: AccountRole): void {
  try {
    window.localStorage.setItem(ROLE_KEY, role);
  } catch {
    // Non-fatal: worst case the post-login redirect guesses /dashboard.
  }
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(ROLE_KEY);
  } catch (reason) {
    console.error("Unable to clear the saved session.", reason);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJobId(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

function detailMessage(body: unknown): string | null {
  if (!isRecord(body)) return null;
  const detail = body.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((item) => {
      if (typeof item === "string") return item;
      if (isRecord(item) && typeof item.msg === "string") {
        return item.msg.replace(/^Value error, /, "");
      }
      return "";
    }).filter(Boolean);
    if (messages.length) return messages.join(" ");
  }
  return null;
}

function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  clearToken();
  window.location.replace("/login");
}

async function request(
  path: string,
  init: RequestInit = {},
  authenticated = true,
  acceptedStatuses: number[] = [],
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = authenticated ? getToken() : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${API}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Cannot reach the FastAPI server. Check your connection and try again.", 0);
  }

  if (response.status === 401 && authenticated) redirectToLogin();
  if (!response.ok && !acceptedStatuses.includes(response.status)) {
    let body: unknown = null;
    try {
      body = await response.clone().json();
    } catch {
      body = null;
    }
    throw new ApiError(
      detailMessage(body) ?? `Request failed with status ${response.status}.`,
      response.status,
      isRecord(body) ? body.detail : undefined,
    );
  }
  return response;
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  authenticated = true,
): Promise<T> {
  const response = await request(path, init, authenticated);
  return response.json() as Promise<T>;
}

export function signup(
  business_name: string,
  email: string,
  password: string,
): Promise<AuthResponse> {
  return requestJson<AuthResponse>(
    "/auth/signup",
    { method: "POST", body: JSON.stringify({ business_name, email, password }) },
    false,
  );
}

export function login(email: string, password: string): Promise<AuthResponse> {
  return requestJson<AuthResponse>(
    "/auth/login",
    { method: "POST", body: JSON.stringify({ email, password }) },
    false,
  );
}

export function me(): Promise<MeResponse> {
  return requestJson<MeResponse>("/auth/me");
}

export function previewUpload(file: File, uploadType: UploadType): Promise<PreviewResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("upload_type", uploadType);
  return requestJson<PreviewResponse>("/uploads/preview", { method: "POST", body: form });
}

export async function createUpload(options: {
  file: File;
  uploadType: UploadType;
  mapping?: Record<string, string>;
  snapshotDate?: string;
  onDuplicate?: "skip";
}): Promise<CreateUploadResult> {
  const form = new FormData();
  form.append("file", options.file);
  form.append("upload_type", options.uploadType);
  if (options.mapping) form.append("mapping", JSON.stringify(options.mapping));
  if (options.snapshotDate) form.append("snapshot_date", options.snapshotDate);
  if (options.onDuplicate) form.append("on_duplicate", options.onDuplicate);

  const response = await request("/uploads", { method: "POST", body: form }, true, [409]);
  const body: unknown = await response.json();
  const result = isRecord(body) ? body : {};

  if (response.status === 200 && result.status === "skipped" && isJobId(result.existing_job_id)) {
    return { kind: "skipped", existing_job_id: result.existing_job_id };
  }
  if (
    response.status === 409
    && result.warning === "same_file_already_loaded"
    && isJobId(result.existing_job_id)
  ) {
    return { kind: "duplicate", existing_job_id: result.existing_job_id };
  }
  if (response.status === 202 && isJobId(result.job_id)) {
    return {
      kind: "queued",
      job_id: result.job_id,
      status: "pending",
    };
  }
  throw new ApiError("The server returned an unexpected upload response.", response.status);
}

export function listUploads(limit?: number): Promise<{ items: UploadJob[] }> {
  const query = limit === undefined ? "" : `?limit=${encodeURIComponent(String(limit))}`;
  return requestJson<{ items: UploadJob[] }>(`/uploads${query}`);
}

// P2-23-BE (Alishba): split KPIs and trend endpoints, mapped here to the one shape
// SalesAnalyticsDashboard already expects, so the component is untouched.
export async function getSalesAnalytics(options: {
  startDate: string;
  endDate: string;
  interval: SalesTrendInterval;
}): Promise<SalesAnalyticsResponse> {
  const granularity = options.interval === "daily" ? "day" : "month";
  const kpisQuery = new URLSearchParams({ from: options.startDate, to: options.endDate });
  const trendQuery = new URLSearchParams({ from: options.startDate, to: options.endDate, granularity });
  const [kpisResponse, trendResponse] = await Promise.all([
    request(`/analytics/sales/kpis?${kpisQuery.toString()}`),
    request(`/analytics/sales/trend?${trendQuery.toString()}`),
  ]);
  const kpis: unknown = await kpisResponse.json();
  const trendBody: unknown = await trendResponse.json();
  if (
    !isRecord(kpis) || !isRecord(kpis.range)
    || typeof kpis.gross_revenue !== "number" || typeof kpis.orders !== "number"
    || (kpis.avg_order_value !== null && typeof kpis.avg_order_value !== "number")
  ) {
    throw new Error("The server returned an unexpected sales KPIs response.");
  }
  if (!isRecord(trendBody) || !Array.isArray(trendBody.data)) {
    throw new Error("The server returned an unexpected sales trend response.");
  }
  const trend = trendBody.data.map((point: unknown) => {
    if (!isRecord(point) || typeof point.period !== "string" || typeof point.revenue !== "number") {
      throw new Error("The server returned an unexpected sales trend point.");
    }
    return { period: point.period, gross_revenue: point.revenue };
  });
  const range = kpis.range;
  return {
    start_date: typeof range.from === "string" ? range.from : options.startDate,
    end_date: typeof range.to === "string" ? range.to : options.endDate,
    interval: options.interval,
    metrics: {
      gross_revenue: kpis.gross_revenue,
      orders: kpis.orders,
      // avg_order_value is null when there are no orders in range; 0 keeps the metric a number.
      average_order_value: kpis.avg_order_value ?? 0,
    },
    trend,
  };
}

// P2-24-BE (Alishba): /analytics/products/ranking. Field names differ from the old
// /analytics/products shape; mapped here so ProductRankingTable and product-ranking.ts's
// parser keep using the same field names as before (plus the new products_without_cost).
export async function getProductRanking(options: {
  startDate: string;
  endDate: string;
}): Promise<ProductRankingResponse> {
  const query = new URLSearchParams({
    from: options.startDate,
    to: options.endDate,
    sort: "revenue",
    limit: "10",
  });
  const response = await request(`/analytics/products/ranking?${query.toString()}`);
  const payload: unknown = await response.json();
  if (
    !isRecord(payload) || !isRecord(payload.previous_range) || !Array.isArray(payload.data)
    || typeof payload.products_without_cost !== "number"
  ) {
    throw new Error("The server returned an unexpected product ranking response.");
  }
  const mapped = {
    start_date: payload.from,
    end_date: payload.to,
    previous_start_date: payload.previous_range.from,
    previous_end_date: payload.previous_range.to,
    products_without_cost: payload.products_without_cost,
    products: payload.data.map((item: unknown) => {
      if (!isRecord(item)) throw new Error("The server returned an unexpected product ranking item.");
      return {
        product_id: item.product_id,
        product_key: item.product_key,
        product_name: item.product_name,
        gross_revenue: item.revenue,
        previous_gross_revenue: item.previous_revenue,
        margin_percent: item.margin_pct ?? null,
      };
    }),
  };
  return parseProductRanking(mapped);
}

// P2-27/P2-28 (Aqdas): /expenses/categories replaces /analytics/expenses. Field names differ
// (total_amount/previous_month_total/percentage_change) and the response adds the P2-28 flag
// fields (unusual_increase, anomaly_status, anomaly_score, anomaly_explanation); mapped here so
// ExpensesAnalytics.tsx keeps using categories/total/previous_total/change_percent as before,
// plus the new flag fields.
export async function getExpenseCategories(month: string): Promise<ExpenseCategoriesResponse> {
  const query = new URLSearchParams({ month });
  const response = await request(`/expenses/categories?${query.toString()}`);
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new Error("The server returned an unexpected expense categories response.");
  }
  const mapped = {
    month: payload.month,
    previous_month: payload.previous_month,
    categories: payload.items.map((item: unknown) => {
      if (!isRecord(item)) throw new Error("The server returned an unexpected expense category item.");
      return {
        category: item.category,
        total: item.total_amount,
        previous_total: item.previous_month_total,
        change_percent: item.percentage_change,
        unusual_increase: item.unusual_increase,
        anomaly_status: item.anomaly_status,
        anomaly_score: item.anomaly_score,
        anomaly_explanation: item.anomaly_explanation,
      };
    }),
  };
  const result = parseExpenseCategories(mapped);
  if (result.month !== month) throw new Error("The server returned expenses for a different month.");
  return result;
}

const ANOMALY_METRIC_LABEL: Record<string, string> = {
  sales: "Daily sales revenue",
  expenses: "Expense change",
  inventory: "Stock change",
};

// P2-29 (Alishba): GET /anomalies has no documented from/to params (only `type`), so the
// date range is applied client-side against metric_date. Several fields the old shape had
// (metric, explanation, unit) are not in the new one and are synthesized below - see the
// mapping report for what is a real field vs. a guess.
//
// evidence shape only carries a point series for type "sales": {mean, std, z_score,
// series: [{date, revenue}, ...]} covering the 28 baseline days before metric_date (the
// anomaly day itself isn't in series, so it's appended below). "inventory" and "expense"
// evidence has no series (inventory: previous/current quantity pair; expense: category/month),
// so those fall back to the same two-point observed/expected comparison as before.
export async function getAnomalies(startDate: string, endDate: string): Promise<AnomaliesResponse> {
  const response = await request("/anomalies");
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.anomalies)) {
    throw new Error("The server returned an unexpected anomalies response.");
  }
  const anomalies = payload.anomalies
    .filter((item: unknown) =>
      isRecord(item) && typeof item.metric_date === "string"
      && item.metric_date >= startDate && item.metric_date <= endDate)
    .map((item: unknown) => {
      const record = item as Record<string, unknown>;
      // The backend's anomaly_type is singular ("expense"); the frontend's AnomalyType is plural
      // ("expenses"), matching the /anomalies?type= filter and the existing anomalies.ts contract.
      const rawType = typeof record.type === "string" ? record.type : "sales";
      const type = rawType === "expense" ? "expenses" : rawType;
      const date = record.metric_date;
      const observed = record.observed_value;
      const expected = record.expected_value;
      const rawEvidence = record.evidence;
      const series = isRecord(rawEvidence) && Array.isArray(rawEvidence.series) ? rawEvidence.series : null;
      // The no-series fallback used `date` for both points, so they shared one x-axis
      // tick/timestamp and Recharts warned about duplicate keys (sir, 20 Nov). The expected
      // point now plots one day earlier - values are unchanged, only its charted date moves.
      const dayBefore = (value: unknown) => {
        const d = new Date(`${String(value)}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - 1);
        return d.toISOString().slice(0, 10);
      };
      const evidence = series
        ? [
            ...series.map((point: unknown) => {
              if (!isRecord(point) || typeof point.date !== "string" || typeof point.revenue !== "number") {
                throw new Error("The server returned invalid anomaly evidence.");
              }
              return { date: point.date, value: point.revenue };
            }),
            { date, value: observed },
          ]
        : [{ date: dayBefore(date), value: expected }, { date, value: observed }];
      return {
        id: record.anomaly_id != null ? String(record.anomaly_id) : undefined,
        type,
        date,
        metric: ANOMALY_METRIC_LABEL[type] ?? "Anomaly",
        value: observed,
        baseline: expected,
        change_percent: record.size_pct,
        unit: type === "inventory" ? "units" : "currency",
        explanation: "Compared with the expected value computed by the anomaly detector.",
        evidence,
      };
    });
  return parseAnomalies({ start_date: startDate, end_date: endDate, anomalies });
}

export function runAnomalyDetection(): Promise<void> {
  return request("/anomalies/run", { method: "POST" }).then(() => undefined);
}

// category is now a path segment, and the entries key is "items" with "expense_date" instead
// of "date"; mapped here so ExpensesAnalytics.tsx keeps using entries/date as before.
export async function getExpenseEntries(month: string, category: string): Promise<ExpenseEntriesResponse> {
  const query = new URLSearchParams({ month });
  const response = await request(`/expenses/categories/${encodeURIComponent(category)}/entries?${query.toString()}`);
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new Error("The server returned an unexpected expense entries response.");
  }
  const mapped = {
    month: payload.month,
    category: payload.category,
    entries: payload.items.map((item: unknown) => {
      if (!isRecord(item)) throw new Error("The server returned an unexpected expense entry.");
      return { expense_id: item.expense_id, date: item.expense_date, amount: item.amount, description: item.description };
    }),
  };
  const result = parseExpenseEntries(mapped);
  if (result.month !== month) {
    throw new Error("The server returned entries for a different month or category.");
  }
  return result;
}

export async function getInventoryAlerts(): Promise<InventoryAlertsResponse> {
  const response = await request("/analytics/inventory/alerts");
  const payload: unknown = await response.json();
  return parseInventoryAlerts(payload);
}

export async function getInventoryProduct(productId: string): Promise<InventoryProduct> {
  const response = await request(`/analytics/inventory/products/${encodeURIComponent(productId)}`);
  const payload: unknown = await response.json();
  return parseInventoryProduct(payload);
}

export async function getInventoryProducts(): Promise<InventoryProduct[]> {
  const response = await request("/analytics/inventory/products");
  const payload: unknown = await response.json();
  return parseInventoryProducts(payload);
}

export async function getInventoryHistory(productId: string): Promise<InventoryHistoryResponse> {
  const response = await request(`/analytics/inventory/products/${encodeURIComponent(productId)}/history`);
  const payload: unknown = await response.json();
  const history = parseInventoryHistory(payload);
  if (String(history.product_id) !== productId) {
    throw new Error("The server returned inventory history for a different product.");
  }
  return history;
}

export function getUpload(jobId: string | number): Promise<UploadJobDetail> {
  return requestJson<UploadJobDetail>(`/uploads/${encodeURIComponent(String(jobId))}`);
}

// ---------------------------------------------------------------- billing --

export interface PlanLimits {
  uploads_per_month: number;
  max_rows_per_file: number;
  questions_per_day: number;
}

export interface BillingMe {
  plan: "free" | "pro";
  plan_expires_at: string | null;
  limits: PlanLimits;
  usage: { uploads_this_month: number };
}

export interface PlanLimitDetail {
  code: "PLAN_LIMIT";
  plan: "free" | "pro";
  limit: number;
  used: number;
}

/** Non-null only for a 402 from POST /uploads shaped like {"code":"PLAN_LIMIT",...} (see app/billing.py). */
export function planLimitDetail(error: unknown): PlanLimitDetail | null {
  if (!(error instanceof ApiError) || error.status !== 402) return null;
  const d = error.detail;
  if (
    isRecord(d) && d.code === "PLAN_LIMIT"
    && (d.plan === "free" || d.plan === "pro")
    && typeof d.limit === "number" && typeof d.used === "number"
  ) {
    return { code: "PLAN_LIMIT", plan: d.plan, limit: d.limit, used: d.used };
  }
  return null;
}

export function getBillingMe(): Promise<BillingMe> {
  return requestJson<BillingMe>("/billing/me");
}

export function checkout(): Promise<{ payment_id: number | string; plan: "free" | "pro"; plan_expires_at: string }> {
  return requestJson("/billing/checkout", { method: "POST" });
}

// ------------------------------------------------------------------ admin --
// Super admin ("eagle view") endpoints. Every call here hits /admin/*, which the backend rejects
// with 403 for anything but a super_admin token — the route guard in AppShell is UX only.

export interface AdminBusiness {
  business_id: string;
  business_name: string;
  status: "active" | "suspended";
  plan: "free" | "pro";                     // effective plan (accounts for expiry)
  stored_plan: "free" | "pro";              // the raw businesses.plan column
  plan_expires_at: string | null;
  created_at: string;
}

export interface AdminUser {
  user_id: string;
  business_id: string | null;
  email: string;
  role: AccountRole;
  is_active: boolean;
  created_at: string;
}

export interface AdminJob {
  job_id: string;
  business_id: string;
  upload_type: UploadType;
  status: JobStatus;
  error_message: string | null;
  total_rows: number;
  loaded_rows: number;
  rejected_rows: number;
  skipped_rows: number;
  created_at: string;
}

export interface AdminOverview {
  businesses_by_status: Record<string, number>;
  businesses_by_plan: Record<string, number>;
  users_count: number;
  jobs_last_7_days: Record<string, number>;
  failed_jobs: number;
  rows_loaded_per_business: Record<string, number>;
}

interface AdminPage<T> {
  total: number;
  limit: number;
  offset: number;
  items: T[];
}

export function adminOverview(): Promise<AdminOverview> {
  return requestJson<AdminOverview>("/admin/overview");
}

export function adminListBusinesses(options: { q?: string; limit?: number; offset?: number } = {}): Promise<AdminPage<AdminBusiness>> {
  const query = new URLSearchParams();
  if (options.q) query.set("q", options.q);
  query.set("limit", String(options.limit ?? 20));
  query.set("offset", String(options.offset ?? 0));
  return requestJson<AdminPage<AdminBusiness>>(`/admin/businesses?${query.toString()}`);
}

export function adminGetBusiness(businessId: string): Promise<AdminBusiness> {
  return requestJson<AdminBusiness>(`/admin/businesses/${encodeURIComponent(businessId)}`);
}

export function adminCreateBusiness(businessName: string): Promise<AdminBusiness> {
  return requestJson<AdminBusiness>("/admin/businesses", {
    method: "POST",
    body: JSON.stringify({ business_name: businessName }),
  });
}

export function adminUpdateBusiness(
  businessId: string,
  patch: { business_name?: string; status?: "active" | "suspended" },
): Promise<AdminBusiness> {
  return requestJson<AdminBusiness>(`/admin/businesses/${encodeURIComponent(businessId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function adminDeleteBusiness(businessId: string): Promise<AdminBusiness> {
  return requestJson<AdminBusiness>(`/admin/businesses/${encodeURIComponent(businessId)}`, { method: "DELETE" });
}

export function adminUpdatePlan(businessId: string, plan: "free" | "pro"): Promise<AdminBusiness> {
  return requestJson<AdminBusiness>(`/admin/businesses/${encodeURIComponent(businessId)}/plan`, {
    method: "PATCH",
    body: JSON.stringify({ plan }),
  });
}

export function adminListUsers(options: { businessId?: string; limit?: number; offset?: number } = {}): Promise<AdminPage<AdminUser>> {
  const query = new URLSearchParams();
  if (options.businessId) query.set("business_id", options.businessId);
  query.set("limit", String(options.limit ?? 20));
  query.set("offset", String(options.offset ?? 0));
  return requestJson<AdminPage<AdminUser>>(`/admin/users?${query.toString()}`);
}

export function adminCreateUser(body: { business_id: string; email: string; password: string }): Promise<AdminUser> {
  return requestJson<AdminUser>("/admin/users", { method: "POST", body: JSON.stringify(body) });
}

export function adminUpdateUser(
  userId: string,
  patch: { email?: string; is_active?: boolean; password?: string },
): Promise<AdminUser> {
  return requestJson<AdminUser>(`/admin/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function adminDeleteUser(userId: string): Promise<AdminUser> {
  return requestJson<AdminUser>(`/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
}

export function adminListJobs(limit = 50): Promise<{ items: AdminJob[] }> {
  return requestJson<{ items: AdminJob[] }>(`/admin/jobs?limit=${encodeURIComponent(String(limit))}`);
}

export async function downloadTemplate(type: UploadType): Promise<void> {
  const response = await request(`/uploads/template/${encodeURIComponent(type)}`);
  const objectUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `scaleup_${type}_template.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
