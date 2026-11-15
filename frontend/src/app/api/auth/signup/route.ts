import type { NextRequest } from "next/server";
import { createSessionToken, hashPassword, setSessionCookie } from "@/lib/server/auth";
import { checkRateLimit, errorResponse, logApiError, readJsonObject, requireSameOrigin, serviceUnavailableResponse } from "@/lib/server/http";
import { withTransaction } from "@/lib/server/db";
import {
  isValidEmail,
  normalizeEmail,
  passwordValidationMessage,
  validateBusinessName,
} from "@/lib/server/validation";

export async function POST(request: NextRequest) {
  try {
    const csrfError = requireSameOrigin(request);
    if (csrfError) return csrfError;

    const body = await readJsonObject(request);
    const email = normalizeEmail(typeof body?.email === "string" ? body.email : "");
    const password = typeof body?.password === "string" ? body.password : "";
    const businessName = typeof body?.businessName === "string" ? body.businessName.trim() : "";
    const limited = await checkRateLimit(request, "signup", email, 8, 900);
    if (limited) return limited;

    if (!isValidEmail(email)) {
      return errorResponse(400, "Enter a valid email address.");
    }
    const passwordError = passwordValidationMessage(password);
    if (passwordError) return errorResponse(400, passwordError);
    const businessNameError = validateBusinessName(businessName);
    if (businessNameError) return errorResponse(400, businessNameError);

    const passwordHash = await hashPassword(password);
    const result = await withTransaction(async (client) => {
      const userResult = await client.query<{ id: string; email: string }>(
        `INSERT INTO users (email, password_hash, business_name)
         VALUES ($1, $2, $3)
         RETURNING id, email`,
        [email, passwordHash, businessName],
      );
      const user = userResult.rows[0];
      if (!user) throw new Error("User creation did not return an account.");
      await client.query("SELECT set_config('app.user_id', $1, true)", [user.id]);
      await client.query(
        `INSERT INTO businesses (owner_id, name)
         VALUES ($1, $2)`,
        [user.id, businessName],
      );
      const token = await createSessionToken(user.id, client);
      return { user, token };
    });

    await setSessionCookie(result.token);
    return Response.json({
      user: {
        email: result.user.email,
        businessName,
        demo: false,
      },
    });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
    if (code === "23505") {
      return errorResponse(409, "An account with this email already exists. Sign in instead.");
    }
    logApiError("auth-signup", error);
    return serviceUnavailableResponse();
  }
}
