"use client";

import { useBusiness } from "@/hooks/useBusiness";

export default function ProfilePage() {
  const { business, loading, error } = useBusiness();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <p className="text-sm font-bold uppercase tracking-widest text-[#72571F]">Account</p>
        <h1 className="mt-1 text-2xl font-bold text-[#1F2A44] sm:text-3xl">Profile</h1>
      </header>
      <section className="rounded-2xl border border-[#E8DCC8] bg-white p-5 shadow-sm sm:p-6" aria-live="polite">
        {loading && <p role="status" className="text-sm text-[#5B6475]">Loading your profile...</p>}
        {error && <p role="alert" className="text-sm text-rose-700">Your profile could not be loaded. Try again later.</p>}
        {business && (
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-[#72571F]">Business name</dt>
              <dd className="mt-1 text-sm font-semibold text-[#1F2A44]">{business.business_name}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-[#72571F]">Currency</dt>
              <dd className="mt-1 text-sm font-semibold text-[#1F2A44]">{business.currency}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-[#72571F]">Date format</dt>
              <dd className="mt-1 text-sm font-semibold text-[#1F2A44]">{business.date_format}</dd>
            </div>
          </dl>
        )}
      </section>
    </div>
  );
}
