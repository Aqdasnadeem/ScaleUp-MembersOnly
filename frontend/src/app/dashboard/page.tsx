"use client";

import Link from "next/link";
import { useBusiness } from "@/hooks/useBusiness";

export default function DashboardPage() {
  const { business } = useBusiness();

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-[#1F2A44]">Dashboard</h1>
      {business && (
        <p className="text-sm text-[#5B6475]">
          {business.business_name} · Reporting currency: {business.currency}
        </p>
      )}
      <p className="text-base text-[#5B6475]">No data yet. Upload your files to get started.</p>
      <Link href="/upload" className="inline-flex min-h-11 items-center rounded-xl bg-[#1F2A44] px-5 py-3 text-sm font-bold text-white hover:bg-[#2B3A5E]">
        Upload your files
      </Link>
    </div>
  );
}
