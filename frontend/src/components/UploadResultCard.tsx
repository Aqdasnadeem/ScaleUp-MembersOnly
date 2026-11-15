import type { JobStatus, UploadJobDetail } from "@/lib/api";
import { TriangleAlert } from "lucide-react";

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

  return (
    <section aria-labelledby="result-heading" className="rounded-2xl border border-[#E8DCC8] bg-white p-5 sm:p-6">
      <h2 id="result-heading" className="text-lg font-bold text-[#1F2A44]">Upload result</h2>
      <p role="status" className="mt-2 text-sm font-semibold text-[#1F2A44]">{status}</p>
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
        <ul className="mt-4 space-y-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {errors.map((item, index) => (
            <li key={`${item.row}-${index}`} className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Row {item.row}: {item.reason} ({item.column ?? ""})</span>
            </li>
          ))}
        </ul>
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
      {errors.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#E8DCC8] text-xs uppercase tracking-wide text-[#72571F]">
                <th scope="col" className="py-2 pr-4">Row</th>
                <th scope="col" className="py-2 pr-4">Column</th>
                <th scope="col" className="py-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((item, index) => (
                <tr key={`${item.row}-${index}`} className="border-b border-[#F1E8D8] align-top">
                  <td className="py-2 pr-4 font-mono">{item.row}</td>
                  <td className="py-2 pr-4">{item.column ?? ""}</td>
                  <td className="py-2">{item.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
