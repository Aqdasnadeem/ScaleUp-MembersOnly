"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ApiError, adminCreateUser, adminListUsers, type AdminUser } from "@/lib/api";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import Button from "@/components/Button";
import Skeleton from "@/components/Skeleton";

const PAGE_SIZE = 20;

function AdminUsersContent() {
  const searchParams = useSearchParams();
  const businessIdFilter = searchParams.get("business_id") ?? "";
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<{ total: number; items: AdminUser[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [businessId, setBusinessId] = useState(() => businessIdFilter);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [createError, setCreateError] = useState("");

  const load = useCallback(() => {
    adminListUsers({ businessId: businessIdFilter || undefined, limit: PAGE_SIZE, offset })
      .then((result) => { setPage(result); setError(null); })
      .catch((reason: unknown) => setError(reason instanceof ApiError ? reason.message : "Unable to load users."));
  }, [businessIdFilter, offset]);

  useEffect(() => { load(); }, [load]);

  const { run: submitCreate, loading: creating } = useAsyncAction(async () => {
    if (!businessId.trim() || !email.trim() || password.length < 8) return;
    setCreateError("");
    try {
      await adminCreateUser({ business_id: businessId.trim(), email: email.trim(), password });
      setEmail("");
      setPassword("");
      setOffset(0);
      load();
    } catch (reason) {
      setCreateError(reason instanceof ApiError ? reason.message : "Unable to create the user.");
    }
  });

  return (
    <div className="space-y-6 pb-12">
      <header>
        <h1 className="text-2xl font-bold text-[#1F2A44] sm:text-3xl">Users</h1>
        <p className="mt-1 text-sm text-[#5B6475]">Create a business user, deactivate one, or reset a password.</p>
      </header>

      <section className="rounded-2xl border border-[#E8DCC8] bg-[#FAF6EF] p-5 shadow-sm sm:p-6">
        <h2 className="text-sm font-bold text-[#1F2A44]">Create a business user</h2>
        <form onSubmit={(e) => { e.preventDefault(); void submitCreate(); }} className="mt-3 grid gap-3 sm:grid-cols-3">
          <input
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
            placeholder="Business ID (from the Businesses page)"
            disabled={creating}
            className="min-h-10 rounded-xl border border-[#D5C3A5] bg-white px-4 text-sm disabled:opacity-60 sm:col-span-3"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            disabled={creating}
            className="min-h-10 rounded-xl border border-[#D5C3A5] bg-white px-4 text-sm disabled:opacity-60"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 8 chars)"
            disabled={creating}
            className="min-h-10 rounded-xl border border-[#D5C3A5] bg-white px-4 text-sm disabled:opacity-60"
          />
          <Button type="submit" loading={creating} disabled={!businessId.trim() || !email.trim() || password.length < 8}>
            Create
          </Button>
        </form>
        {createError && <p className="mt-2 text-sm text-rose-700" role="alert">{createError}</p>}
        <Link href="/admin/businesses" className="mt-2 inline-block text-xs font-bold text-[#72571F] underline underline-offset-2">
          Browse businesses for an ID
        </Link>
      </section>

      <section className="rounded-2xl border border-[#E8DCC8] bg-white p-5 shadow-sm sm:p-6">
        {businessIdFilter && (
          <p className="mb-3 text-sm text-[#5B6475]">
            Filtered to business <span className="font-mono text-xs">{businessIdFilter}</span>.{" "}
            <Link href="/admin/users" className="font-bold text-[#72571F] underline underline-offset-2">Clear filter</Link>
          </p>
        )}
        {error && <p className="text-sm text-rose-700" role="alert">{error}</p>}
        {!page && !error && (
          <div className="space-y-2" role="status" aria-label="Loading users">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        )}

        {page && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#D5C3A5] text-[11px] font-bold uppercase tracking-wide text-[#5B6475]">
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Role</th>
                    <th className="py-2 pr-4">Active</th>
                    <th className="py-2 pr-4">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8DCC8]">
                  {page.items.map((user) => (
                    <tr key={user.user_id}>
                      <td className="py-2 pr-4">
                        <Link href={`/admin/users/${user.user_id}`} className="font-bold text-[#1F2A44] underline underline-offset-2 hover:text-[#72571F]">
                          {user.email}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">{user.role}</td>
                      <td className="py-2 pr-4">
                        <span className={user.is_active ? "font-bold text-emerald-700" : "font-bold text-rose-700"}>
                          {user.is_active ? "active" : "deactivated"}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-xs text-[#5B6475]">{new Date(user.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {page.items.length === 0 && (
                    <tr><td colSpan={4} className="py-4 text-sm text-[#5B6475]">No users found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-between text-sm text-[#5B6475]">
              <span>{page.total} total</span>
              <div className="flex gap-2">
                <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} className="rounded-lg border border-[#D5C3A5] px-3 py-1.5 font-bold disabled:opacity-40">
                  Previous
                </button>
                <button type="button" disabled={offset + PAGE_SIZE >= page.total} onClick={() => setOffset(offset + PAGE_SIZE)} className="rounded-lg border border-[#D5C3A5] px-3 py-1.5 font-bold disabled:opacity-40">
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

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[#5B6475]" role="status">Loading…</p>}>
      <AdminUsersContent />
    </Suspense>
  );
}
