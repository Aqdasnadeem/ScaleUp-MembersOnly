import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { withTransaction } from "@/lib/server/db";
import { checkRateLimit, logApiError, readJsonObject, requireSameOrigin, serviceUnavailableResponse } from "@/lib/server/http";
import { isValidEmail, normalizeEmail } from "@/lib/server/validation";

const GENERIC_RESPONSE = {
  message: "If an account exists for that email, a password reset link will be sent.",
};
const RESET_TOKEN_LIFETIME_MINUTES = 30;

async function sendResetEmail(email: string, resetUrl: string): Promise<void> {
  const provider = process.env.MAIL_PROVIDER ?? (process.env.NODE_ENV === "production" ? "resend" : "console");
  if (provider === "console") {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[password-reset] Email to ${email}: ${resetUrl}`);
      return;
    }
    throw new Error("Console email delivery is only available in development.");
  }
  if (provider !== "resend") throw new Error("MAIL_PROVIDER must be console or resend.");
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Resend email delivery is not configured.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Reset your ScaleUp password",
      text: `Use this single-use link within 30 minutes to reset your ScaleUp password:\n\n${resetUrl}`,
    }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`The email provider returned HTTP ${response.status}.`);
}

export async function POST(request: NextRequest) {
  const csrfError = requireSameOrigin(request);
  if (csrfError) return csrfError;
  try {
    const body = await readJsonObject(request);
    const email = normalizeEmail(typeof body?.email === "string" ? body.email : "");
    const limited = await checkRateLimit(request, "forgot-password", email, 5, 900);
    if (limited) return Response.json(GENERIC_RESPONSE);
    if (!isValidEmail(email)) return Response.json(GENERIC_RESPONSE);

    const resetToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(resetToken).digest("hex");
    const userId = await withTransaction(async (client) => {
      const result = await client.query<{ id: string; is_demo: boolean }>(
        "SELECT id, is_demo FROM users WHERE email = $1",
        [email],
      );
      const user = result.rows[0];
      if (!user || user.is_demo) return null;
      await client.query(
        `UPDATE password_reset_tokens
         SET used_at = now()
         WHERE user_id = $1 AND used_at IS NULL`,
        [user.id],
      );
      await client.query(
        `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at)
         VALUES ($1, $2, now() + ($3 * interval '1 minute'))`,
        [tokenHash, user.id, RESET_TOKEN_LIFETIME_MINUTES],
      );
      return user.id;
    });

    if (userId) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
      const resetUrl = new URL("/reset-password", siteUrl);
      resetUrl.searchParams.set("token", resetToken);
      try {
        await sendResetEmail(email, resetUrl.toString());
      } catch (error) {
        logApiError("password-reset-email", error);
      }
    }
    return Response.json(GENERIC_RESPONSE);
  } catch (error) {
    logApiError("password-reset-request", error);
    return serviceUnavailableResponse();
  }
}
