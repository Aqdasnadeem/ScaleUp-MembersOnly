"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getInventoryHistory } from "@/lib/api";
import { formatDate } from "@/lib/date";
import type { InventoryHistoryResponse } from "@/lib/inventory";

export default function InventoryHistoryChart({ productId, dateFormat }: { productId: string; dateFormat?: string }) {
  const [history, setHistory] = useState<InventoryHistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getInventoryHistory(productId)
      .then((result) => { if (active) setHistory(result); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load inventory history.");
      });
    return () => { active = false; };
  }, [productId]);

  const chartData = history?.snapshots.map((snapshot) => ({
    ...snapshot,
    timestamp: Date.parse(`${snapshot.snapshot_date}T00:00:00Z`),
  })) ?? [];
  const formatTimestamp = (value: number) => formatDate(new Date(value).toISOString().slice(0, 10), dateFormat);
  const singleTime = chartData[0]?.timestamp;
  const xDomain: [number | "dataMin", number | "dataMax"] = chartData.length === 1 && singleTime !== undefined
    ? [singleTime - 86400000, singleTime + 86400000]
    : ["dataMin", "dataMax"];

  return (
    <section className="rounded-2xl border border-[#354261] bg-[#1B2540] p-5 text-[#F7F3EC] shadow-sm sm:p-6" aria-labelledby="inventory-history-heading">
      <h2 id="inventory-history-heading" className="text-lg font-bold">Inventory change history</h2>
      <p className="mt-1 text-sm text-[#D8DCE6]">Stock levels on recorded snapshot dates, not individual stock transactions.</p>
      {error ? (
        <p className="mt-5 rounded-xl border border-[#E8A6A6] p-4 text-sm" role="alert">Unable to load inventory history: {error}</p>
      ) : !history ? (
        <p className="mt-5 text-sm" role="status">Loading inventory history…</p>
      ) : chartData.length === 0 ? (
        <p className="mt-5 text-sm">No inventory snapshots found for this product.</p>
      ) : (
        <>
          {chartData.length === 1 && <p className="mt-4 text-sm text-[#D8DCE6]">One snapshot is available. Upload another dated snapshot to see changes.</p>}
          <div className="mt-5 h-80 w-full" role="img" aria-label="Inventory stock levels by snapshot date. The data table follows the chart.">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="#53617A" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="timestamp" type="number" scale="time" domain={xDomain} tickFormatter={formatTimestamp} tick={{ fill: "#F7F3EC", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#8290A8" }} minTickGap={24} />
                <YAxis allowDecimals={false} tick={{ fill: "#F7F3EC", fontSize: 12 }} tickLine={false} axisLine={false} width={45} />
                <Tooltip labelFormatter={(value) => formatTimestamp(Number(value))} contentStyle={{ backgroundColor: "#F7F3EC", color: "#1B2540", border: "1px solid #C9A45C", borderRadius: 10 }} />
                <Line type="linear" dataKey="stock_quantity" name="Stock units" stroke="#C9A45C" strokeWidth={3} dot={{ r: 4, fill: "#C9A45C" }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F7F3EC]">View snapshot data</summary>
            <table className="mt-3 w-full text-left">
              <caption className="sr-only">Recorded inventory snapshot quantities</caption>
              <thead><tr className="border-b border-[#8290A8]"><th scope="col" className="py-2">Date</th><th scope="col" className="py-2">Stock units</th></tr></thead>
              <tbody>{history.snapshots.map((snapshot) => <tr key={snapshot.snapshot_date} className="border-b border-[#53617A]"><td className="py-2">{formatDate(snapshot.snapshot_date, dateFormat)}</td><td className="py-2">{snapshot.stock_quantity}</td></tr>)}</tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}
