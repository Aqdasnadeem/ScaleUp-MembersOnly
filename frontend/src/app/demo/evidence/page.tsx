"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Database } from "lucide-react";
import { fetchDashboardAlerts, type DashboardAlert } from "@/lib/demo-api";

export default function EvidenceExplorerPage() {
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadEvidence = useCallback(async () => {
    try {
      setAlerts(await fetchDashboardAlerts());
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Evidence could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);
  const refreshEvidence = () => {
    setLoading(true);
    void loadEvidence();
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void loadEvidence(), 0);
    return () => window.clearTimeout(timer);
  }, [loadEvidence]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <header>
        <h1 className="text-2xl font-bold text-[#1F2A44]">Records behind your alerts</h1>
        <p className="mt-1 text-sm leading-6 text-[#5B6475]">Evidence comes from the source rows used to calculate your current alerts.</p>
      </header>
      {loading && <p role="status" className="rounded-xl border border-[#E8DCC8] bg-white p-5 text-sm text-[#5B6475]">Loading evidence...</p>}
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><p>{error}</p><button type="button" onClick={refreshEvidence} className="mt-2 font-bold underline">Try again</button></div>}
      {!loading && !error && alerts.length === 0 && <p className="rounded-xl border border-dashed border-[#D5C3A5] bg-[#FAF6EF] p-6 text-sm text-[#5B6475]">There are no alert evidence records yet.</p>}
      {!loading && !error && alerts.map((alert) => (
        <section key={alert.id} className="rounded-2xl border border-[#E8DCC8] bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#72571F]">{alert.category}</p>
              <h2 className="mt-1 text-base font-bold text-[#1F2A44]">{alert.title}</h2>
              <p className="mt-1 text-sm text-[#5B6475]">{alert.detail}</p>
            </div>
            <Database className="h-5 w-5 shrink-0 text-[#72571F]" aria-hidden="true" />
          </div>
          <ul className="mt-4 space-y-2">
            {alert.evidence.map((record, index) => (
              <li key={`${record.fileName}-${record.rowNumber}-${index}`} className="rounded-lg bg-[#FAF6EF] px-3 py-2 text-sm text-[#1F2A44]">
                <span className="font-semibold">{record.fileName} Â· Row {record.rowNumber}</span>
                <span className="mt-1 block break-words text-xs leading-5 text-[#5B6475]">{Object.entries(record.data).map(([field, value]) => `${field}: ${value}`).join(" Â· ")}</span>
              </li>
            ))}
          </ul>
          <Link href={`/alerts?alert=${encodeURIComponent(alert.id)}`} className="mt-4 inline-flex min-h-10 items-center gap-1 text-sm font-bold text-[#72571F] underline underline-offset-2">
            Open alert details <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>
      ))}
    </div>
  );
}
