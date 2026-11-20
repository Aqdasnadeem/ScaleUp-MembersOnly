"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import UploadResultCard from "@/components/UploadResultCard";
import { formatJobStatus, getUpload, listUploads, type UploadJob, type UploadJobDetail } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { useBusiness } from "@/hooks/useBusiness";

export default function HistoryPage() {
  const { business } = useBusiness();
  const [items, setItems] = useState<UploadJob[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [selectedJob, setSelectedJob] = useState<UploadJobDetail | null>(null);
  const [loadingJob, setLoadingJob] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    listUploads().then(
      ({ items: uploads }) => {
        if (active) setItems(uploads);
      },
      (reason: unknown) => {
        if (active) {
          setItems([]);
          setError(reason instanceof Error ? reason.message : "Upload history could not be loaded.");
        }
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const selectUpload = async (jobId: string | number) => {
    if (selectedId === jobId) {
      setSelectedId(null);
      setSelectedJob(null);
      setError("");
      return;
    }

    setSelectedId(jobId);
    setSelectedJob(null);
    setLoadingJob(true);
    setError("");
    try {
      setSelectedJob(await getUpload(jobId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Upload details could not be loaded.");
    } finally {
      setLoadingJob(false);
    }
  };

  if (!items) return <p role="status" className="p-6 text-sm text-[#5B6475]">Loading history...</p>;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <header>
        <h1 className="text-2xl font-bold text-[#1F2A44]">History</h1>
        <p className="mt-1 text-sm text-[#5B6475]">Your recent file uploads.</p>
      </header>
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
      {items.length === 0 ? (
        <div className="space-y-3">
          {!error && <p className="text-sm text-[#5B6475]">No uploads yet.</p>}
          <Link href="/upload" className="text-sm font-bold text-[#1F2A44] underline">Upload your files</Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E8DCC8] bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#FAF6EF] text-xs uppercase text-[#5B6475]">
              <tr>
                <th scope="col" className="px-4 py-3">File</th>
                <th scope="col" className="px-4 py-3">Type</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Loaded</th>
                <th scope="col" className="px-4 py-3">Rejected</th>
                <th scope="col" className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={String(item.job_id)} className="border-t border-[#E8DCC8]">
                  <td className="px-4 py-3 font-semibold text-[#1F2A44]">
                    <button
                      type="button"
                      onClick={() => void selectUpload(item.job_id)}
                      aria-expanded={selectedId === item.job_id}
                      className="text-left underline"
                    >
                      {item.file_name}
                    </button>
                  </td>
                  <td className="px-4 py-3">{item.upload_type}</td>
                  <td className="px-4 py-3">{formatJobStatus(item.status)}</td>
                  <td className="px-4 py-3">{item.loaded_rows ?? "—"}</td>
                  <td className="px-4 py-3">{item.rejected_rows ?? "—"}</td>
                  <td className="px-4 py-3">{formatDate(item.created_at, business?.date_format)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {loadingJob && <p role="status" className="text-sm text-[#5B6475]">Loading upload result...</p>}
      {selectedJob && <UploadResultCard key={selectedJob.job_id} job={selectedJob} status={selectedJob.status} />}
    </div>
  );
}
