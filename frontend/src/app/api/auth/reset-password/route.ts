import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { hashPassword } from "@/lib/server/password";
import { withTransaction } from "@/lib/server/db";
import { checkRateLimit, errorResponse, logApiError, readJsonObject, requireSameOrigin, serviceUnavailableResponse } from "@/lib/server/http";
import { passwordValidationMessage } from "@/lib/server/validation";

export async function POST(request: NextRequest) {
  try {
    const csrfError = requireSameOrigin(request);
    if (csrfError) return csrfError;
    const limited = await checkRateLimit(request, "reset-password", "", 10, 900);
    if (limited) return limited;
    const body = await readJsonObject(request);
    const token = typeof body?.token === "string" ? body.token : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const confirmPassword = typeof body?.confirmPassword === "string" ? body.confirmPassword : "";
    if (!token || token.length > 200) return errorResponse(400, "This password reset link is invalid or has expired.");
    const passwordError = passwordValidationMessage(password);
    if (passwordError) return errorResponse(400, passwordError);
    if (password !== confirmPassword) return errorResponse(400, "The passwords do not match.");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const newPasswordHash = await hashPassword(password);
    const reset = await withTransaction(async (client) => {
      const result = await client.query<{ user_id: string }>(
        `SELECT user_id
         FROM password_reset_tokens
         WHERE token_hash = $1
           AND used_at IS NULL
           AND expires_at > now()
         FOR UPDATE`,
        [tokenHash],
      );
      const resetToken = result.rows[0];
      if (!resetToken) return false;
      await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
        newPasswordHash,
        resetToken.user_id,
      ]);
      await client.query(
        "UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL",
        [resetToken.user_id],
      );
      await client.query("DELETE FROM auth_sessions WHERE user_id = $1", [resetToken.user_id]);
      return true;
    });
    if (!reset) return errorResponse(400, "This password reset link is invalid or has expired.");
    return Response.json({ passwordReset: true });
  } catch (error) {
    logApiError("password-reset", error);
    return serviceUnavailableResponse();
  }
}
