import "server-only";
import type { PoolClient } from "pg";
import type { UploadCategory } from "./csv";

export interface ValidatedRow {
  rowNumber: number;
  data: Record<string, string>;
}

export interface StoredBusinessRecord {
  category: UploadCategory;
  fileName: string;
  rowNumber: number;
  data: Record<string, string>;
}

export async function insertDataset(
  client: PoolClient,
  userId: string,
  category: UploadCategory,
  fileName: string,
  rows: ValidatedRow[],
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO datasets (user_id, category, file_name, row_count)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [userId, category, fileName, rows.length],
  );
  const datasetId = result.rows[0]?.id;
  if (!datasetId) throw new Error("Dataset creation did not return an ID.");

  await client.query(
    `INSERT INTO records (dataset_id, user_id, row_number, data)
     SELECT $1, $2, (entries.item->>'rowNumber')::integer, entries.item->'data'
     FROM jsonb_array_elements($3::jsonb) AS entries(item)`,
    [
      datasetId,
      userId,
      JSON.stringify(rows.map(({ rowNumber, data }) => ({ rowNumber, data }))),
    ],
  );
  return datasetId;
}

export async function getUserRecords(
  client: PoolClient,
  userId: string,
): Promise<StoredBusinessRecord[]> {
  const result = await client.query<{
    category: UploadCategory;
    file_name: string;
    row_number: number;
    data: Record<string, string>;
  }>(
    `SELECT d.category, d.file_name, r.row_number, r.data
     FROM records r
     JOIN datasets d
       ON d.id = r.dataset_id
      AND d.user_id = r.user_id
     WHERE r.user_id = $1
     ORDER BY d.category, r.data->>'date', r.row_number`,
    [userId],
  );
  return result.rows.map((row) => ({
    category: row.category,
    fileName: row.file_name,
    rowNumber: Number(row.row_number),
    data: row.data,
  }));
}
