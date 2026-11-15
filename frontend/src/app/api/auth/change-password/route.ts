import { getAuthenticatedUser, getSessionToken, hashSessionToken } from "@/lib/server/auth";
import { hashPassword, verifyPassword } from "@/lib/server/password";
import { withUserTransaction } from "@/lib/server/db";
import { checkRateLimit, errorResponse, logApiError, readJsonObject, requireSameOrigin, serviceUnavailableResponse } from "@/lib/server/http";
import { passwordValidationMessage } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const csrfError = requireSameOrigin(request);
    if (csrfError) return csrfError;
    const user = await getAuthenticatedUser();
    if (!user) return errorResponse(401, "Sign in to change your password.");
    if (user.demo) return errorResponse(403, "The demo account is read-only.");
    const limited = await checkRateLimit(request, "change-password", user.id, 5, 900);
    if (limited) return limited;
    const body = await readJsonObject(request);
    const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
    const confirmPassword = typeof body?.confirmPassword === "string" ? body.confirmPassword : "";
    if (!currentPassword) return errorResponse(400, "Enter your current password.");
    const passwordError = passwordValidationMessage(newPassword);
    if (passwordError) return errorResponse(400, passwordError);
    if (newPassword !== confirmPassword) return errorResponse(400, "The new passwords do not match.");
    if (newPassword === currentPassword) return errorResponse(400, "Choose a different password.");

    const token = await getSessionToken();
    if (!token) return errorResponse(401, "Sign in to change your password.");
    const passwordHash = await hashPassword(newPassword);
    const changed = await withUserTransaction(user.id, async (client) => {
      const result = await client.query<{ password_hash: string }>(
        "SELECT password_hash FROM users WHERE id = $1",
        [user.id],
      );
      const existing = result.rows[0];
      if (!existing || !(await verifyPassword(currentPassword, existing.password_hash))) return false;
      await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, user.id]);
      await client.query(
        "DELETE FROM auth_sessions WHERE user_id = $1 AND token_hash <> $2",
        [user.id, hashSessionToken(token)],
      );
      return true;
    });
    if (!changed) return errorResponse(401, "Your current password is incorrect.");
    return Response.json({ passwordChanged: true });
  } catch (error) {
    logApiError("password-change", error);
    return serviceUnavailableResponse();
  }
}
