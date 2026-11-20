"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ApiError, adminDeleteUser, adminListUsers, adminUpdateUser, type AdminUser } from "@/lib/api";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import Button from "@/components/Button";
import Skeleton from "@/components/Skeleton";

export default function AdminUserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  useEffect(() => {
    let active = true;
    // There is no GET /admin/users/{id}; find it on the first (unfiltered, large-enough) page.
    // Fine for an FYP-scale admin tool; a dedicated endpoint is an easy follow-up if the list grows.
    adminListUsers({ limit: 100 })
      .then((result) => {
        if (!active) return;
        const found = result.items.find((item) => item.user_id === userId);
        if (!found) { setError("User not found in the first 100 users."); return; }
        setUser(found);
        setEmail(found.email);
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof ApiError ? reason.message : "Unable to load this user."); });
    return () => { active = false; };
  }, [userId]);

  const { run: saveEmail, loading: savingEmail } = useAsyncAction(async () => {
    if (!user) return;
    setNotice(null);
    try {
      setUser(await adminUpdateUser(userId, { email: email.trim() }));
      setNotice("Email updated.");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Unable to save the email.");
    }
  });

  const { run: resetPassword, loading: resettingPassword } = useAsyncAction(async () => {
    if (!user || password.length < 8) return;
    setNotice(null);
    try {
      await adminUpdateUser(userId, { password });
      setPassword("");
      setNotice("Password reset.");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Unable to reset the password.");
    }
  });

  const { run: toggleActive, loading: togglingActive } = useAsyncAction(async () => {
    if (!user) return;
    setNotice(null);
    try {
      const updated = user.is_active ? await adminDeleteUser(userId) : await adminUpdateUser(userId, { is_active: true });
      setUser(updated);
      setConfirmDeactivate(false);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Unable to change this account's status.");
    }
  });

  if (error && !user) {
    return (
      <div className="space-y-4 pb-12">
        <Link href="/admin/users" className="inline-flex items-center gap-2 text-sm font-bold text-[#1F2A44] underline underline-offset-2">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All users
        </Link>
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert">{error}</p>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="max-w-2xl space-y-6 pb-12" role="status" aria-label="Loading user">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-2/3" />
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6 pb-12">
      <Link href="/admin/users" className="inline-flex items-center gap-2 text-sm font-bold text-[#1F2A44] underline underline-offset-2">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All users
      </Link>

      <header>
        <h1 className="text-2xl font-bold text-[#1F2A44] sm:text-3xl break-all">{user.email}</h1>
        <p className="mt-1 text-sm text-[#5B6475]">
          {user.role} · <span className={user.is_active ? "font-bold text-emerald-700" : "font-bold text-rose-700"}>{user.is_active ? "active" : "deactivated"}</span>
        </p>
        {user.business_id && (
          <Link href={`/admin/businesses/${user.business_id}`} className="mt-1 inline-block font-mono text-xs text-[#72571F] underline underline-offset-2">
            {user.business_id}
          </Link>
        )}
      </header>

      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert">{error}</p>}
      {notice && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" role="status">{notice}</p>}

      <section className="rounded-2xl border border-[#E8DCC8] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-sm font-bold text-[#1F2A44]">Email</h2>
        <form onSubmit={(e) => { e.preventDefault(); void saveEmail(); }} className="mt-3 flex flex-wrap gap-3">
          <input value={email} onChange={(e) => setEmail(e.target.value)} disabled={savingEmail} className="min-h-10 flex-1 rounded-xl border border-[#D5C3A5] px-4 text-sm disabled:opacity-60" />
          <Button type="submit" loading={savingEmail} disabled={!email.trim()}>Save</Button>
        </form>
      </section>

      <section className="rounded-2xl border border-[#E8DCC8] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-sm font-bold text-[#1F2A44]">Reset password</h2>
        <form onSubmit={(e) => { e.preventDefault(); void resetPassword(); }} className="mt-3 flex flex-wrap gap-3">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password (min 8 chars)" disabled={resettingPassword} className="min-h-10 flex-1 rounded-xl border border-[#D5C3A5] px-4 text-sm disabled:opacity-60" />
          <Button type="submit" loading={resettingPassword} disabled={password.length < 8}>Reset</Button>
        </form>
      </section>

      <section className="rounded-2xl border border-[#E8DCC8] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-sm font-bold text-[#1F2A44]">Account status</h2>
        {user.is_active ? (
          confirmDeactivate ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-sm font-bold text-rose-700">Deactivate this account?</span>
              <Button variant="dangerSolid" loading={togglingActive} onClick={() => void toggleActive()}>
                Yes, deactivate
              </Button>
              <button type="button" onClick={() => setConfirmDeactivate(false)} disabled={togglingActive} className="rounded-xl border border-[#D5C3A5] px-4 py-2 text-sm font-bold disabled:opacity-60">Cancel</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDeactivate(true)} className="mt-3 rounded-xl border border-rose-300 px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50">
              Deactivate
            </button>
          )
        ) : (
          <Button loading={togglingActive} onClick={() => void toggleActive()} className="mt-3">
            Reactivate
          </Button>
        )}
      </section>
    </div>
  );
}
