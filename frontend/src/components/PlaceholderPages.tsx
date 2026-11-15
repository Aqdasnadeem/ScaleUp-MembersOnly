import Link from "next/link";

export function NoDataYet({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-[#1F2A44]">{title}</h1>
      <p className="text-base text-[#5B6475]">No data yet. Upload your files to get started.</p>
      <Link href="/upload" className="inline-flex min-h-11 items-center rounded-xl bg-[#1F2A44] px-5 py-3 text-sm font-bold text-white hover:bg-[#2B3A5E]">
        Upload your files
      </Link>
    </div>
  );
}

export function PlannedFeature({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-[#1F2A44]">{title}</h1>
      <p className="text-base text-[#5B6475]">This feature is planned for FYP-2.</p>
      <Link href="/dashboard" className="inline-flex min-h-11 items-center rounded-xl border border-[#1F2A44] px-5 py-3 text-sm font-bold text-[#1F2A44]">
        Back to dashboard
      </Link>
    </div>
  );
}
