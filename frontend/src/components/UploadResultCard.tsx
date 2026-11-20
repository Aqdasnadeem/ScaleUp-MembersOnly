import { useState } from "react";
import { formatJobStatus, type JobStatus, type UploadJobDetail } from "@/lib/api";
import { Loader2, TriangleAlert } from "lucide-react";

const TERMINAL_STATUSES: JobStatus[] = ["completed", "completed_with_warnings", "failed", "replaced"];
const PAGE_SIZE = 50;

interface UploadResultCardProps {
  job: UploadJobDetail | null;
  status: JobStatus;
}

type CountKey = "total_rows" | "loaded_rows" | "skipped_rows" | "rejected_rows" | "returned_rows";

const COUNTS: Array<{ key: CountKey; label: string }> = [
  { key: "total_rows", label: "Total rows" },
  { key: "loaded_rows", label: "Loaded rows" },
  { key: "skipped_rows", label: "Skipped rows" },
  { key: "rejected_rows", label: "Rejected rows" },
  { key: "returned_rows", label: "Returned rows" },
];

export default function UploadResultCard({ job, status }: UploadResultCardProps) {
  const errors = job?.error_report ?? [];
  const isComplete = status === "completed" || status === "completed_with_warnings";
  const isFailure = status === "failed";
  const isTerminal = TERMINAL_STATUSES.includes(status);

  // Stored count is what the API actually sent (capped server-side at ERROR_REPORT_MAX); the true
  // rejected count can be higher, so the two are tracked separately rather than assumed equal.
  const storedCount = errors.length;
  const totalRejected = job?.rejected_rows ?? storedCount;
  const isCapped = totalRejected > storedCount;

  // The parent keys this component by job id, so a different job remounts it and this starts fresh.
  const [shown, setShown] = useState(Math.min(PAGE_SIZE, storedCount));
  const visible = errors.slice(0, shown);
  const hasMore = shown < storedCount;
  const showHeader = hasMore || isCapped;

  return (
    <section aria-labelledby="result-heading" className="rounded-2xl border border-[#E8DCC8] bg-white p-5 sm:p-6">
      <h2 id="result-heading" className="text-lg font-bold text-[#1F2A44]">Upload result</h2>
      <p role="status" className="mt-2 flex items-center gap-2 text-sm font-semibold text-[#1F2A44]">
        {!isTerminal && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {formatJobStatus(status)}
      </p>
      {isComplete && !isFailure && (
        <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-[#15803D]">
          {status === "completed" && (job?.loaded_rows ?? 0) === 0 && (job?.skipped_rows ?? 0) > 0
            ? "No new rows: all were already saved."
            : `Done! ${job?.loaded_rows ?? 0} rows saved${(job?.rejected_rows ?? 0) > 0 ? `, ${job?.rejected_rows} rejected` : ""}.`}
        </p>
      )}
      {isFailure && (
        <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Upload failed. Nothing was saved.</p>
          {job?.message && <p className="mt-1 leading-6">{job.message}</p>}
        </div>
      )}
      {errors.length > 0 && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {showHeader && (
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">
              Showing first {Math.min(shown, storedCount)} of {storedCount} rejected row{storedCount === 1 ? "" : "s"}
              {isCapped && ` — only the first ${storedCount} are stored; total rejected ${totalRejected}`}
            </p>
          )}
          <ul className="max-h-96 space-y-2 overflow-y-auto">
            {visible.map((item, index) => (
              <li key={`${item.row}-${index}`} className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="break-words">Row {item.row}: {item.reason} ({item.column ?? ""})</span>
              </li>
            ))}
          </ul>
          {hasMore && (
            <button
              type="button"
              onClick={() => setShown((n) => Math.min(n + PAGE_SIZE, storedCount))}
              className="mt-3 text-xs font-semibold text-red-700 underline underline-offset-2 hover:text-red-900"
            >
              Show more
            </button>
          )}
        </div>
      )}
      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        {COUNTS.map(({ key, label }) => (
          <div key={key}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-[#72571F]">{label}</dt>
            <dd className="mt-1 text-lg font-bold text-[#1F2A44]">{job?.[key] ?? "—"}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#72571F]">Message</h3>
        <p className="mt-1 text-sm leading-6 text-[#1F2A44]">{job?.message ?? "—"}</p>
      </div>
    </section>
  );
}
