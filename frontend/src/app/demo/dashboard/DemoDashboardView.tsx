"use client";

import Link from "next/link";
import {
  ArrowRight,
  AlertTriangle,
  BarChart3,
  FileText,
  MessageSquareText,
  PackageCheck,
  TrendingUp,
  UploadCloud,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type UploadCategory = "sales" | "inventory" | "expenses" | "feedback";

export interface DashboardResponse {
  metrics: {
    revenue: number;
    expenses: number;
    lowStockCount: number;
    totalOrders: number;
    inventoryValue: number;
  };
  monthlyRevenue: Array<{ month: string; revenue: number; expenses: number }>;
  inventoryLevels: Array<{
    sku: string;
    productName: string;
    currentStock: number;
    reorderThreshold: number;
  }>;
  expenseBreakdown: Array<{ category: string; amount: number; budget: number }>;
  lowStockItems: Array<{
    sku: string;
    productName: string;
    category: string;
    currentStock: number;
    reorderThreshold: number;
  }>;
  customerReviewSummary: {
    count: number;
    averageRating: number;
    positive: number;
    neutral: number;
    negative: number;
  };
  alerts: Array<{
    id: string;
    type: string;
    category: string;
    title: string;
    detail: string;
    evidence: Array<{ fileName: string; rowNumber: number; data: Record<string, string> }>;
  }>;
  datasets: Array<{
    id: string;
    category: UploadCategory;
    fileName: string;
    rows: number;
    uploadedAt: string;
  }>;
}

function formatCurrency(value: number): string {
  return `Rs ${value.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
}

function formatMonth(month: string): string {
  const [year, monthNumber] = month.split("-");
  const date = new Date(Date.UTC(Number(year), Number(monthNumber) - 1, 1));
  return date.toLocaleDateString("en", { month: "short", year: "2-digit", timeZone: "UTC" });
}

export default function DashboardPage({ previewData }: { previewData: DashboardResponse }) {
  const data = previewData;

  const hasSales = data.datasets.some((dataset) => dataset.category === "sales");
  const hasExpenses = data.datasets.some((dataset) => dataset.category === "expenses");
  const hasInventory = data.datasets.some((dataset) => dataset.category === "inventory");
  const hasReviews = data.datasets.some((dataset) => dataset.category === "feedback");
  const metrics = [
    { title: "Revenue", value: formatCurrency(data.metrics.revenue), note: hasSales ? `${data.metrics.totalOrders} orders` : "Upload a sales CSV", icon: TrendingUp, href: "/analytics/sales" },
    { title: "Expenses", value: formatCurrency(data.metrics.expenses), note: hasExpenses ? "Across your uploaded records" : "Upload an expenses CSV", icon: BarChart3, href: "/analytics/expenses" },
    { title: "Net profit", value: formatCurrency(data.metrics.revenue - data.metrics.expenses), note: "Revenue minus recorded expenses", icon: TrendingUp, href: "/analytics/sales" },
    { title: "Inventory", value: hasInventory ? formatCurrency(data.metrics.inventoryValue) : "No inventory", note: hasInventory ? `${data.inventoryLevels.length} items · ${data.metrics.lowStockCount} low stock` : "Upload an inventory CSV", icon: PackageCheck, href: "/analytics/inventory" },
    {
      title: "Customer reviews",
      value: hasReviews ? `${data.customerReviewSummary.count} reviews` : "No reviews",
      note: hasReviews
        ? `${data.customerReviewSummary.positive} positive · ${data.customerReviewSummary.neutral} neutral · ${data.customerReviewSummary.negative} negative`
        : "Upload customer feedback",
      icon: MessageSquareText,
      href: "/analytics/feedback",
    },
  ];
  const previewHref = (href: string) => `/demo${href}`;
  const dashboardActions = [
    {
      href: previewData ? previewHref("/upload") : "/upload",
      title: "Upload business data",
      description: "Add sales, inventory, expenses or customer reviews.",
      icon: UploadCloud,
    },
    {
      href: previewData ? previewHref("/agent") : "/agent",
      title: "Ask the assistant",
      description: "Get an answer and check the records behind it.",
      icon: MessageSquareText,
    },
    {
      href: previewData ? previewHref("/dashboard/reports") : "/dashboard/reports",
      title: "Generate a report",
      description: "Review your business figures in one place.",
      icon: FileText,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-[#72571F]">Business overview</p>
          <h1 className="mt-1 text-2xl font-bold text-[#1F2A44] sm:text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm leading-6 text-[#5B6475]">{previewData ? "Sample sales, expenses, inventory and customer reviews in one place." : "Your uploaded sales, expenses, inventory and customer reviews in one place."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/signup" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#1F2A44] px-4 py-2 text-sm font-bold text-white hover:bg-[#2B3A5E]">
            <UploadCloud className="h-4 w-4 text-[#E0C788]" aria-hidden="true" /> Start with your data
          </Link>
        </div>
      </header>

      <nav aria-label="Dashboard shortcuts" className="grid gap-3 md:grid-cols-3">
        {dashboardActions.map(({ href, title, description, icon: Icon }) => (
          <Link
            key={title}
            href={href}
            className="group flex min-h-28 items-start gap-3 rounded-2xl border border-[#D5C3A5] bg-white p-4 shadow-sm transition hover:border-[#88682A] hover:bg-[#FAF6EF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#88682A]"
          >
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1F2A44] text-[#E0C788]">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2 text-sm font-bold text-[#1F2A44]">
                {title}
                <ArrowRight className="h-4 w-4 shrink-0 text-[#72571F] transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </span>
              <span className="mt-1 block text-sm leading-5 text-[#5B6475]">{description}</span>
            </span>
          </Link>
        ))}
      </nav>

      {data.datasets.length === 0 && (
        <section className="rounded-2xl border border-[#D5C3A5] bg-[#FAF6EF] p-6 sm:p-8">
          <h2 className="text-xl font-bold text-[#1F2A44]">No data yet. Upload your first CSV to see your dashboard.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5B6475]">Your files are checked before saving and belong only to your account.</p>
          <Link href="/upload" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1F2A44] px-5 py-3 text-sm font-bold text-white">
            <UploadCloud className="h-4 w-4 text-[#E0C788]" aria-hidden="true" /> Upload data
          </Link>
        </section>
      )}

      <section aria-label="Business summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map(({ title, value, note, icon: Icon, href }) => (
          <Link
            key={title}
            href={previewData ? previewHref(href) : href}
            className="rounded-2xl border border-[#E8DCC8] bg-white p-5 shadow-sm transition hover:border-[#88682A] hover:bg-[#FAF6EF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#88682A]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[#5B6475]">{title}</h2>
                <p className="mt-2 text-2xl font-extrabold text-[#1F2A44]">{value}</p>
              </div>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#F7EFCF] text-[#72571F]">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-3 text-xs leading-5 text-[#5B6475]">{note}</p>
          </Link>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-[#E8DCC8] bg-white p-5 sm:p-6" aria-labelledby="sales-chart-heading">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 id="sales-chart-heading" className="text-lg font-bold text-[#1F2A44]">Sales</h2>
              <p className="mt-1 text-sm text-[#5B6475]">Monthly revenue from your uploaded records.</p>
            </div>
            <BarChart3 className="h-5 w-5 text-[#72571F]" aria-hidden="true" />
          </div>
          {data.monthlyRevenue.length > 0 ? (
            <div className="mt-5 h-72 w-full" role="img" aria-label="Monthly sales revenue chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthlyRevenue.map((point) => ({ ...point, month: formatMonth(point.month) }))} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="#E8DCC8" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: "#5B6475", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#5B6475", fontSize: 12 }} tickFormatter={(value: number) => value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}m` : `${Math.round(value / 1_000)}k`} width={48} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Bar dataKey="revenue" name="Revenue" fill="#1F2A44" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="mt-5 rounded-xl border border-dashed border-[#D5C3A5] bg-[#FAF6EF] p-6 text-sm text-[#5B6475]">Upload dated sales records to see your sales chart.</p>}
        </section>

        <section className="rounded-2xl border border-[#E8DCC8] bg-white p-5 sm:p-6" aria-labelledby="inventory-chart-heading">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 id="inventory-chart-heading" className="text-lg font-bold text-[#1F2A44]">Stock levels</h2>
              <p className="mt-1 text-sm text-[#5B6475]">Current quantity compared with each reorder threshold.</p>
            </div>
            <PackageCheck className="h-5 w-5 text-[#72571F]" aria-hidden="true" />
          </div>
          {data.inventoryLevels.length > 0 ? (
            <div className="mt-5 h-72 w-full" role="img" aria-label="Current inventory and reorder thresholds by item">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.inventoryLevels.slice(0, 8)} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="#E8DCC8" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="sku" tick={{ fill: "#5B6475", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#5B6475", fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="currentStock" name="In stock" fill="#1F2A44" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="reorderThreshold" name="Reorder threshold" fill="#C6A75E" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="mt-5 rounded-xl border border-dashed border-[#D5C3A5] bg-[#FAF6EF] p-6 text-sm text-[#5B6475]">Upload an inventory CSV to see stock levels.</p>}
        </section>

        <section className="rounded-2xl border border-[#E8DCC8] bg-white p-5 sm:p-6" aria-labelledby="expense-chart-heading">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 id="expense-chart-heading" className="text-lg font-bold text-[#1F2A44]">Spending by category</h2>
              <p className="mt-1 text-sm text-[#5B6475]">Actual spend and budget by category.</p>
            </div>
            <BarChart3 className="h-5 w-5 text-[#72571F]" aria-hidden="true" />
          </div>
          {data.expenseBreakdown.length > 0 ? (
            <div className="mt-5 h-72 w-full" role="img" aria-label="Expense actuals and budgets by category">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.expenseBreakdown} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="#E8DCC8" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="category" tick={{ fill: "#5B6475", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#5B6475", fontSize: 12 }} tickFormatter={(value: number) => `${Math.round(value / 1_000)}k`} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Bar dataKey="amount" name="Actual" fill="#1F2A44" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="budget" name="Budget" fill="#C6A75E" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="mt-5 rounded-xl border border-dashed border-[#D5C3A5] bg-[#FAF6EF] p-6 text-sm text-[#5B6475]">Upload expenses with budget values to see the category chart.</p>}
        </section>

        <section className="rounded-2xl border border-[#E8DCC8] bg-white p-5 sm:p-6" aria-labelledby="low-stock-heading">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="low-stock-heading" className="text-lg font-bold text-[#1F2A44]">Items to reorder</h2>
              <p className="mt-1 text-sm text-[#5B6475]">At or below the threshold in your inventory CSV.</p>
            </div>
            <PackageCheck className="h-5 w-5 text-[#72571F]" aria-hidden="true" />
          </div>
          {!hasInventory ? (
            <p className="mt-5 rounded-xl bg-[#FAF6EF] p-4 text-sm text-[#5B6475]">Upload an inventory CSV to check stock.</p>
          ) : data.lowStockItems.length === 0 ? (
            <p className="mt-5 rounded-xl bg-[#FAF6EF] p-4 text-sm text-[#374151]">No items are at or below their reorder threshold.</p>
          ) : (
            <ul className="mt-4 divide-y divide-[#E8DCC8]">
              {data.lowStockItems.map((item, index) => (
                <li key={`${item.sku}-${index}`} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#1F2A44]">{item.productName || item.sku}</p>
                    <p className="mt-0.5 text-xs text-[#5B6475]">{item.sku} · reorder at {item.reorderThreshold}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-[#D5C3A5] bg-[#F7EFCF] px-3 py-1 text-xs font-bold text-[#1F2A44]">
                    {item.currentStock} left
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-[#D5C3A5] bg-[#FAF6EF] p-5 sm:p-6" aria-labelledby="alerts-heading">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-[#72571F]" aria-hidden="true" />
          <h2 id="alerts-heading" className="text-lg font-bold text-[#1F2A44]">Stock and cost alerts</h2>
        </div>
        {data.alerts.length === 0 ? (
          <p className="mt-4 text-sm text-[#5B6475]">
            {hasInventory || hasExpenses
              ? "No inventory or expense budget alerts were found in your uploaded records."
              : "Upload inventory and expenses with budgets to check for alerts."}
          </p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {data.alerts.map((alert) => (
                <li key={alert.id} className="rounded-xl border border-[#E8DCC8] bg-white p-4">
                  {previewData ? (
                    <Link href={previewHref(`/alerts?alert=${encodeURIComponent(alert.id)}`)} className="block rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#88682A]">
                      <p className="text-sm font-bold text-[#1F2A44]">{alert.title}</p>
                      <p className="mt-1 text-sm leading-6 text-[#5B6475]">{alert.detail}</p>
                      <ul className="mt-2 space-y-1 text-xs text-[#5B6475]">
                        {alert.evidence.map((record) => (
                          <li key={`${record.fileName}-${record.rowNumber}`}>Evidence: {record.fileName}, row {record.rowNumber}</li>
                        ))}
                      </ul>
                    </Link>
                  ) : (
                  <Link href={`/alerts?alert=${encodeURIComponent(alert.id)}`} className="block rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#88682A]">
                    <p className="text-sm font-bold text-[#1F2A44]">{alert.title}</p>
                    <p className="mt-1 text-sm leading-6 text-[#5B6475]">{alert.detail}</p>
                    <span className="mt-2 inline-flex text-xs font-bold text-[#72571F] underline underline-offset-2">View alert evidence</span>
                  </Link>
                  )}
                </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#1F2A44] p-5 text-[#E8DCC8]">
        <div>
          <h2 className="text-lg font-bold text-white">Want to know why your numbers changed?</h2>
          <p className="mt-1 text-sm">Ask about profit changes, stock, customer reviews or a sales forecast.</p>
        </div>
        <Link href={previewData ? previewHref("/agent") : "/agent"} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#E0C788] px-4 py-2 text-sm font-bold text-[#1F2A44] hover:bg-white">
          <MessageSquareText className="h-4 w-4" aria-hidden="true" /> Ask the assistant
        </Link>
      </section>
    </div>
  );
}
