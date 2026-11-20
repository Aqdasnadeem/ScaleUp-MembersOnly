"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle, Download, Loader2, UploadCloud } from "lucide-react";
import {
  ApiError,
  createUpload,
  downloadTemplate,
  formatJobStatus,
  getUpload,
  listUploads,
  planLimitDetail,
  previewUpload,
  type JobStatus,
  type PlanLimitDetail,
  type PreviewResponse,
  type UploadJob,
  type UploadJobDetail,
  type UploadType,
} from "@/lib/api";
import { MAX_UPLOAD_MB } from "@/lib/config";
import UploadResultCard from "@/components/UploadResultCard";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import Button from "@/components/Button";
import Skeleton from "@/components/Skeleton";

const TYPES: Array<{ id: UploadType; title: string; description: string }> = [
  { id: "sales", title: "Sales", description: "Sales transactions, quantities and revenue." },
  { id: "inventory", title: "Inventory", description: "Current item quantities." },
  { id: "expenses", title: "Expenses", description: "Operating expenses." },
  { id: "feedback", title: "Customer reviews", description: "Customer feedback, star ratings and review text." },
];

const POLL_INTERVAL_MS = 1500;

type Phase = "idle" | "previewing" | "ready" | "uploading" | "tracking";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The backend does not fix the shape of `fields`/`required`, so accept names or objects that carry a name.
function toNames(value: unknown): string[] {
  const items: unknown[] = Array.isArray(value) ? value : isRecord(value) ? Object.keys(value) : [];
  const names: string[] = [];
  for (const item of items) {
    if (typeof item === "string") names.push(item);
    else if (isRecord(item)) {
      const name = item.name ?? item.field ?? item.key;
      if (typeof name === "string") names.push(name);
    }
  }
  return names;
}

function initialMapping(preview: PreviewResponse, fields: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const suggested = isRecord(preview.suggested_mapping) ? preview.suggested_mapping : {};
  const saved = isRecord(preview.saved_mapping) ? preview.saved_mapping : {};
  for (const field of fields) {
    const column = saved[field] ?? suggested[field];
    if (typeof column === "string" && preview.columns.includes(column)) mapping[field] = column;
  }
  return mapping;
}

function errorText(reason: unknown): string {
  return reason instanceof ApiError ? reason.message : "Something went wrong. Please try again.";
}

function isTerminal(status: JobStatus): boolean {
  return status === "completed" || status === "completed_with_warnings" || status === "failed";
}

const PREVIEW_ROWS = 5;

