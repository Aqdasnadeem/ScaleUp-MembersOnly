import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-20 text-center">
      <h1 className="text-3xl font-bold text-[#1F2A44]">Page not found</h1>
      <Link href="/dashboard" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-[#1F2A44] px-5 py-3 text-sm font-bold text-white">
        Back to Dashboard
      </Link>
    </div>
  );
}
