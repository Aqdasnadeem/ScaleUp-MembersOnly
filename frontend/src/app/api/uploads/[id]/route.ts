import { getAuthenticatedUser } from "@/lib/server/auth";
import { withUserTransaction } from "@/lib/server/db";
import { errorResponse, logApiError, serviceUnavailableResponse } from "@/lib/server/http";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface UploadStatusRow {
  id: string;
  rows_saved: number;
  rows_rejected: number;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return errorResponse(401, "Sign in to check an upload status.");
    const { id } = await context.params;
    if (!UUID_PATTERN.test(id)) return errorResponse(400, "Choose a valid upload job.");

    const job = await withUserTransaction(user.id, async (client) => {
      const result = await client.query<UploadStatusRow>(
        `SELECT id, rows_saved, rows_rejected
         FROM upload_events
         WHERE id = $1 AND user_id = $2`,
        [id, user.id],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        status: Number(row.rows_saved) > 0 ? "done" as const : "failed" as const,
        rowsLoaded: Number(row.rows_saved),
        rowsRejected: Number(row.rows_rejected),
      };
    });
    if (!job) return errorResponse(404, "That upload job was not found in your account.");
    return Response.json(job, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logApiError("upload-status", error);
    return serviceUnavailableResponse();
  }
}