// Reads the first few records of a CSV, handling quoted commas and quotes.
function parseCsvPreview(text: string, maxRows: number): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length && rows.length < maxRows; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (rows.length < maxRows && (cell !== "" || row.length > 0)) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export default function UploadPage() {
  const [uploadType, setUploadType] = useState<UploadType>("sales");
  const [file, setFile] = useState<File | null>(null);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [recent, setRecent] = useState<UploadJob[] | null>(null);
  const [recentError, setRecentError] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [snapshotDate, setSnapshotDate] = useState("");
  const [error, setError] = useState("");
  const [planLimit, setPlanLimit] = useState<PlanLimitDetail | null>(null);
  const [notice, setNotice] = useState("");
  const [jobId, setJobId] = useState<string | number | null>(null);
  const [job, setJob] = useState<UploadJobDetail | null>(null);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const activeType = TYPES.find((type) => type.id === uploadType) ?? TYPES[0];

  const fields = preview ? toNames(preview.fields) : [];
  const required = preview ? toNames(preview.required) : [];
  const missingRequired = required.filter((field) => !mapping[field]);
  const needsDate = preview?.needs_snapshot_date === true;
  const canUpload = phase === "ready" && missingRequired.length === 0 && (!needsDate || snapshotDate !== "");

  const reset = useCallback(() => {
    requestId.current += 1;
    setFile(null);
    setSampleRows([]);
    setPhase("idle");
    setPreview(null);
    setMapping({});
    setSnapshotDate("");
    setError("");
    setNotice("");
    setJobId(null);
    setJob(null);
    setDuplicateOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  useEffect(() => {
    return () => {
      requestId.current += 1;
    };
  }, []);

  const loadRecent = useCallback(() => {
    listUploads(10).then(
      (result) => {
        setRecent(result.items);
        setRecentError("");
      },
      (reason: unknown) => {
        setRecent(null);
        setRecentError(errorText(reason));
      },
    );
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  useEffect(() => {
    if (jobId === null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const detail = await getUpload(jobId);
        if (cancelled) return;
        setJob(detail);
        if (isTerminal(detail.status)) {
          setPhase("idle");
          loadRecent();
          return;
        }
      } catch (reason) {
        if (cancelled) return;
        setError(errorText(reason));
        setPhase("idle");
        return;
      }
      timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, loadRecent]);

  const selectFile = async (selected: File | undefined) => {
    reset();
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith(".csv")) {
      setError("Only .csv files are supported. Choose a CSV file.");
      return;
    }
    if (selected.size === 0 || selected.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`Choose a CSV file between 1 byte and ${MAX_UPLOAD_MB} MB.`);
      return;
    }
    const current = ++requestId.current;
    setFile(selected);
    setPhase("previewing");
    void selected.slice(0, 64 * 1024).text().then((text) => {
      if (current === requestId.current) setSampleRows(parseCsvPreview(text.replace(/^\uFEFF/, ""), PREVIEW_ROWS + 1));
    });
    try {
      const result = await previewUpload(selected, uploadType);
      if (current !== requestId.current) return;
      setPreview(result);
      setMapping(initialMapping(result, toNames(result.fields)));
      setPhase("ready");
    } catch (reason) {
      if (current !== requestId.current) return;
      setError(errorText(reason));
      setPhase("idle");
    }
  };

  const chooseType = (type: UploadType) => {
    reset();
    setUploadType(type);
  };

  const submit = async (onDuplicate?: "skip") => {
    if (!file || !preview) return;
    const current = ++requestId.current;
    setError("");
    setPlanLimit(null);
    setNotice("");
    setDuplicateOpen(false);
    setPhase("uploading");
    const cleanMapping: Record<string, string> = {};
    for (const [field, column] of Object.entries(mapping)) {
      if (column) cleanMapping[field] = column;
    }
    try {
      const result = await createUpload({
        file,
        uploadType,
        mapping: cleanMapping,
        snapshotDate: needsDate ? snapshotDate : undefined,
        onDuplicate,
      });
      if (current !== requestId.current) return;
      if (result.kind === "queued") {
        setJob(null);
        setJobId(result.job_id);
        setPhase("tracking");
      } else if (result.kind === "skipped") {
        setNotice("Nothing changed. This file was already loaded.");
        setPhase("ready");
      } else {
        setDuplicateOpen(true);
        setPhase("ready");
      }
    } catch (reason) {
      if (current !== requestId.current) return;
      const limit = planLimitDetail(reason);
      setPlanLimit(limit);
      setError(
        limit
          ? `You've used all ${limit.limit} uploads included in the ${limit.plan === "free" ? "Free" : "Pro"} plan this month.`
          : errorText(reason),
      );
      setPhase("ready");
    }
  };

  const { run: runSubmit, loading: submitting } = useAsyncAction(submit);

  const handleDownloadTemplate = async () => {
    setError("");
    setDownloading(true);
    try {
      await downloadTemplate(uploadType);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setDownloading(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void selectFile(event.target.files?.[0]);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    void selectFile(event.dataTransfer.files[0]);
  };

  const busy = phase === "previewing" || phase === "uploading" || phase === "tracking";

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-12">
      <header>
        <h1 className="text-2xl font-bold text-[#1F2A44]">Upload your business files</h1>
        <p className="mt-1 text-sm leading-6 text-[#5B6475]">
          Choose a CSV file up to {MAX_UPLOAD_MB} MB. You can check how its columns match before anything is saved.
        </p>
      </header>

      <section aria-labelledby="file-type-heading">
        <label htmlFor="upload-type" id="file-type-heading" className="mb-3 block text-lg font-bold text-[#1F2A44]">Choose a file type</label>
        <select
          id="upload-type"
          value={uploadType}
          onChange={(event) => chooseType(event.target.value as UploadType)}
          disabled={busy}
          className="min-h-11 w-full max-w-sm rounded-xl border border-[#D5C3A5] bg-white px-3 text-sm text-[#1F2A44] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#88682A] disabled:opacity-60"
        >
          {TYPES.map((type) => <option key={type.id} value={type.id}>{type.title}</option>)}
        </select>
      </section>

      <section className="rounded-2xl border border-[#E8DCC8] bg-[#FAF6EF] p-5 sm:p-6" aria-labelledby="upload-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="upload-heading" className="text-lg font-bold text-[#1F2A44]">{activeType.title} CSV</h2>
            <p className="mt-1 text-sm text-[#5B6475]">{activeType.description}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleDownloadTemplate()}
            disabled={downloading}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#D5C3A5] bg-white px-3 py-2 text-sm font-semibold text-[#1F2A44] hover:border-[#88682A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#88682A] disabled:opacity-60"
          >
            <Download className="h-4 w-4 text-[#72571F]" aria-hidden="true" />
            {downloading ? "Downloading..." : "Download template"}
          </button>
        </div>

        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          className="mt-5 rounded-xl border-2 border-dashed border-[#D5C3A5] bg-white p-6 text-center hover:border-[#C6A75E]"
        >
          <input
            ref={fileInputRef}
            id="csv-file"
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            disabled={busy}
            className="sr-only"
          />
          <label htmlFor="csv-file" className="flex cursor-pointer flex-col items-center gap-3 rounded-lg p-2 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#88682A]">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#1F2A44] text-[#E0C788]">
              <UploadCloud className="h-6 w-6" aria-hidden="true" />
            </span>
            <span className="font-semibold text-[#1F2A44]">{file ? file.name : "Choose CSV file or drag and drop"}</span>
            <span className="text-xs text-[#5B6475]">CSV format only, up to {MAX_UPLOAD_MB} MB.</span>
          </label>
        </div>

        {phase === "previewing" && (
          <p role="status" className="mt-4 flex items-center gap-2 text-sm text-[#5B6475]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Reading your file...
          </p>
        )}

        {error && (
          <div role="alert" className="mt-4 flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>
              {error}
              {planLimit && (
                <>
                  {" "}
                  <Link href="/billing" className="font-bold underline underline-offset-2">
                    Upgrade your plan
                  </Link>
                  .
                </>
              )}
            </p>
          </div>
        )}
        {notice && (
          <div role="status" className="mt-4 flex gap-3 rounded-xl border border-[#D5C3A5] bg-[#F7EFCF] p-4 text-sm leading-6 text-[#1F2A44]">
            <CheckCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>{notice}</p>
          </div>
        )}

        {sampleRows.length > 1 && (
          <section aria-labelledby="csv-preview-heading" className="mt-5 rounded-xl border border-[#D5C3A5] bg-white p-4">
            <h3 id="csv-preview-heading" className="text-sm font-bold text-[#1F2A44]">First rows of your file</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E8DCC8] uppercase tracking-wide text-[#72571F]">
                    {sampleRows[0].map((column, index) => (
                      <th key={`${column}-${index}`} scope="col" className="whitespace-nowrap py-2 pr-4">{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sampleRows.slice(1).map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-[#F1E8D8]">
                      {sampleRows[0].map((_, cellIndex) => (
                        <td key={cellIndex} className="whitespace-nowrap py-2 pr-4">{row[cellIndex] ?? ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {preview && fields.length > 0 && (
          <section aria-labelledby="column-mapping-heading" className="mt-5 rounded-xl border border-[#D5C3A5] bg-white p-4">
            <h3 id="column-mapping-heading" className="text-sm font-bold text-[#1F2A44]">Match your CSV columns</h3>
            <p className="mt-1 text-xs leading-5 text-[#5B6475]">Fields marked * are required.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {fields.map((field) => (
                <label key={field} className="text-xs font-semibold text-[#1F2A44]">
                  <span className="mb-1 block">{field}{required.includes(field) ? " *" : ""}</span>
                  <select
                    value={mapping[field] ?? ""}
                    disabled={phase !== "ready"}
                    onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))}
                    className="min-h-11 w-full rounded-lg border border-[#D5C3A5] bg-white px-3 text-sm text-[#1F2A44] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#88682A] disabled:opacity-60"
                  >
                    <option value="">not in my file</option>
                    {preview.columns.map((column, index) => (
                      <option key={`${column}-${index}`} value={column}>{column || `Unnamed column ${index + 1}`}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </section>
        )}

        {preview && needsDate && (
          <div className="mt-4">
            <label htmlFor="snapshot-date" className="block text-sm font-semibold text-[#1F2A44]">Stock as of *</label>
            <input
              id="snapshot-date"
              type="date"
              required
              value={snapshotDate}
              disabled={phase !== "ready"}
              onChange={(event) => setSnapshotDate(event.target.value)}
              className="mt-1.5 min-h-11 rounded-xl border border-[#D5C3A5] bg-white px-4 py-2.5 text-sm text-[#1F2A44] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#88682A] disabled:opacity-60"
            />
          </div>
        )}

        {preview && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button
              onClick={() => void runSubmit()}
              disabled={!canUpload}
              loading={submitting}
            >
              <UploadCloud className="h-4 w-4" aria-hidden="true" />
              Upload
            </Button>
            {missingRequired.length > 0 && phase === "ready" && (
              <p className="text-xs text-[#5B6475]">Match every required field to continue.</p>
            )}
          </div>
        )}
      </section>

      {(phase === "tracking" || job) && (
        <UploadResultCard key={job?.job_id ?? "none"} job={job} status={job?.status ?? "pending"} />
      )}

      <section aria-labelledby="recent-heading" className="rounded-2xl border border-[#E8DCC8] bg-white p-5 sm:p-6">
        <h2 id="recent-heading" className="text-lg font-bold text-[#1F2A44]">Recent uploads</h2>
        {recent === null ? (
          recentError ? (
            <p role="alert" className="mt-2 text-sm text-[#5B6475]">{recentError}</p>
          ) : (
            <div className="mt-3 space-y-2" role="status" aria-label="Loading recent uploads">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          )
        ) : recent.length === 0 ? (
          <p className="mt-2 text-sm text-[#5B6475]">No uploads yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#E8DCC8] text-xs uppercase tracking-wide text-[#72571F]">
                  <th scope="col" className="py-2 pr-4">File</th>
                  <th scope="col" className="py-2 pr-4">Type</th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                  <th scope="col" className="py-2 pr-4">Loaded</th>
                  <th scope="col" className="py-2 pr-4">Rejected</th>
                  <th scope="col" className="py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((item) => (
                  <tr key={String(item.job_id)} className="border-b border-[#F1E8D8]">
                    <td className="py-2 pr-4">{item.file_name}</td>
                    <td className="py-2 pr-4 capitalize">{item.upload_type}</td>
                    <td className="py-2 pr-4">{formatJobStatus(item.status)}</td>
                    <td className="py-2 pr-4">{item.loaded_rows ?? 0}</td>
                    <td className="py-2 pr-4">{item.rejected_rows ?? 0}</td>
                    <td className="py-2 whitespace-nowrap">{item.created_at ? item.created_at.slice(0, 10) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {duplicateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#131A2B]/55 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="duplicate-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 id="duplicate-title" className="text-lg font-bold text-[#1F2A44]">This exact file was already loaded.</h2>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button autoFocus loading={submitting} onClick={() => void runSubmit("skip")}>
                Skip
              </Button>
              <button
                type="button"
                onClick={() => setDuplicateOpen(false)}
                disabled={submitting}
                className="min-h-11 rounded-xl border border-[#D5C3A5] px-5 py-2.5 text-sm font-bold text-[#1F2A44] disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
