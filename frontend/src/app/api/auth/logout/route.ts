import { clearSessionCookie, deleteSession, getSessionToken } from "@/lib/server/auth";
import { logApiError, requireSameOrigin, serviceUnavailableResponse } from "@/lib/server/http";

export async function POST(request: Request) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  try {
    const token = await getSessionToken();
    if (token) await deleteSession(token);
    await clearSessionCookie();
    return Response.json({ signedOut: true });
  } catch (error) {
    logApiError("auth-logout", error);
    await clearSessionCookie();
    return serviceUnavailableResponse();
  }
}
