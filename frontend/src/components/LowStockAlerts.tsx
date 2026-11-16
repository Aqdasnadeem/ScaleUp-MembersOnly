"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getInventoryAlerts } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { useBusiness } from "@/hooks/useBusiness";
import type { InventoryAlertsResponse } from "@/lib/inventory";

export default function LowStockAlerts() {
  const { business } = useBusiness();
  const [data, setData] = useState<InventoryAlertsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getInventoryAlerts()
      .then((result) => { if (active) setData(result); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load inventory alerts.");
      });
    return () => { active = false; };
  }, []);

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1B2540] sm:text-3xl">Low stock and stockout alerts</h1>
          <p className="mt-1 text-sm text-[#46516A]">Products needing attention, based on their latest inventory snapshots.</p>
        </div>
        <Link href="/upload" className="inline-flex min-h-11 items-center rounded-xl bg-[#1B2540] px-5 py-3 text-sm font-bold text-[#F7F3EC] hover:bg-[#293655] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#72571F]">
          Upload inventory
        </Link>
      </header>
      <section className="rounded-2xl border border-[#354261] bg-[#1B2540] p-5 text-[#F7F3EC] shadow-sm sm:p-6" aria-labelledby="stock-alert-heading">
        <h2 id="stock-alert-heading" className="text-lg font-bold">Stock alerts</h2>
        {data && <p className="mt-1 text-sm text-[#D8DCE6]">Business low-stock threshold: {data.threshold} units. Zero stock is always a stockout.</p>}
        {error ? (
          <p className="mt-5 rounded-xl border border-[#E8A6A6] p-4 text-sm" role="alert">Unable to load inventory alerts: {error}</p>
        ) : !data ? (
          <p className="mt-5 text-sm" role="status">Loading inventory alerts…</p>
        ) : !data.has_inventory ? (
          <p className="mt-5 text-sm">No inventory snapshots found. Upload inventory data to see stock alerts.</p>
        ) : data.alerts.length === 0 ? (
          <p className="mt-5 text-sm">No low-stock or stockout alerts in the latest snapshots.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[#53617A]">
            {data.alerts.map((item) => (
              <li key={item.product_id}>
                <Link
                  href={`/analytics/inventory/${item.product_id}`}
                  className="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-lg px-2 py-4 hover:bg-[#293655] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F7F3EC]"
                >
                  <span className="min-w-0">
                    <span className="block font-bold text-[#F7F3EC]">{item.product_name}</span>
                    <span className="block text-xs text-[#D8DCE6]">{item.product_key} · Snapshot {formatDate(item.snapshot_date, business?.date_format)}</span>
                  </span>
                  <span className="flex items-center gap-3 text-sm">
                    <span>{item.stock_quantity} units</span>
                    <span className="rounded-full border border-[#C9A45C] px-3 py-1 font-bold text-[#F7F3EC]">
                      {item.status === "stockout" ? "Stockout" : "Low stock"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
