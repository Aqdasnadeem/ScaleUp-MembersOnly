import { getAuthenticatedUser } from "@/lib/server/auth";
import { withUserTransaction } from "@/lib/server/db";
import { errorResponse, logApiError, serviceUnavailableResponse } from "@/lib/server/http";

interface AssistantHistoryRow {
  id: string;
  question: string;
  answer: string;
  records_used: unknown;
  created_at: Date;
}

interface UploadHistoryRow {
  id: string;
  file_name: string;
  category: string;
  rows_saved: number;
  rows_rejected: number;
  created_at: Date;
}

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return errorResponse(401, "Sign in to view your history.");

    const history = await withUserTransaction(user.id, async (client) => {
      const [assistantResult, uploadResult] = await Promise.all([
        client.query<AssistantHistoryRow>(
          `SELECT id, question, answer, records_used, created_at
           FROM assistant_history
           WHERE user_id = $1
           ORDER BY created_at DESC
           LIMIT 100`,
          [user.id],
        ),
        client.query<UploadHistoryRow>(
          `SELECT id, file_name, category, rows_saved, rows_rejected, created_at
           FROM upload_events
           WHERE user_id = $1
           ORDER BY created_at DESC
           LIMIT 100`,
          [user.id],
        ),
      ]);
      return {
        questions: assistantResult.rows.map((row) => ({
          id: row.id,
          question: row.question,
          answer: row.answer,
          recordsUsed: row.records_used,
          createdAt: row.created_at.toISOString(),
        })),
        uploads: uploadResult.rows.map((row) => ({
          id: row.id,
          fileName: row.file_name,
          category: row.category,
          rowsSaved: Number(row.rows_saved),
          rowsRejected: Number(row.rows_rejected),
          createdAt: row.created_at.toISOString(),
        })),
      };
    });

    return Response.json(history);
  } catch (error) {
    logApiError("history-read", error);
    return serviceUnavailableResponse();
  }
}
