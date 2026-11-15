import { getAuthenticatedUser } from "@/lib/server/auth";
import { withUserTransaction } from "@/lib/server/db";
import { errorResponse, logApiError, requireSameOrigin, serviceUnavailableResponse } from "@/lib/server/http";
import { validateProfileChanges } from "@/lib/server/validation";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return errorResponse(401, "Sign in to view your profile.");
    return Response.json({
      profile: {
        email: user.email,
        businessName: user.businessName,
        currency: user.currency,
        dateFormat: user.dateFormat,
        demo: user.demo,
      },
    });
  } catch (error) {
    logApiError("profile-read", error);
    return serviceUnavailableResponse();
  }
}

export async function PATCH(request: Request) {
  try {
    const csrfError = requireSameOrigin(request);
    if (csrfError) return csrfError;
    const user = await getAuthenticatedUser();
    if (!user) return errorResponse(401, "Sign in to update your profile.");
    if (user.demo) return errorResponse(403, "The demo account is read-only.");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse(400, "Enter valid profile settings.");
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return errorResponse(400, "Enter valid profile settings.");
    }
    const source = body as Record<string, unknown>;
    const result = validateProfileChanges({
      businessName: typeof source.businessName === "string" ? source.businessName : "",
      dateFormat: typeof source.dateFormat === "string" ? source.dateFormat : "",
    });
    if ("error" in result) {
      return Response.json({ error: result.error, field: result.field }, { status: 422 });
    }

    await withUserTransaction(user.id, async (client) => {
      await client.query(
        `UPDATE businesses
         SET name = $1, date_format = $2, updated_at = now()
         WHERE owner_id = $3`,
        [result.businessName, result.dateFormat, user.id],
      );
      await client.query(
        "UPDATE users SET business_name = $1 WHERE id = $2",
        [result.businessName, user.id],
      );
    });
    return Response.json({ profile: { ...result, currency: "PKR" } });
  } catch (error) {
    logApiError("profile-update", error);
    return serviceUnavailableResponse();
  }
}
