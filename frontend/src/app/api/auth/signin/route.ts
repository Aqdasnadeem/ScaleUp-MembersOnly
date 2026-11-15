import type { NextRequest } from "next/server";
import { createSessionToken, setSessionCookie, verifyPassword } from "@/lib/server/auth";
import { withTransaction } from "@/lib/server/db";
import { checkRateLimit, errorResponse, logApiError, readJsonObject, requireSameOrigin, serviceUnavailableResponse } from "@/lib/server/http";
import { normalizeEmail, isValidEmail } from "@/lib/server/validation";
import { upgradePasswordHash } from "@/lib/server/password";

const DUMMY_BCRYPT_HASH = "$2b$12$NGzylJLOzo66he5Epdnx2eGL/YfUqppO93wMghxqYv7Z8Gb/zJYq2";

export async function POST(request: NextRequest) {
  try {
    const csrfError = requireSameOrigin(request);
    if (csrfError) return csrfError;
    const body = await readJsonObject(request);
    const email = normalizeEmail(typeof body?.email === "string" ? body.email : "");
    const password = typeof body?.password === "string" ? body.password : "";
    const ipLimited = await checkRateLimit(request, "signin-ip", "", 30, 900);
    if (ipLimited) return ipLimited;
    const limited = await checkRateLimit(request, "signin-email", email, 10, 900);
    if (limited) return limited;

    if (!isValidEmail(email) || !password || new TextEncoder().encode(password).byteLength > 72) {
      return errorResponse(400, "Enter a valid email address and password.");
    }

    const result = await withTransaction(async (client) => {
      const userResult = await client.query<{
        id: string;
        email: string;
        password_hash: string;
        is_demo: boolean;
      }>(
        `SELECT id, email, password_hash, is_demo
         FROM users
         WHERE email = $1`,
        [email],
      );
      const user = userResult.rows[0];
      if (!user) {
        await verifyPassword(password, DUMMY_BCRYPT_HASH);
        return null;
      }
      if (!(await verifyPassword(password, user.password_hash))) return null;
      const migratedHash = await upgradePasswordHash(password, user.password_hash);
      if (migratedHash) {
        await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [migratedHash, user.id]);
      }
      await client.query("SELECT set_config('app.user_id', $1, true)", [user.id]);
      const businessResult = await client.query<{ name: string }>(
        "SELECT name FROM businesses WHERE owner_id = $1",
        [user.id],
      );
      const business = businessResult.rows[0];
      if (!business) throw new Error("The account has no business profile.");
      const token = await createSessionToken(user.id, client);
      return { user, token, businessName: business.name };
    });

    if (!result) return errorResponse(401, "Email or password is incorrect.");
    await setSessionCookie(result.token);
    return Response.json({
      user: {
        email: result.user.email,
        businessName: result.businessName,
        demo: result.user.is_demo,
      },
    });
  } catch (error) {
    logApiError("auth-signin", error);
    return serviceUnavailableResponse();
  }
}
