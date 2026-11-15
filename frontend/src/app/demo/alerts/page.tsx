"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { fetchDashboardAlerts, type DashboardAlert } from "@/lib/demo-api";

function AlertDetails() {
  const searchParams = useSearchParams();
  const alertId = searchParams.get("alert") ?? "";
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setAlerts(await fetchDashboardAlerts());
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The alert could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);
  const retry = () => {
    setLoading(true);
    void load();
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const alert = alerts.find((item) => item.id === alertId);

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      <Link href="/anomalies" className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-[#1F2A44] underline underline-offset-2">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All alerts
      </Link>
      {loading && <p role="status" className="rounded-xl border border-[#E8DCC8] bg-white p-5 text-sm text-[#5B6475]">Loading alert details...</p>}
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><p>{error}</p><button type="button" onClick={retry} className="mt-2 inline-flex items-center gap-2 font-bold underline"><RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again</button></div>}
      {!loading && !error && !alert && (
        <section className="rounded-2xl border border-[#D5C3A5] bg-[#FAF6EF] p-6">
          <h1 className="text-xl font-bold text-[#1F2A44]">Alert not found</h1>
          <p className="mt-2 text-sm leading-6 text-[#5B6475]">This alert may have changed after your uploaded records were updated.</p>
        </section>
      )}
      {!loading && !error && alert && (
        <>
          <header className="rounded-2xl border border-[#D5C3A5] bg-white p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-[#72571F]">{alert.category} Â· {alert.type === "low_stock" ? "Reorder alert" : "Budget alert"}</p>
            <h1 className="mt-2 text-2xl font-bold text-[#1F2A44]">{alert.title}</h1>
            <p className="mt-2 text-sm leading-6 text-[#5B6475]">{alert.detail}</p>
          </header>
          <section aria-labelledby="alert-evidence-title" className="space-y-3">
            <h2 id="alert-evidence-title" className="text-lg font-bold text-[#1F2A44]">Linked evidence records</h2>
            {alert.evidence.length === 0 ? (
              <p className="rounded-xl border border-[#E8DCC8] bg-white p-5 text-sm text-[#5B6475]">No source rows are available for this alert.</p>
            ) : alert.evidence.map((record, index) => (
              <article key={`${record.fileName}-${record.rowNumber}-${index}`} className="rounded-xl border border-[#E8DCC8] bg-white p-5">
                <h3 className="text-sm font-bold text-[#1F2A44]">{record.fileName} Â· Row {record.rowNumber}</h3>
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  {Object.entries(record.data).map(([field, value]) => (
                    <div key={field} className="rounded-lg bg-[#FAF6EF] px-3 py-2">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-[#72571F]">{field.replaceAll("_", " ")}</dt>
                      <dd className="mt-0.5 break-words text-sm text-[#1F2A44]">{value || "â€”"}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

export default function AlertDetailsPage() {
  return (
    <Suspense fallback={<p role="status" className="p-6 text-sm text-[#5B6475]">Opening alert...</p>}>
      <AlertDetails />
    </Suspense>
  );
}
