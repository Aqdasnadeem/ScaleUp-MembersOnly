import { getAuthenticatedUser } from "@/lib/server/auth";
import { errorResponse, logApiError, serviceUnavailableResponse } from "@/lib/server/http";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return errorResponse(401, "Not signed in.");
    return Response.json({
      user: {
        email: user.email,
        businessName: user.businessName,
        dateFormat: user.dateFormat,
        currency: user.currency,
        demo: user.demo,
      },
    });
  } catch (error) {
    logApiError("auth-session", error);
    return serviceUnavailableResponse();
  }
}
