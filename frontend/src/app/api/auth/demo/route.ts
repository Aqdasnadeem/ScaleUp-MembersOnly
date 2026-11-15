import { createSessionToken, setSessionCookie } from "@/lib/server/auth";
import { withTransaction } from "@/lib/server/db";
import { checkRateLimit, errorResponse, logApiError, requireSameOrigin, serviceUnavailableResponse } from "@/lib/server/http";

const DEMO_SESSION_SECONDS = 60 * 60 * 24;

export async function POST(request: Request) {
  try {
    const csrfError = requireSameOrigin(request);
    if (csrfError) return csrfError;
    if (!process.env.DATABASE_URL) {
      return Response.json({
        error: "Demo sign-in is unavailable until PostgreSQL is configured and the demo account is seeded.",
        demoFallbackAvailable: true,
      }, { status: 503 });
    }
    const limited = await checkRateLimit(request, "demo", "", 3, 60);
    if (limited) return limited;

    const result = await withTransaction(async (client) => {
      const email = process.env.DEMO_EMAIL ?? "demo@scaleup.local";
      const userResult = await client.query<{ id: string; email: string; is_demo: boolean }>(
        `SELECT id, email, is_demo
         FROM users
         WHERE email = $1 AND is_demo = true`,
        [email],
      );
      const user = userResult.rows[0];
      if (!user) return null;

      await client.query("SELECT set_config('app.user_id', $1, true)", [user.id]);
      const businessResult = await client.query<{ name: string }>(
        "SELECT name FROM businesses WHERE owner_id = $1 AND is_demo = true",
        [user.id],
      );
      const business = businessResult.rows[0];
      if (!business) return null;

      const token = await createSessionToken(user.id, client, DEMO_SESSION_SECONDS);
      return { user, business, token };
    });

    if (!result) {
      return errorResponse(503, "The demo account is not seeded yet. Ask an administrator to run the demo seed script.");
    }
    await setSessionCookie(result.token, DEMO_SESSION_SECONDS);
    return Response.json({
      user: {
        email: result.user.email,
        businessName: result.business.name,
        demo: true,
      },
    });
  } catch (error) {
    logApiError("auth-demo", error);
    return serviceUnavailableResponse();
  }
}
