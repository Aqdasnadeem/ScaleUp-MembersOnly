"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Lightbulb, RefreshCw } from "lucide-react";
import { fetchDashboardAlerts, type DashboardAlert } from "@/lib/demo-api";

function recommendationFor(alert: DashboardAlert): { action: string; rationale: string } {
  if (alert.type === "low_stock") {
    const stock = alert.evidence[0]?.data.current_stock;
    const threshold = alert.evidence[0]?.data.min_threshold;
    return {
      action: `Review replenishment for ${alert.evidence[0]?.data.product_name ?? "this item"}.`,
      rationale: `The uploaded inventory records show ${stock ?? "an unknown quantity"} on hand against a reorder threshold of ${threshold ?? "not provided"}.`,
    };
  }
  return {
    action: "Review the affected expense category and its budget.",
    rationale: alert.detail,
  };
}

export default function RecommendationsPage() {
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRecommendations = useCallback(async () => {
    try {
      setAlerts(await fetchDashboardAlerts());
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Recommendations could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);
  const refreshRecommendations = () => {
    setLoading(true);
    void loadRecommendations();
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRecommendations(), 0);
    return () => window.clearTimeout(timer);
  }, [loadRecommendations]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2A44]">Recommendations</h1>
          <p className="mt-1 text-sm leading-6 text-[#5B6475]">Suggested follow-up actions based on your uploaded stock and expense records.</p>
        </div>
        <button type="button" onClick={refreshRecommendations} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#D5C3A5] bg-white px-4 py-2 text-sm font-semibold text-[#1F2A44] disabled:opacity-60">
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
        </button>
      </header>

      {loading && <p role="status" className="rounded-xl border border-[#E8DCC8] bg-white p-5 text-sm text-[#5B6475]">Preparing recommendations...</p>}
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><p>{error}</p><button type="button" onClick={refreshRecommendations} className="mt-2 font-bold underline">Try again</button></div>}
      {!loading && !error && alerts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[#D5C3A5] bg-[#FAF6EF] p-8 text-center">
          <Lightbulb className="mx-auto h-8 w-8 text-[#72571F]" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-bold text-[#1F2A44]">No recommendations yet</h2>
          <p className="mt-1 text-sm text-[#5B6475]">Upload inventory or expenses to get evidence-linked suggestions.</p>
          <Link href="/upload" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[#1F2A44] px-4 py-2 text-sm font-bold text-white">Upload data</Link>
        </div>
      )}
      {!loading && !error && alerts.length > 0 && (
        <ul className="space-y-4">
          {alerts.map((alert) => {
            const recommendation = recommendationFor(alert);
            const isHighPriority = alert.type === "expense_over_budget"
              || (alert.type === "low_stock" && alert.evidence[0]?.data.current_stock === "0");
            return (
              <li key={alert.id} className="rounded-2xl border border-[#E8DCC8] bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F7EFCF] text-[#72571F]"><Lightbulb className="h-5 w-5" aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wider text-[#72571F]">{alert.category} recommendation</p>
                        <h2 className="mt-1 break-words text-base font-bold text-[#1F2A44]">{alert.title}</h2>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold whitespace-nowrap ${isHighPriority ? "border-rose-200 bg-rose-50 text-rose-800" : "border-[#D5C3A5] bg-[#F7EFCF] text-[#1F2A44]"}`}>
                        {isHighPriority ? "High priority" : "Review"}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-[#1F2A44]">{recommendation.action}</p>
                    <p className="mt-1 text-sm leading-6 text-[#5B6475]">{recommendation.rationale}</p>
                    <Link href={`/alerts?alert=${encodeURIComponent(alert.id)}`} className="mt-4 inline-flex min-h-10 items-center gap-1 rounded-lg border border-[#D5C3A5] px-3 py-2 text-sm font-bold text-[#1F2A44] hover:bg-[#FAF6EF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#88682A]">
                      See supporting records <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
