const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");
const TOKEN_KEY = "scaleup_token";

export type UploadType = "sales" | "inventory" | "expenses" | "feedback";
export type JobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "completed_with_warnings"
  | "failed"
  | "replaced";

export interface AuthResponse {
  access_token: string;
  token_type: string;
  business_id: string | number;
  business_name: string;
}

export interface MeResponse {
  business_id: string | number;
  business_name: string;
  currency: string;
  date_format: string;
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

export type CreateUploadResult =
  | { kind: "queued"; job_id: string | number; status: "pending" }
  | { kind: "skipped"; existing_job_id: string | number }
  | { kind: "duplicate"; existing_job_id: string | number };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
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

export function clearToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
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

export function getUpload(jobId: string | number): Promise<UploadJobDetail> {
  return requestJson<UploadJobDetail>(`/uploads/${encodeURIComponent(String(jobId))}`);
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
