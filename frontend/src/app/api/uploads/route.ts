import { getAuthenticatedUser } from "@/lib/server/auth";
import { withUserTransaction } from "@/lib/server/db";
import { checkRateLimit, errorResponse, logApiError, requireSameOrigin, serviceUnavailableResponse } from "@/lib/server/http";
import { insertDataset } from "@/lib/server/data";
import { UPLOAD_CATEGORIES, validateCsv, type CsvColumnMapping, type UploadCategory } from "@/lib/server/csv";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return errorResponse(401, "Sign in to view your uploaded files.");
    const datasets = await withUserTransaction(user.id, async (client) => {
      const result = await client.query<{
        id: string;
        category: UploadCategory;
        file_name: string;
        row_count: number;
        uploaded_at: Date;
      }>(
        `SELECT id, category, file_name, row_count, uploaded_at
         FROM datasets
         WHERE user_id = $1
         ORDER BY uploaded_at DESC`,
        [user.id],
      );
      return result.rows.map((row) => ({
        id: row.id,
        category: row.category,
        fileName: row.file_name,
        rows: Number(row.row_count),
        uploadedAt: row.uploaded_at.toISOString(),
      }));
    });
    return Response.json({ datasets });
  } catch (error) {
    logApiError("uploads-list", error);
    return serviceUnavailableResponse();
  }
}

export async function POST(request: Request) {
  try {
    const csrfError = requireSameOrigin(request);
    if (csrfError) return csrfError;
    const user = await getAuthenticatedUser();
    if (!user) return errorResponse(401, "Sign in before uploading a CSV file.");
    if (user.demo) return errorResponse(403, "The demo account is read-only.");
    const limited = await checkRateLimit(request, "upload", user.id, 12, 60);
    if (limited) return limited;

    const formData = await request.formData();
    const categoryValue = formData.get("category");
    const fileValue = formData.get("file");
    const mappingValue = formData.get("columnMapping");
    if (
      typeof categoryValue !== "string"
      || !UPLOAD_CATEGORIES.includes(categoryValue as UploadCategory)
    ) {
      return errorResponse(400, "Choose sales, inventory, expenses or customer reviews.");
    }
    if (!(fileValue instanceof File)) {
      return errorResponse(400, "Choose a CSV file to upload.");
    }
    if (!fileValue.name.toLowerCase().endsWith(".csv")) {
      return errorResponse(400, "Only .csv files are supported.");
    }
    if (fileValue.size <= 0 || fileValue.size > MAX_FILE_BYTES) {
      return errorResponse(400, "CSV files must be between 1 byte and 10 MB.");
    }
    let columnMapping: CsvColumnMapping | undefined;
    if (mappingValue !== null) {
      if (typeof mappingValue !== "string") {
        return errorResponse(400, "The column mapping is invalid.");
      }
      let parsedMapping: unknown;
      try {
        parsedMapping = JSON.parse(mappingValue);
      } catch {
        return errorResponse(400, "The column mapping is invalid.");
      }
      if (
        typeof parsedMapping !== "object"
        || parsedMapping === null
        || Array.isArray(parsedMapping)
        || !Object.values(parsedMapping).every((source) => typeof source === "string")
      ) {
        return errorResponse(400, "The column mapping is invalid.");
      }
      columnMapping = parsedMapping as CsvColumnMapping;
    }

    const rawFileName = fileValue.name.replaceAll("\\", "/").split("/").pop() ?? "upload.csv";
    const fileName = rawFileName.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255);
    const text = await fileValue.text();
    const validation = validateCsv(text, categoryValue as UploadCategory, user.dateFormat, columnMapping);
    if (!validation.valid) {
      const invalidRowCount = validation.rowErrors.length
        ? new Set(validation.rowErrors.map((row) => row.rowNumber)).size
        : validation.rowsProcessed;
      const uploadJobId = await withUserTransaction(user.id, async (client) => {
        const result = await client.query<{ id: string }>(
          `INSERT INTO upload_events (user_id, file_name, category, rows_saved, rows_rejected)
           VALUES ($1, $2, $3, 0, $4)
           RETURNING id`,
          [user.id, fileName, categoryValue, invalidRowCount],
        );
        return result.rows[0]?.id;
      });
      if (!uploadJobId) throw new Error("The failed upload job could not be recorded.");
      return Response.json(
        {
          jobId: uploadJobId,
          error: "Fix the CSV errors and upload it again. No rows were saved.",
          missingColumns: validation.missingColumns,
          generalErrors: validation.generalErrors,
          rowErrors: validation.rowErrors,
          rowsProcessed: validation.rowsProcessed,
          rowsRejected: invalidRowCount,
        },
        { status: 422 },
      );
    }

    const replaceValue = formData.get("replaceId");
    const replaceId = typeof replaceValue === "string" && replaceValue ? replaceValue : null;
    if (replaceId && !UUID_PATTERN.test(replaceId)) {
      return errorResponse(400, "The file selected for replacement is invalid.");
    }

    const savedUpload = await withUserTransaction(user.id, async (client) => {
      if (replaceId) {
        const existing = await client.query<{ id: string }>(
          "SELECT id FROM datasets WHERE id = $1 AND user_id = $2",
          [replaceId, user.id],
        );
        if (!existing.rows[0]) return null;
        await client.query(
          "DELETE FROM datasets WHERE id = $1 AND user_id = $2",
          [replaceId, user.id],
        );
      }

      const id = await insertDataset(
        client,
        user.id,
        categoryValue as UploadCategory,
        fileName,
        validation.rows,
      );
      const uploadEvent = await client.query<{ id: string }>(
        `INSERT INTO upload_events (user_id, file_name, category, rows_saved, rows_rejected)
         VALUES ($1, $2, $3, $4, 0)
         RETURNING id`,
        [user.id, fileName, categoryValue, validation.rows.length],
      );
      const jobId = uploadEvent.rows[0]?.id;
      if (!jobId) throw new Error("The completed upload job could not be recorded.");
      return {
        dataset: {
          id,
          category: categoryValue,
          fileName,
          rows: validation.rows.length,
          uploadedAt: new Date().toISOString(),
        },
        jobId,
      };
    });
    if (!savedUpload) return errorResponse(404, "The file to replace was not found in your account.");
    return Response.json(savedUpload, { status: 201 });
  } catch (error) {
    logApiError("uploads-create", error);
    return serviceUnavailableResponse();
  }
}

export async function DELETE(request: Request) {
  try {
    const csrfError = requireSameOrigin(request);
    if (csrfError) return csrfError;
    const user = await getAuthenticatedUser();
    if (!user) return errorResponse(401, "Sign in before deleting an uploaded file.");
    if (user.demo) return errorResponse(403, "The demo account is read-only.");
    const limited = await checkRateLimit(request, "upload-delete", user.id, 20, 60);
    if (limited) return limited;
    const id = new URL(request.url).searchParams.get("id");
    if (!id || !UUID_PATTERN.test(id)) return errorResponse(400, "Choose a valid uploaded file.");

    const deleted = await withUserTransaction(user.id, async (client) => {
      const result = await client.query(
        "DELETE FROM datasets WHERE id = $1 AND user_id = $2 RETURNING id",
        [id, user.id],
      );
      return result.rowCount === 1;
    });
    if (!deleted) return errorResponse(404, "That uploaded file was not found in your account.");
    return Response.json({ deleted: true });
  } catch (error) {
    logApiError("uploads-delete", error);
    return serviceUnavailableResponse();
  }
}
