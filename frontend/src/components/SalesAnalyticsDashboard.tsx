"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { CalendarDays, ShoppingBag, TrendingUp, Wallet } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useBusiness } from "@/hooks/useBusiness";
import {
  ApiError,
  getSalesAnalytics,
  type SalesAnalyticsResponse,
  type SalesTrendInterval,
} from "@/lib/api";
import { formatDate } from "@/lib/date";

interface DateRange {
  startDate: string;
  endDate: string;
}

interface SalesFilters extends DateRange {
  interval: SalesTrendInterval;
}

function localDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultDateRange(): DateRange {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  return { startDate: localDateValue(start), endDate: localDateValue(end) };
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPeriod(
  value: string,
  interval: SalesTrendInterval,
  dateFormat: string,
): string {
  if (interval === "daily") return formatDate(value, dateFormat);
  const [year, month] = value.split("-");
  return new Date(Date.UTC(Number(year), Number(month) - 1, 1)).toLocaleDateString("en", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function compactCurrency(value: number, currency: string): string {
  const compact = new Intl.NumberFormat("en-PK", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
  return `${currency} ${compact}`;
}

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof TrendingUp;
}) {
  return (
    <article className="rounded-2xl border border-[#354261] bg-[#1B2540] p-5 text-[#F7F3EC] shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#F7F3EC]">{title}</h2>
          <p className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">{value}</p>
        </div>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#C9A45C] text-[#1B2540]">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-[#D8DCE6]">{detail}</p>
    </article>
  );
}

export default function SalesAnalyticsDashboard() {
  const { business, loading: businessLoading, error: businessError } = useBusiness();
  const [draftRange, setDraftRange] = useState<DateRange>(defaultDateRange);
  const [draftInterval, setDraftInterval] = useState<SalesTrendInterval>("daily");
  const [filters, setFilters] = useState<SalesFilters>(() => ({
    ...defaultDateRange(),
    interval: "daily",
  }));
  const [data, setData] = useState<SalesAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);

  useEffect(() => {
    if (!business) return;

    let active = true;
    getSalesAnalytics(filters)
      .then((response) => {
        if (active) setData(response);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof ApiError || reason instanceof Error
              ? reason.message
              : "Unable to load sales analytics.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [business, filters]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draftRange.startDate || !draftRange.endDate) {
      setRangeError("Choose both a start date and an end date.");
      return;
    }
    if (draftRange.startDate > draftRange.endDate) {
      setRangeError("Start date must be on or before end date.");
      return;
    }

    setRangeError(null);
    setLoading(true);
    setError(null);
    setData(null);
    setFilters({ ...draftRange, interval: draftInterval });
  }

  const currency = business?.currency ?? "PKR";
  const dateFormat = business?.date_format ?? "DD/MM/YYYY";
  const chartData = data?.trend.map((point) => ({
    ...point,
    label: formatPeriod(point.period, filters.interval, dateFormat),
  })) ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-[#72571F]">
            {business?.business_name ?? "Business analytics"}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-[#1B2540] sm:text-3xl">Sales dashboard</h1>
          <p className="mt-1 text-sm leading-6 text-[#46516A]">
            Live sales performance for the selected date range.
          </p>
        </div>
        <Link
          href="/upload"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1B2540] px-5 py-3 text-sm font-bold text-[#F7F3EC] hover:bg-[#293655] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#72571F]"
        >
          <ShoppingBag className="h-4 w-4 text-[#C9A45C]" aria-hidden="true" />
          Upload sales data
        </Link>
      </header>

      <section
        className="rounded-2xl border border-[#D8CCB8] bg-[#F7F3EC] p-4 sm:p-5"
        aria-labelledby="sales-filters-heading"
      >
        <div className="mb-3 flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-[#72571F]" aria-hidden="true" />
          <h2 id="sales-filters-heading" className="text-base font-bold text-[#1B2540]">
            Date range
          </h2>
        </div>
        <form onSubmit={applyFilters} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
          <label className="block text-sm font-semibold text-[#1B2540]" htmlFor="sales-start-date">
            From
            <input
              id="sales-start-date"
              type="date"
              required
              value={draftRange.startDate}
              onChange={(event) => setDraftRange((current) => ({ ...current, startDate: event.target.value }))}
              className="mt-1 block min-h-11 w-full rounded-lg border border-[#8A754B] bg-white px-3 text-sm text-[#1B2540] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#72571F]"
            />
          </label>
          <label className="block text-sm font-semibold text-[#1B2540]" htmlFor="sales-end-date">
            To
            <input
              id="sales-end-date"
              type="date"
              required
              value={draftRange.endDate}
              onChange={(event) => setDraftRange((current) => ({ ...current, endDate: event.target.value }))}
              className="mt-1 block min-h-11 w-full rounded-lg border border-[#8A754B] bg-white px-3 text-sm text-[#1B2540] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#72571F]"
            />
          </label>
          <label className="block text-sm font-semibold text-[#1B2540]" htmlFor="sales-interval">
            Trend interval
            <select
              id="sales-interval"
              value={draftInterval}
              onChange={(event) => setDraftInterval(event.target.value as SalesTrendInterval)}
              className="mt-1 block min-h-11 w-full rounded-lg border border-[#8A754B] bg-white px-3 text-sm text-[#1B2540] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#72571F]"
            >
              <option value="daily">Daily</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#C9A45C] px-5 py-2 text-sm font-bold text-[#1B2540] hover:bg-[#D8B978] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B2540]"
          >
            Apply filters
          </button>
        </form>
        {rangeError && <p className="mt-3 text-sm font-semibold text-[#8B2F2F]" role="alert">{rangeError}</p>}
      </section>

      {businessError && (
        <p className="rounded-xl border border-[#8B2F2F] bg-white p-4 text-sm font-semibold text-[#8B2F2F]" role="alert">
          Unable to load your business details. Sign in again and retry.
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-[#8B2F2F] bg-white p-4 text-sm font-semibold text-[#8B2F2F]" role="alert">
          {error}
        </p>
      )}

      <section aria-label="Sales key performance indicators" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          title="Gross revenue"
          value={data ? formatCurrency(data.metrics.gross_revenue, currency) : loading && !businessError ? "Loading…" : "—"}
          detail="Total gross sales within the selected dates."
          icon={Wallet}
        />
        <MetricCard
          title="Orders"
          value={data ? data.metrics.orders.toLocaleString("en-PK") : loading && !businessError ? "Loading…" : "—"}
          detail="Distinct orders within the selected dates."
          icon={ShoppingBag}
        />
        <MetricCard
          title="Average order value (AOV)"
          value={data ? formatCurrency(data.metrics.average_order_value, currency) : loading && !businessError ? "Loading…" : "—"}
          detail="Gross revenue divided by the number of orders."
          icon={TrendingUp}
        />
      </section>

      <section
        className="rounded-2xl border border-[#354261] bg-[#1B2540] p-5 text-[#F7F3EC] shadow-sm sm:p-6"
        aria-labelledby="sales-trend-heading"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="sales-trend-heading" className="text-lg font-bold text-[#F7F3EC]">
              Gross revenue and order trend
            </h2>
            <p className="mt-1 text-sm text-[#D8DCE6]">
              {filters.interval === "daily" ? "Daily" : "Monthly"} performance from{" "}
              {formatDate(filters.startDate, dateFormat)} to {formatDate(filters.endDate, dateFormat)}.
            </p>
          </div>
          {loading && !businessLoading && !businessError && (
            <p className="text-sm font-semibold text-[#F7F3EC]" role="status">Loading sales data…</p>
          )}
        </div>

        {businessLoading ? (
          <p className="mt-5 rounded-xl border border-[#53617A] bg-[#222E4B] p-5 text-sm text-[#F7F3EC]" role="status">
            Loading business details…
          </p>
        ) : businessError ? (
          <p className="mt-5 rounded-xl border border-[#8B2F2F] bg-[#222E4B] p-5 text-sm text-[#F7F3EC]">
            Sales data is unavailable until your business details can be loaded.
          </p>
        ) : loading ? (
          <p className="mt-5 rounded-xl border border-[#53617A] bg-[#222E4B] p-5 text-sm text-[#F7F3EC]" role="status">
            Loading sales data…
          </p>
        ) : !data || chartData.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed border-[#8A754B] bg-[#222E4B] p-6 text-sm text-[#F7F3EC]">
            No sales records were found for this date range.
          </p>
        ) : (
          <div className="mt-5 h-80 w-full" role="img" aria-label="Gross revenue and orders trend chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
                <CartesianGrid stroke="#53617A" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#F7F3EC", fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: "#8290A8" }}
                  minTickGap={24}
                />
                <YAxis
                  yAxisId="revenue"
                  tick={{ fill: "#C9A45C", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: number) => compactCurrency(value, currency)}
                  width={72}
                />
                <YAxis
                  yAxisId="orders"
                  orientation="right"
                  tick={{ fill: "#D8DCE6", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={44}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "#F7F3EC", border: "1px solid #C9A45C", borderRadius: 10 }}
                  labelStyle={{ color: "#1B2540", fontWeight: 700 }}
                  formatter={(value, name) => [
                    String(name) === "Gross revenue"
                      ? formatCurrency(Number(value), currency)
                      : Number(value).toLocaleString("en-PK"),
                    String(name),
                  ]}
                />
                <Legend wrapperStyle={{ color: "#F7F3EC", paddingTop: 12 }} />
                <Line
                  yAxisId="revenue"
                  type="monotone"
                  dataKey="gross_revenue"
                  name="Gross revenue"
                  stroke="#C9A45C"
                  strokeWidth={3}
                  dot={{ r: 3, fill: "#C9A45C" }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  yAxisId="orders"
                  type="monotone"
                  dataKey="orders"
                  name="Orders"
                  stroke="#D8DCE6"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#D8DCE6" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
}
