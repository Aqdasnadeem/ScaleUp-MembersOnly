"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ApiError, adminDeleteBusiness, adminGetBusiness, adminUpdateBusiness, adminUpdatePlan, type AdminBusiness } from "@/lib/api";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import Button from "@/components/Button";
import Skeleton from "@/components/Skeleton";

export default function AdminBusinessDetailPage() {
  const { businessId } = useParams<{ businessId: string }>();
  const router = useRouter();
  const [business, setBusiness] = useState<AdminBusiness | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmSuspend, setConfirmSuspend] = useState(false);

  useEffect(() => {
    let active = true;
    adminGetBusiness(businessId)
      .then((result) => { if (active) { setBusiness(result); setName(result.business_name); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof ApiError ? reason.message : "Unable to load this business."); });
    return () => { active = false; };
  }, [businessId]);

  const { run: saveName, loading: savingName } = useAsyncAction(async () => {
    try {
      const updated = await adminUpdateBusiness(businessId, { business_name: name.trim() });
      setBusiness(updated);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Unable to save the name.");
    }
  });

  const { run: toggleStatus, loading: togglingStatus } = useAsyncAction(async () => {
    if (!business) return;
    try {
      const updated = business.status === "active"
        ? await adminDeleteBusiness(businessId)                               // soft delete = suspend
        : await adminUpdateBusiness(businessId, { status: "active" });
      setBusiness(updated);
      setConfirmSuspend(false);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Unable to change the status.");
    }
  });

  const { run: changePlan, loading: changingPlan } = useAsyncAction(async (plan: "free" | "pro") => {
    try {
      setBusiness(await adminUpdatePlan(businessId, plan));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Unable to change the plan.");
    }
  });

  if (error && !business) {
    return (
      <div className="space-y-4 pb-12">
        <Link href="/admin/businesses" className="inline-flex items-center gap-2 text-sm font-bold text-[#1F2A44] underline underline-offset-2">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All businesses
        </Link>
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert">{error}</p>
      </div>
    );
  }
  if (!business) {
    return (
      <div className="max-w-3xl space-y-6 pb-12" role="status" aria-label="Loading business">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-1/2" />
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6 pb-12">
      <Link href="/admin/businesses" className="inline-flex items-center gap-2 text-sm font-bold text-[#1F2A44] underline underline-offset-2">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All businesses
      </Link>

      <header>
        <h1 className="text-2xl font-bold text-[#1F2A44] sm:text-3xl">{business.business_name}</h1>
        <p className="mt-1 font-mono text-xs text-[#5B6475]">{business.business_id}</p>
      </header>

      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert">{error}</p>}

      <section className="rounded-2xl border border-[#E8DCC8] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-sm font-bold text-[#1F2A44]">Name</h2>
        <form onSubmit={(e) => { e.preventDefault(); void saveName(); }} className="mt-3 flex flex-wrap gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={savingName}
            className="min-h-10 flex-1 rounded-xl border border-[#D5C3A5] px-4 text-sm disabled:opacity-60"
          />
          <Button type="submit" loading={savingName} disabled={!name.trim()}>
            Save
          </Button>
        </form>
      </section>

      <section className="rounded-2xl border border-[#E8DCC8] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-sm font-bold text-[#1F2A44]">Status</h2>
        <p className="mt-1 text-sm text-[#5B6475]">
          Currently <span className={business.status === "suspended" ? "font-bold text-rose-700" : "font-bold text-emerald-700"}>{business.status}</span>.
          Suspending is a soft delete — nothing is removed and it can be reactivated.
        </p>
        {business.status === "active" ? (
          confirmSuspend ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-sm font-bold text-rose-700">Suspend this business and all its users?</span>
              <Button variant="dangerSolid" loading={togglingStatus} onClick={() => void toggleStatus()}>
                Yes, suspend
              </Button>
              <button type="button" onClick={() => setConfirmSuspend(false)} disabled={togglingStatus} className="rounded-xl border border-[#D5C3A5] px-4 py-2 text-sm font-bold disabled:opacity-60">
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmSuspend(true)} className="mt-3 rounded-xl border border-rose-300 px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50">
              Suspend
            </button>
          )
        ) : (
          <Button loading={togglingStatus} onClick={() => void toggleStatus()} className="mt-3">
            Reactivate
          </Button>
        )}
      </section>

      <section className="rounded-2xl border border-[#E8DCC8] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-sm font-bold text-[#1F2A44]">Plan</h2>
        <p className="mt-1 text-sm text-[#5B6475]">
          Currently <span className="font-bold text-[#1F2A44]">{business.plan}</span>
          {business.plan_expires_at && ` (expires ${new Date(business.plan_expires_at).toLocaleDateString()})`}.
        </p>
        <div className="mt-3 flex gap-3">
          <Button variant="secondary" loading={changingPlan} disabled={business.plan === "free"} onClick={() => void changePlan("free")}>
            Set Free
          </Button>
          <Button variant="gold" loading={changingPlan} disabled={business.plan === "pro"} onClick={() => void changePlan("pro")}>
            Set Pro
          </Button>
        </div>
      </section>

      <button type="button" onClick={() => router.push("/admin/users?business_id=" + business.business_id)} className="text-sm font-bold text-[#72571F] underline underline-offset-2">
        View this business&apos;s users
      </button>
    </div>
  );
}
