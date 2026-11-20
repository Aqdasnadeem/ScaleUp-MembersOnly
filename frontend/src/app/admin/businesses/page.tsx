"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, adminCreateBusiness, adminListBusinesses, type AdminBusiness } from "@/lib/api";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import Button from "@/components/Button";
import Skeleton from "@/components/Skeleton";

const PAGE_SIZE = 20;

export default function AdminBusinessesPage() {
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<{ total: number; items: AdminBusiness[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState("");

  const load = useCallback(() => {
    adminListBusinesses({ q, limit: PAGE_SIZE, offset })
      .then((result) => { setPage(result); setError(null); })
      .catch((reason: unknown) => setError(reason instanceof ApiError ? reason.message : "Unable to load businesses."));
  }, [q, offset]);

  useEffect(() => { load(); }, [load]);

  const { run: submitCreate, loading: creating } = useAsyncAction(async () => {
    setCreateError("");
    try {
      await adminCreateBusiness(newName.trim());
      setNewName("");
      setOffset(0);
      load();
    } catch (reason) {
      setCreateError(reason instanceof ApiError ? reason.message : "Unable to create the business.");
    }
  });

  return (
    <div className="space-y-6 pb-12">
      <header>
        <h1 className="text-2xl font-bold text-[#1F2A44] sm:text-3xl">Businesses</h1>
        <p className="mt-1 text-sm text-[#5B6475]">Search, create, suspend/reactivate, and set the plan.</p>
      </header>

      <section className="rounded-2xl border border-[#E8DCC8] bg-[#FAF6EF] p-5 shadow-sm sm:p-6">
        <h2 className="text-sm font-bold text-[#1F2A44]">Create a business</h2>
        <form onSubmit={(e) => { e.preventDefault(); void submitCreate(); }} className="mt-3 flex flex-wrap gap-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Business name"
            disabled={creating}
            className="min-h-10 flex-1 rounded-xl border border-[#D5C3A5] bg-white px-4 text-sm disabled:opacity-60"
          />
          <Button type="submit" loading={creating} disabled={!newName.trim()}>
            Create
          </Button>
        </form>
        {createError && <p className="mt-2 text-sm text-rose-700" role="alert">{createError}</p>}
      </section>

      <section className="rounded-2xl border border-[#E8DCC8] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setOffset(0); }}
            placeholder="Search by business name…"
            className="min-h-10 flex-1 rounded-xl border border-[#D5C3A5] px-4 text-sm"
          />
        </div>

        {error && <p className="mt-4 text-sm text-rose-700" role="alert">{error}</p>}
        {!page && !error && (
          <div className="mt-4 space-y-2" role="status" aria-label="Loading businesses">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        )}

        {page && (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#D5C3A5] text-[11px] font-bold uppercase tracking-wide text-[#5B6475]">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Plan</th>
                    <th className="py-2 pr-4">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8DCC8]">
                  {page.items.map((business) => (
                    <tr key={business.business_id}>
                      <td className="py-2 pr-4">
                        <Link href={`/admin/businesses/${business.business_id}`} className="font-bold text-[#1F2A44] underline underline-offset-2 hover:text-[#72571F]">
                          {business.business_name}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">
                        <span className={business.status === "suspended" ? "font-bold text-rose-700" : "text-emerald-700"}>
                          {business.status}
                        </span>
                      </td>
                      <td className="py-2 pr-4">{business.plan}</td>
                      <td className="py-2 pr-4 text-xs text-[#5B6475]">{new Date(business.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {page.items.length === 0 && (
                    <tr><td colSpan={4} className="py-4 text-sm text-[#5B6475]">No businesses match.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-between text-sm text-[#5B6475]">
              <span>{page.total} total</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  className="rounded-lg border border-[#D5C3A5] px-3 py-1.5 font-bold disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={offset + PAGE_SIZE >= page.total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  className="rounded-lg border border-[#D5C3A5] px-3 py-1.5 font-bold disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
