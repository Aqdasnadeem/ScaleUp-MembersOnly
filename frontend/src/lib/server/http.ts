import { createHash } from "node:crypto";
import { getPool } from "./db";

export function getClientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function logApiError(operation: string, error: unknown): void {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "unclassified";
  console.error(`[${operation}] request failed (${code})`);
}

export function errorResponse(
  status: number,
  error: string,
  headers?: HeadersInit,
): Response {
  return Response.json({ error }, { status, headers });
}

export function requireSameOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin === new URL(request.url).origin) return null;
    } catch {
      return errorResponse(403, "This request could not be verified.");
    }
    return errorResponse(403, "This request could not be verified.");
  }
  return request.headers.get("sec-fetch-site") === "same-origin"
    ? null
    : errorResponse(403, "This request could not be verified.");
}

export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return null;
    }
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function checkRateLimit(
  request: Request,
  operation: string,
  identity: string,
  limit: number,
  windowSeconds: number,
): Promise<Response | null> {
  const windowMilliseconds = windowSeconds * 1_000;
  const windowId = Math.floor(Date.now() / windowMilliseconds);
  const identityHash = createHash("sha256")
    .update(`${getClientAddress(request)}:${identity}`)
    .digest("hex");
  const bucketKey = `${operation}:${windowId}:${identityHash}`;
  const result = await getPool().query<{ request_count: number }>(
    `INSERT INTO rate_limits (bucket_key, request_count, expires_at)
     VALUES ($1, 1, now() + ($2 * interval '1 second'))
     ON CONFLICT (bucket_key)
     DO UPDATE SET request_count = rate_limits.request_count + 1
     RETURNING request_count`,
    [bucketKey, windowSeconds],
  );
  const requestCount = Number(result.rows[0]?.request_count ?? 0);

  if (windowId % 16 === 0) {
    await getPool().query("DELETE FROM rate_limits WHERE expires_at < now()");
  }
  if (requestCount <= limit) return null;

  return errorResponse(
    429,
    "Too many requests. Wait a moment and try again.",
    { "Retry-After": String(windowSeconds) },
  );
}

export function serviceUnavailableResponse(): Response {
  return errorResponse(
    503,
    "The service is not configured or is temporarily unavailable. Check the server setup and try again.",
  );
}
