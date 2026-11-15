import { listUploads, type JobStatus, type UploadType } from "@/lib/api";

export interface HistoryItem {
  job_id: string;
  upload_type: UploadType;
  file_name: string;
  status: JobStatus;
  total_rows: number;
  loaded_rows: number;
  rejected_rows: number;
  message: string;
  created_at: string;
  completed_at: string | null;
}


export async function getHistory(): Promise<HistoryItem[]> {
  const { items } = await listUploads(50);
  return items.map((item) => ({
    job_id: String(item.job_id),
    upload_type: item.upload_type,
    file_name: item.file_name,
    status: item.status,
    total_rows: item.total_rows ?? 0,
    loaded_rows: item.loaded_rows ?? 0,
    rejected_rows: item.rejected_rows ?? 0,
    message: item.message ?? "",
    created_at: item.created_at,
    completed_at: item.completed_at,
  }));
}