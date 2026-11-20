"use client";

import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { ApiError, checkout, getBillingMe, type BillingMe } from "@/lib/api";
import { resetBusiness } from "@/hooks/useBusiness";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import Button from "@/components/Button";
import Skeleton from "@/components/Skeleton";

const FREE_VS_PRO: Array<{ label: string; free: string; pro: string }> = [
  { label: "Uploads per month", free: "5", pro: "100" },
  { label: "Max rows per file", free: "10,000", pro: "200,000" },
  { label: "Agent questions per day", free: "20 (planned)", pro: "500 (planned)" },
];

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    getBillingMe()
      .then((result) => { setBilling(result); setError(null); })
      .catch((reason: unknown) => setError(reason instanceof ApiError ? reason.message : "Unable to load your plan."));
  }, []);

  useEffect(() => { load(); }, [load]);

  const { run: upgrade, loading: upgrading } = useAsyncAction(async () => {
    setNotice(null);
    try {
      const result = await checkout();
      resetBusiness();                                         // so the Sidebar badge picks up the new plan
      setNotice(`Test payment complete. Your plan is now Pro, through ${new Date(result.plan_expires_at).toLocaleDateString()}.`);
      load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "The test payment could not be completed.");
    }
  });

  return (
    <div className="max-w-3xl space-y-6 pb-12">
      <header>
        <h1 className="text-2xl font-bold text-[#1F2A44] sm:text-3xl">Billing</h1>
        <p className="mt-1 text-sm text-[#5B6475]">Your plan, usage this month, and the Free vs Pro limits.</p>
      </header>

      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert">{error}</p>}
      {notice && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" role="status">{notice}</p>}
      {!billing && !error && (
        <div className="space-y-3 rounded-2xl border border-[#2D3D60] bg-[#1F2A44] p-5 sm:p-6" role="status" aria-label="Loading your plan">
          <Skeleton className="h-6 w-32 bg-[#2D3D60]" />
          <Skeleton className="h-8 w-24 bg-[#2D3D60]" />
          <Skeleton className="h-2 w-full bg-[#2D3D60]" />
        </div>
      )}

      {billing && (
        <>
          <section className="rounded-2xl border border-[#2D3D60] bg-[#1F2A44] p-5 text-[#E8DCC8] shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-[#C6A75E]">Current plan</p>
                <p className="mt-1 text-2xl font-extrabold text-white">{billing.plan === "pro" ? "Pro" : "Free"}</p>
                {billing.plan_expires_at && (
                  <p className="mt-1 text-xs text-[#C6A75E]">Through {new Date(billing.plan_expires_at).toLocaleDateString()}</p>
                )}
              </div>
              {billing.plan !== "pro" && (
                <Button variant="gold" loading={upgrading} onClick={() => void upgrade()}>
                  Upgrade (test payment - demo)
                </Button>
              )}
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between text-xs text-[#C6A75E]">
                <span>Uploads used this month</span>
                <span>{billing.usage.uploads_this_month} / {billing.limits.uploads_per_month}</span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#131A2B]">
                <div
                  className="h-full rounded-full bg-[#C6A75E]"
                  style={{
                    width: `${Math.min(100, (billing.usage.uploads_this_month / billing.limits.uploads_per_month) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[#E8DCC8] bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-sm font-bold text-[#1F2A44]">Free vs Pro</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#D5C3A5] text-[11px] font-bold uppercase tracking-wide text-[#5B6475]">
                    <th className="py-2 pr-4"></th>
                    <th className="py-2 pr-4">Free</th>
                    <th className="py-2 pr-4">Pro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8DCC8]">
                  {FREE_VS_PRO.map((row) => (
                    <tr key={row.label}>
                      <td className="py-2 pr-4 font-semibold text-[#1F2A44]">{row.label}</td>
                      <td className="py-2 pr-4">{row.free}</td>
                      <td className="py-2 pr-4 font-bold text-[#1F2A44]">
                        <span className="inline-flex items-center gap-1">
                          <Check className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" /> {row.pro}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-[#5B6475]">
              This is a demo. &quot;Upgrade&quot; runs a test payment only — no real money moves and no real gateway is called.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
