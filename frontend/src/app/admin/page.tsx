"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Users, AlertTriangle, Activity } from "lucide-react";
import { ApiError, adminListJobs, adminOverview, type AdminJob, type AdminOverview } from "@/lib/api";
import MetricCard from "@/components/MetricCard";
import Skeleton from "@/components/Skeleton";

export default function AdminOverviewPage() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [jobs, setJobs] = useState<AdminJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([adminOverview(), adminListJobs(10)])
      .then(([overviewResult, jobsResult]) => {
        if (!active) return;
        setOverview(overviewResult);
        setJobs(jobsResult.items);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof ApiError ? reason.message : "Unable to load the admin overview.");
      });
    return () => { active = false; };
  }, []);

  const totalBusinesses = overview
    ? Object.values(overview.businesses_by_status).reduce((sum, n) => sum + n, 0)
    : 0;
  const proBusinesses = overview?.businesses_by_plan.pro ?? 0;
  const suspendedBusinesses = overview?.businesses_by_status.suspended ?? 0;
  const jobsLast7Days = overview
    ? Object.values(overview.jobs_last_7_days).reduce((sum, n) => sum + n, 0)
    : 0;

  return (
    <div className="space-y-6 pb-12">
      <header>
        <h1 className="text-2xl font-bold text-[#1F2A44] sm:text-3xl">Platform overview</h1>
        <p className="mt-1 text-sm text-[#5B6475]">Counts only — no business, customer or feedback rows.</p>
      </header>

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert">
          Unable to load the overview: {error}
        </p>
      )}

      {!overview && !error && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" role="status" aria-label="Loading overview">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
        </div>
      )}

      {overview && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard title="Businesses" value={totalBusinesses} icon={Building2} subtitle={`${suspendedBusinesses} suspended`} />
            <MetricCard title="Pro plan" value={proBusinesses} icon={Activity} subtitle={`of ${totalBusinesses} businesses`} />
            <MetricCard title="Users" value={overview.users_count} icon={Users} />
            <MetricCard title="Failed jobs" value={overview.failed_jobs} icon={AlertTriangle} subtitle={`${jobsLast7Days} jobs in the last 7 days`} />
          </div>

          <section className="rounded-2xl border border-[#2D3D60] bg-[#1F2A44] p-5 text-[#E8DCC8] shadow-sm sm:p-6">
            <h2 className="text-lg font-bold">Jobs by status (last 7 days)</h2>
            {Object.keys(overview.jobs_last_7_days).length === 0 ? (
              <p className="mt-3 text-sm text-[#C6A75E]">No ingestion jobs in the last 7 days.</p>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-3">
                {Object.entries(overview.jobs_last_7_days).map(([status, count]) => (
                  <li key={status} className="rounded-full border border-[#C6A75E]/40 bg-[#131A2B] px-4 py-1.5 text-sm">
                    <span className="font-bold text-[#C6A75E]">{count}</span> {status}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <section className="rounded-2xl border border-[#E8DCC8] bg-[#FAF6EF] p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-[#1F2A44]">Recent jobs (all businesses)</h2>
          <div className="flex gap-3 text-sm font-bold text-[#72571F] underline underline-offset-2">
            <Link href="/admin/businesses">Businesses</Link>
            <Link href="/admin/users">Users</Link>
          </div>
        </div>
        {!jobs ? (
          <div className="mt-4 space-y-2" role="status" aria-label="Loading recent jobs">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        ) : jobs.length === 0 ? (
          <p className="mt-4 text-sm text-[#5B6475]">No ingestion jobs yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#D5C3A5] text-[11px] font-bold uppercase tracking-wide text-[#5B6475]">
                  <th className="py-2 pr-4">Business</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Rows</th>
                  <th className="py-2 pr-4">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DCC8]">
                {jobs.map((job) => (
                  <tr key={job.job_id}>
                    <td className="py-2 pr-4 font-mono text-xs text-[#5B6475]">{job.business_id.slice(0, 8)}…</td>
                    <td className="py-2 pr-4">{job.upload_type}</td>
                    <td className="py-2 pr-4">
                      <span className={job.status === "failed" ? "font-bold text-rose-700" : ""}>{job.status}</span>
                      {job.error_message && <span className="block text-xs text-[#5B6475]">{job.error_message}</span>}
                    </td>
                    <td className="py-2 pr-4">{job.loaded_rows}/{job.total_rows}</td>
                    <td className="py-2 pr-4 text-xs text-[#5B6475]">{new Date(job.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
