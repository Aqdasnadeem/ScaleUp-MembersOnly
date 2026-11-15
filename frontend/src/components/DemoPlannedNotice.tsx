"use client";

import { usePathname } from "next/navigation";

export function DemoPlannedNotice() {
  const pathname = usePathname();
  if (!pathname.startsWith("/demo/")) return null;
  return (
    <p className="mb-4 rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-muted">
      Demo data. This feature is planned for FYP-2.
    </p>
  );
}
