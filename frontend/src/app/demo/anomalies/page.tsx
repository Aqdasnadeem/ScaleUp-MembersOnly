"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, RefreshCw } from "lucide-react";
import { fetchDashboardAlerts, type DashboardAlert } from "@/lib/demo-api";
import { DemoPlannedNotice } from "@/components/DemoPlannedNotice";

export default function AnomaliesPage() {
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAlerts = useCallback(async () => {
    try {
      setAlerts(await fetchDashboardAlerts());
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Alerts could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);
  const refreshAlerts = () => {
    setLoading(true);
    void loadAlerts();
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAlerts(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAlerts]);

  const filtered = useMemo(
    () => alerts.filter((alert) => category === "all" || alert.category === category),
    [alerts, category],
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <DemoPlannedNotice />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2A44]">Alerts and anomalies</h1>
          <p className="mt-1 text-sm leading-6 text-[#5B6475]">Live stock and expense alerts calculated from your uploaded records.</p>
        </div>
        <button type="button" onClick={refreshAlerts} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#D5C3A5] bg-white px-4 py-2 text-sm font-semibold text-[#1F2A44] disabled:opacity-60">
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
        </button>
      </header>

      <div className="flex flex-wrap gap-2" aria-label="Filter alerts">
        {["all", "inventory", "expenses"].map((item) => (
          <button key={item} type="button" onClick={() => setCategory(item)} aria-pressed={category === item} className={`min-h-10 rounded-lg border px-3 py-2 text-sm font-semibold capitalize ${category === item ? "border-[#1F2A44] bg-[#1F2A44] text-white" : "border-[#E8DCC8] bg-white text-[#1F2A44]"}`}>
            {item === "all" ? "All alerts" : item}
          </button>
        ))}
      </div>

      {loading && <p role="status" className="rounded-xl border border-[#E8DCC8] bg-white p-5 text-sm text-[#5B6475]">Loading alerts...</p>}
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><p>{error}</p><button type="button" onClick={refreshAlerts} className="mt-2 font-bold underline">Try again</button></div>}
      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[#D5C3A5] bg-[#FAF6EF] p-8 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-[#72571F]" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-bold text-[#1F2A44]">No alerts to review</h2>
          <p className="mt-1 text-sm text-[#5B6475]">Upload inventory or expenses with budget values to calculate alerts.</p>
          <Link href="/upload" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[#1F2A44] px-4 py-2 text-sm font-bold text-white">Upload data</Link>
        </div>
      )}
      {!loading && !error && filtered.length > 0 && (
        <ul className="space-y-3">
          {filtered.map((alert) => {
            const isHighSeverity = alert.type === "expense_over_budget"
              || (alert.type === "low_stock" && alert.evidence[0]?.data.current_stock === "0");
            return (
            <li key={alert.id}>
              <Link href={`/alerts?alert=${encodeURIComponent(alert.id)}`} className="block rounded-2xl border border-[#E8DCC8] bg-white p-5 shadow-sm transition hover:border-[#C6A75E] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#88682A]">
                <div className="flex flex-row items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#72571F]">{alert.category} Â· {alert.type === "low_stock" ? "Reorder alert" : "Budget alert"}</span>
                    <h2 className="mt-1 break-words text-base font-bold text-[#1F2A44]">{alert.title}</h2>
                    <p className="mt-1 text-sm leading-6 text-[#5B6475]">{alert.detail}</p>
                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-[#72571F]">View linked records <ArrowRight className="h-4 w-4" aria-hidden="true" /></span>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold ${isHighSeverity ? "border-rose-200 bg-rose-50 text-rose-800" : "border-[#D5C3A5] bg-[#F7EFCF] text-[#1F2A44]"}`}>
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    {isHighSeverity ? "High severity" : "Review"}
                  </span>
                </div>
              </Link>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
