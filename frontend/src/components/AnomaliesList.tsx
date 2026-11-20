"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useBusiness } from "@/hooks/useBusiness";
import { getAnomalies, runAnomalyDetection } from "@/lib/api";
import type { AnomaliesResponse, Anomaly, AnomalyType } from "@/lib/anomalies";
import { formatDate } from "@/lib/date";
import Skeleton from "@/components/Skeleton";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import Button from "@/components/Button";

function AnomalyListSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading anomalies">
      {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl bg-[#354261]" />)}
    </div>
  );
}

type Range = { start: string; end: string };
type Filter = "all" | AnomalyType;

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function initialRange(): Range {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 89);
  return { start: localDate(start), end: localDate(end) };
}

function formatValue(value: number, unit: Anomaly["unit"], currency: string): string {
  if (unit === "units") return `${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(value)} units`;
  return new Intl.NumberFormat("en-PK", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

function EvidenceChart({ item, currency, dateFormat }: { item: Anomaly; currency: string; dateFormat: string }) {
  const points = item.evidence.map((point) => ({ ...point, timestamp: Date.parse(`${point.date}T00:00:00Z`) }));
  const displayDate = (timestamp: number) => formatDate(new Date(timestamp).toISOString().slice(0, 10), dateFormat);
  return (
    <div className="mt-4 border-t border-[#53617A] px-2 pt-4">
      <h3 className="font-bold">Evidence chart</h3>
      <p className="mt-1 text-sm text-[#D8DCE6]">{item.explanation}</p>
      <p className="mt-2 text-sm">Reference: {formatValue(item.baseline, item.unit, currency)}; observed: {formatValue(item.value, item.unit, currency)}.</p>
      <div className="mt-4 h-72 w-full" role="img" aria-label={`Evidence for ${item.metric}; recorded values are listed in the table below.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="#53617A" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="timestamp" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={displayDate} tick={{ fill: "#F7F3EC", fontSize: 12 }} minTickGap={24} />
            <YAxis tick={{ fill: "#F7F3EC", fontSize: 12 }} width={65} />
            <ReferenceLine y={item.baseline} stroke="#F7F3EC" strokeDasharray="4 4" />
            <Tooltip labelFormatter={(value) => displayDate(Number(value))} formatter={(value) => formatValue(Number(value), item.unit, currency)} contentStyle={{ backgroundColor: "#F7F3EC", color: "#1B2540", border: "1px solid #C9A45C", borderRadius: 10 }} />
            <Line type="linear" dataKey="value" name="Recorded value" stroke="#C9A45C" strokeWidth={3} dot={{ r: 4, fill: "#C9A45C" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-[#D8DCE6]">The dashed line is the comparison reference.</p>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold">View evidence values</summary>
        <table className="mt-3 w-full text-left">
          <caption className="sr-only">Evidence values for {item.metric}</caption>
          <thead><tr className="border-b border-[#8290A8]"><th scope="col" className="py-2">Date</th><th scope="col" className="py-2 text-right">Recorded value</th></tr></thead>
          <tbody>{item.evidence.map((point, index) => <tr key={`${point.date}-${index}`} className="border-b border-[#53617A]"><td className="py-2">{formatDate(point.date, dateFormat)}</td><td className="py-2 text-right">{formatValue(point.value, item.unit, currency)}</td></tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}

function AnomalyRow({ item, currency, dateFormat }: { item: Anomaly; currency: string; dateFormat: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <li className="rounded-2xl border border-[#354261] bg-[#1B2540] p-4 text-[#F7F3EC] sm:p-5">
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}
        className="flex min-h-11 w-full flex-wrap items-center justify-between gap-4 rounded-lg px-2 py-2 text-left hover:bg-[#293655] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F7F3EC]">
        <span>
          <span className="block text-xs font-semibold uppercase tracking-wide text-[#D8DCE6]">{item.type} · {formatDate(item.date, dateFormat)}</span>
          <span className="mt-1 block font-bold">{item.metric}</span>
          <span className="mt-1 block text-sm">Observed: {formatValue(item.value, item.unit, currency)}</span>
        </span>
        <span className="text-sm font-bold">{item.change_percent > 0 ? "+" : ""}{item.change_percent.toFixed(1)}% <span className="ml-2">{expanded ? "Hide evidence" : "View evidence"}</span></span>
      </button>
      {expanded && <EvidenceChart item={item} currency={currency} dateFormat={dateFormat} />}
    </li>
  );
}

function Results({ range, filter, currency, dateFormat, onLoadingChange }: { range: Range; filter: Filter; currency: string; dateFormat: string; onLoadingChange?: (loading: boolean) => void }) {
  const [data, setData] = useState<AnomaliesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    onLoadingChange?.(true);
    getAnomalies(range.start, range.end)
      .then((result) => { if (active) setData(result); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load anomalies."); })
      .finally(() => { if (active) onLoadingChange?.(false); });
    return () => { active = false; };
  }, [range.start, range.end, onLoadingChange]);

  if (error) return <p className="rounded-xl border border-[#8B2F2F] bg-white p-4 text-sm text-[#8B2F2F]" role="alert">Unable to load anomalies: {error}</p>;
  if (!data) return <AnomalyListSkeleton />;
  const filtered = data.anomalies.filter((item) => filter === "all" || item.type === filter);
  if (!filtered.length) return <p className="rounded-xl border border-[#D5C3A5] bg-white p-5 text-sm text-[#1B2540]">No anomalies found for this type and date range. Anomalies require sufficient recorded comparison data.</p>;
  return <ul className="space-y-3">{filtered.map((item) => <AnomalyRow key={item.id} item={item} currency={currency} dateFormat={dateFormat} />)}</ul>;
}

export default function AnomaliesList() {
  const { business, loading, error } = useBusiness();
  const [range, setRange] = useState<Range>(initialRange);
  const [draft, setDraft] = useState<Range>(range);
  const [filter, setFilter] = useState<Filter>("all");
  const [rangeError, setRangeError] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const [detectError, setDetectError] = useState("");
  const [resultsLoading, setResultsLoading] = useState(false);

  const { run: runDetection, loading: detecting } = useAsyncAction(async () => {
    setDetectError("");
    try {
      await runAnomalyDetection();
      setRefreshToken((current) => current + 1);
    } catch (reason) {
      setDetectError(reason instanceof Error ? reason.message : "Unable to run detection.");
    }
  });

  function applyRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.start || !draft.end || draft.start > draft.end) {
      setRangeError("Choose a valid start and end date.");
      return;
    }
    setRangeError("");
    setRange(draft);
  }

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-[#1B2540] sm:text-3xl">Anomalies</h1>
          <p className="mt-1 text-sm text-[#46516A]">Explore unusual changes and the recorded evidence behind them.</p></div>
        <div className="flex flex-wrap gap-3">
          <Button loading={detecting} onClick={() => void runDetection()}>Run detection</Button>
          <Link href="/upload" className="inline-flex min-h-11 items-center rounded-xl bg-[#1B2540] px-5 py-3 text-sm font-bold text-[#F7F3EC] hover:bg-[#293655]">Upload data</Link>
        </div>
      </header>
      {detectError && <p role="alert" className="text-sm text-[#8B2F2F]">{detectError}</p>}
      <p className="text-sm text-[#46516A]">Local on-demand comparisons flag changes of at least 50%; this is not the official scheduled anomaly job. A zero reference or insufficient history cannot produce a percentage.</p>
      <form onSubmit={applyRange} className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold text-[#1B2540]">From<input type="date" required min="2000-01-01" value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} className="mt-1 block rounded-lg border border-[#8290A8] bg-white px-3 py-2" /></label>
        <label className="text-sm font-semibold text-[#1B2540]">To<input type="date" required min="2000-01-01" value={draft.end} onChange={(event) => setDraft({ ...draft, end: event.target.value })} className="mt-1 block rounded-lg border border-[#8290A8] bg-white px-3 py-2" /></label>
        <button type="submit" disabled={resultsLoading} className="min-h-11 rounded-lg bg-[#1B2540] px-4 py-2 text-sm font-bold text-[#F7F3EC] disabled:opacity-60 disabled:cursor-wait">Apply dates</button>
      </form>
      {rangeError && <p role="alert" className="text-sm text-[#8B2F2F]">{rangeError}</p>}
      <div className="flex flex-wrap gap-2" aria-label="Filter anomalies by type">
        {(["all", "sales", "expenses", "inventory"] as const).map((type) => (
          <button key={type} type="button" aria-pressed={filter === type} onClick={() => setFilter(type)}
            className={`min-h-11 rounded-lg border px-4 py-2 text-sm font-semibold capitalize ${filter === type ? "border-[#1B2540] bg-[#1B2540] text-[#F7F3EC]" : "border-[#8290A8] bg-white text-[#1B2540]"}`}>
            {type === "all" ? "All types" : type}
          </button>
        ))}
      </div>
      {loading ? <AnomalyListSkeleton />
        : error ? <p role="alert" className="text-sm text-[#8B2F2F]">Unable to load business settings.</p>
        : !business ? <p className="text-sm text-[#1B2540]">Sign in to view anomalies.</p>
        : <Results key={`${range.start}:${range.end}:${refreshToken}`} range={range} filter={filter} currency={business.currency} dateFormat={business.date_format} onLoadingChange={setResultsLoading} />}
    </div>
  );
}
