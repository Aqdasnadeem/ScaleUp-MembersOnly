"use client";

import { useEffect, useState } from "react";
import { Clock3, FileUp, MessageSquareText } from "lucide-react";
import { readDemoAssistantHistory } from "@/lib/demo-api";

interface EvidenceRecord {
  source?: string;
  metric?: string;
  value?: string;
  detail?: string;
  fileName?: string;
  rowNumber?: number;
}

interface QuestionHistory {
  id: string;
  question: string;
  answer: string;
  recordsUsed: EvidenceRecord[] | null;
  createdAt: string;
}

interface UploadHistory {
  id: string;
  fileName: string;
  category: string;
  rowsSaved: number;
  rowsRejected: number;
  createdAt: string;
}

interface HistoryData {
  questions: QuestionHistory[];
  uploads: UploadHistory[];
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `${dateLabel} Â· ${timeLabel}`;
}

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      const demoQuestions = readDemoAssistantHistory();
      setHistory({
        questions: demoQuestions.length > 0
          ? demoQuestions
          : [{
              id: "demo-question-1",
              question: "Why did profit change?",
              answer: "The sample uses fictional sales and expense data to illustrate the assistant.",
              recordsUsed: [],
              createdAt: "2026-10-30T12:15:00.000Z",
            }],
        uploads: [
          { id: "demo-sales", fileName: "sales-oct-2026.csv", category: "sales", rowsSaved: 5, rowsRejected: 0, createdAt: "2026-10-30T12:00:00.000Z" },
          { id: "demo-inventory", fileName: "inventory-oct-2026.csv", category: "inventory", rowsSaved: 5, rowsRejected: 0, createdAt: "2026-10-30T12:00:00.000Z" },
        ],
      });
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      <header>
        <h1 className="text-2xl font-extrabold text-[#1F2A44]">History</h1>
        <p className="mt-1 text-sm leading-6 text-[#5B6475]">Past assistant questions and file upload checks for your account.</p>
      </header>

      {loading && <p role="status" className="rounded-xl border border-[#E8DCC8] bg-white p-5 text-sm text-[#5B6475]">Loading history...</p>}
      {history && (
        <>
          <section aria-labelledby="questions-title" className="space-y-4">
            <h2 id="questions-title" className="flex items-center gap-2 text-lg font-bold text-[#1F2A44]">
              <MessageSquareText className="h-5 w-5 text-[#72571F]" aria-hidden="true" />
              Assistant questions
            </h2>
            {history.questions.length === 0 ? (
              <p className="rounded-xl border border-[#E8DCC8] bg-white p-5 text-sm text-[#5B6475]">No assistant questions yet.</p>
            ) : (
              <ol className="space-y-4">
                {history.questions.map((item) => (
                  <li key={item.id} className="rounded-2xl border border-[#E8DCC8] bg-white p-5 shadow-sm">
                    <p className="flex items-start gap-2 text-sm font-bold leading-6 text-[#1F2A44]">
                      <Clock3 className="mt-1 h-4 w-4 shrink-0 text-[#72571F]" aria-hidden="true" />
                      <span>{item.question}</span>
                    </p>
                    <p className="mt-1 pl-6 text-xs text-[#5B6475]">{formatTimestamp(item.createdAt)}</p>
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[#374151]">{item.answer}</p>
                    <details className="mt-4 rounded-xl border border-[#E8DCC8] bg-[#FAF6EF] p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-[#1F2A44] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#88682A]">
                        Records used ({item.recordsUsed?.length ?? 0})
                      </summary>
                      {item.recordsUsed?.length ? (
                        <ul className="mt-3 space-y-2">
                          {item.recordsUsed.map((record, index) => (
                            <li key={`${record.fileName ?? "record"}-${record.rowNumber ?? index}`} className="rounded-lg border border-[#E8DCC8] bg-white p-3 text-xs leading-5 text-[#374151]">
                              <div className="flex flex-wrap items-center gap-2">
                                {record.source && (
                                  <span className="rounded-full border border-[#D5C3A5] bg-[#F7EFCF] px-2.5 py-1 text-xs font-bold text-[#1F2A44]">
                                    {record.source}
                                  </span>
                                )}
                                <p className="font-semibold text-[#1F2A44]">
                                {record.fileName ?? record.source ?? "Uploaded file"}
                                {record.rowNumber ? ` Â· Row ${record.rowNumber}` : ""}
                                </p>
                              </div>
                              {record.detail && <p className="mt-1 break-words">{record.detail}</p>}
                            </li>
                          ))}
                        </ul>
                      ) : <p className="mt-3 text-xs text-[#5B6475]">No individual records were used.</p>}
                    </details>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section aria-labelledby="uploads-title" className="space-y-4">
            <h2 id="uploads-title" className="flex items-center gap-2 text-lg font-bold text-[#1F2A44]">
              <FileUp className="h-5 w-5 text-[#72571F]" aria-hidden="true" />
              File uploads
            </h2>
            {history.uploads.length === 0 ? (
              <p className="rounded-xl border border-[#E8DCC8] bg-white p-5 text-sm text-[#5B6475]">No upload checks yet.</p>
            ) : (
              <ul className="space-y-3">
                {history.uploads.map((item) => (
                  <li key={item.id} className="flex flex-col gap-2 rounded-2xl border border-[#E8DCC8] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#1F2A44]">{item.fileName}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-[#D5C3A5] bg-[#F7EFCF] px-2.5 py-1 text-xs font-bold capitalize text-[#1F2A44]">{item.category}</span>
                        <span className="text-xs text-[#5B6475]">{formatTimestamp(item.createdAt)}</span>
                      </div>
                    </div>
                    <p className="shrink-0 text-xs font-semibold text-[#374151]">
                      {item.rowsSaved} saved Â· {item.rowsRejected} rejected
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
