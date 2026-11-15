"use client";

import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarDays,
  MessageSquareText,
  Package,
  Printer,
  Receipt,
  ShoppingCart,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  DEMO_AS_OF,
  formatCurrency,
  formatDate,
  itemsAtRisk,
  mockAnomalies,
  mockExpensesBreakdown,
  mockFeedback,
  mockInventory,
  mockMetrics,
  mockProducts,
  mockRecommendations,
  mockRevenueTrend,
  REVENUE_YTD,
  REVENUE_YTD_GROWTH,
  totalExpenseBudget,
  totalExpenses,
} from "@/lib/demo-data";
import { DemoPlannedNotice } from "@/components/DemoPlannedNotice";

interface ReportMetricProps {
  label: string;
  value: string;
  detail: string;
}

interface ReportSectionProps {
  title: string;
  description: string;
  icon: LucideIcon;
  className?: string;
  children: React.ReactNode;
}

function ReportMetric({ label, value, detail }: ReportMetricProps) {
  return (
    <div className="min-w-0 rounded-xl border border-[#E8DCC8] bg-white/80 p-4">
      <p className="text-xs font-semibold leading-5 text-muted">{label}</p>
      <p className="mt-2 break-words text-xl font-extrabold leading-tight tracking-tight text-navy sm:text-2xl">
        {value}
      </p>
      <p className="mt-1.5 break-words text-xs leading-5 text-muted">{detail}</p>
    </div>
  );
}

function ReportSection({
  title,
  description,
  icon: Icon,
  className = "",
  children,
}: ReportSectionProps) {
  return (
    <section className={`report-card min-w-0 rounded-2xl border border-[#E8DCC8] bg-[#FAF6EF] p-5 shadow-sm sm:p-6 ${className}`}>
      <div className="mb-5 flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#C6A75E]/40 bg-navy text-gold">
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="report-section-title break-words text-base font-bold leading-snug text-navy sm:text-lg">
            {title}
          </h2>
          <p className="mt-1 break-words text-xs leading-relaxed text-muted">
            {description}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

const revenueMonth = mockRevenueTrend[mockRevenueTrend.length - 1];
const octoberRevenue = mockProducts.reduce((total, product) => total + product.revenue, 0);
const octoberUnitsSold = mockProducts.reduce((total, product) => total + product.unitsSold, 0);
const positiveReviews = mockFeedback.filter((review) => review.sentiment === "Positive").length;
const negativeReviews = mockFeedback.filter((review) => review.sentiment === "Negative").length;

const summary =
  `Revenue is ${formatCurrency(REVENUE_YTD)} year to date, up ${REVENUE_YTD_GROWTH}% against the prior period. ` +
  `The immediate operational risks are three inventory items below their safety thresholds and courier costs above budget. ` +
  `Customer reviews also mention delivery delays and product availability.`;

export default function BusinessReportsPage() {
  const reportDate = formatDate(DEMO_AS_OF);

  return (
    <div className="print-report mx-auto w-full min-w-0 max-w-6xl space-y-6 pb-12">
      <DemoPlannedNotice />
      <div className="report-print-hide flex min-w-0 flex-col gap-4 border-b border-[#E8DCC8] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="break-words text-2xl font-extrabold leading-tight tracking-tight text-navy sm:text-3xl">
            Business Reports
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            A fixed overview of sales, revenue, expenses, inventory, and customer feedback.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#C6A75E]/60 bg-navy px-4 py-2.5 text-sm font-bold text-[#E8DCC8] shadow-sm transition-colors hover:bg-[#2B3A5E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#88682A] focus-visible:ring-offset-2"
        >
          <Printer aria-hidden="true" className="h-4 w-4 text-gold" />
          Export as PDF
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-[#E8DCC8] bg-white/70 px-4 py-3 text-xs text-muted">
        <span className="inline-flex items-center gap-2 font-semibold text-navy">
          <CalendarDays aria-hidden="true" className="h-4 w-4 text-gold-text" />
          Data as of {reportDate}
        </span>
        <span className="inline-flex items-center gap-2">
          <BarChart3 aria-hidden="true" className="h-4 w-4 text-gold-text" />
          Reporting currency: PKR
        </span>
      </div>

      <section
        aria-labelledby="executive-summary-title"
        className="report-card min-w-0 overflow-hidden rounded-2xl border border-[#C6A75E]/50 bg-navy p-5 text-[#E8DCC8] shadow-lg sm:p-7"
      >
        <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 max-w-3xl">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Sparkles aria-hidden="true" className="h-5 w-5 shrink-0 text-gold" />
              <h2 id="executive-summary-title" className="break-words text-lg font-bold leading-snug text-white sm:text-xl">
                Executive Summary
              </h2>
              <span className="rounded-full border border-[#C6A75E]/50 bg-[#131A2B] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#E0C788]">
                Preview
              </span>
            </div>
            <p className="text-sm leading-7 text-[#E8DCC8]">{summary}</p>
          </div>
          <p className="max-w-xs rounded-xl border border-[#C6A75E]/30 bg-[#131A2B]/70 p-3 text-xs leading-relaxed text-[#E8DCC8]/90">
            This view uses the dashboard&apos;s existing figures and prepared copy. AI report generation is not connected.
          </p>
        </div>
      </section>

      <section aria-label="Business report sections" className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
        <ReportSection
          title="Sales"
          description="Orders and product performance for the selected reporting data."
          icon={ShoppingCart}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ReportMetric label="Orders" value={mockMetrics.totalOrders.toLocaleString("en-US")}             detail="Distinct order IDs" />
                        <ReportMetric label="Units sold" value={`${octoberUnitsSold.toLocaleString("en-US")} units sold`} detail={`${mockProducts.length} products in the report data`} />
          </div>
          <div className="mt-4 space-y-3 border-t border-[#E8DCC8] pt-4 text-sm">
            {mockProducts.map((product) => (
                <div key={product.sku} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="min-w-0 break-words font-semibold text-navy">{product.name}</span>
                  <span className="shrink-0 text-xs font-bold text-muted">{product.unitsSold} units</span>
                </div>
              ))}
          </div>
        </ReportSection>

        <ReportSection
          title="Revenue"
          description="Year-to-date performance and the latest monthly result."
          icon={TrendingUp}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ReportMetric label="Revenue year to date" value={formatCurrency(REVENUE_YTD)} detail={`Up ${REVENUE_YTD_GROWTH}% from the prior period`} />
            <ReportMetric label={`${revenueMonth.month} revenue`} value={formatCurrency(octoberRevenue)} detail={`Target: ${formatCurrency(revenueMonth.target)}`} />
          </div>
        </ReportSection>

        <ReportSection
          title="Expenses"
          description="Actual operating costs compared with the approved budget."
          icon={Receipt}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ReportMetric label="Total expenses" value={formatCurrency(totalExpenses)} detail={`Budget: ${formatCurrency(totalExpenseBudget)}`} />
            <ReportMetric label="Budget variance" value={formatCurrency(totalExpenses - totalExpenseBudget)} detail="Above the combined category budgets" />
          </div>
          <div className="mt-4 flex min-w-0 items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309]" />
            <p className="min-w-0 text-xs leading-relaxed text-[#7C2D12]">
              Courier and shipping cost {formatCurrency(mockExpensesBreakdown.find((expense) => expense.category === "Logistics & Shipping")?.amount ?? 0)} against a {formatCurrency(mockExpensesBreakdown.find((expense) => expense.category === "Logistics & Shipping")?.budget ?? 0)} budget.
            </p>
          </div>
        </ReportSection>

        <ReportSection
          title="Inventory"
          description="Stock availability and items that need operational attention."
          icon={Boxes}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ReportMetric label="Items below threshold" value={String(itemsAtRisk)} detail="Includes low-stock and out-of-stock items" />
            <ReportMetric label="Out of stock" value={String(mockInventory.filter((item) => item.status === "Out of Stock").length)} detail="Immediate replenishment needed" />
          </div>
          <ul className="mt-4 space-y-3 border-t border-[#E8DCC8] pt-4">
            {mockInventory
              .filter((item) => item.status !== "In Stock")
              .map((item) => (
                <li key={item.id} className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1 text-sm">
                  <span className="min-w-0 break-words font-semibold text-navy">{item.name}</span>
                  <span className={`shrink-0 text-xs font-bold ${item.status === "Out of Stock" ? "text-rose-800" : "text-[#B45309]"}`}>
                    {item.currentStock} / {item.minThreshold} units
                  </span>
                </li>
              ))}
          </ul>
        </ReportSection>

        <ReportSection
          title="Customer Feedback"
          description="Recorded sentiment and themes from customer reviews."
          icon={MessageSquareText}
          className="lg:col-span-2"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ReportMetric label="Total reviews" value={String(mockFeedback.length)} detail="Reviews in this report" />
            <ReportMetric label="Positive" value={String(positiveReviews)} detail="Favorable feedback" />
            <ReportMetric label="Negative" value={String(negativeReviews)} detail="Needs follow-up" />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-[#E8DCC8] pt-4 md:grid-cols-2 xl:grid-cols-3">
            {mockFeedback.map((review) => (
              <figure key={review.id} className="flex min-w-0 flex-col rounded-xl border border-[#E8DCC8] bg-white/80 p-4">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 break-words text-xs font-bold leading-snug text-navy">{review.topic}</span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                    review.sentiment === "Positive"
                      ? "bg-emerald-100 text-[#15803D]"
                      : review.sentiment === "Negative"
                        ? "bg-rose-100 text-rose-900"
                        : "bg-amber-100 text-[#7C2D12]"
                  }`}>
                    {review.sentiment}
                  </span>
                </div>
                <blockquote className="mt-3 flex-1 break-words text-xs leading-relaxed text-muted">
                  &ldquo;{review.comment}&rdquo;
                </blockquote>
                <figcaption className="mt-4 border-t border-[#E8DCC8] pt-3 text-[11px] font-semibold text-navy">
                  {review.customer}
                  <span className="ml-2 font-normal text-muted">{formatDate(review.date)}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </ReportSection>
      </section>

      <section aria-labelledby="key-findings-title" className="report-card min-w-0 rounded-2xl border border-[#E8DCC8] bg-[#FAF6EF] p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300 bg-amber-50 text-[#B45309]">
            <AlertTriangle aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="key-findings-title" className="report-section-title text-base font-bold leading-snug text-navy sm:text-lg">
              Important Findings
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">Items flagged in the current dashboard data.</p>
          </div>
        </div>
        <ul className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          {mockAnomalies.map((anomaly) => (
            <li key={anomaly.id} className="min-w-0 rounded-xl border border-[#E8DCC8] bg-white/80 p-4">
              <p className="break-words text-sm font-bold leading-snug text-navy">{anomaly.title}</p>
              <p className="mt-2 break-words text-xs leading-relaxed text-muted">{anomaly.description}</p>
              <p className="mt-3 break-words text-xs font-semibold leading-relaxed text-gold-text">{anomaly.deviation}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="recommendations-title" className="report-card min-w-0 rounded-2xl border border-[#E8DCC8] bg-[#FAF6EF] p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#C6A75E]/40 bg-navy text-gold">
            <Package aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="recommendations-title" className="report-section-title text-base font-bold leading-snug text-navy sm:text-lg">
              Recommendations
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">Prepared actions linked to the displayed findings.</p>
          </div>
        </div>
        <ol className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {mockRecommendations.map((recommendation) => (
            <li key={recommendation.id} className="min-w-0 rounded-xl border border-[#E8DCC8] bg-white/80 p-4">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <h3 className="min-w-0 break-words text-sm font-bold leading-snug text-navy">{recommendation.title}</h3>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${recommendation.priority === "High" ? "bg-rose-100 text-rose-900" : "bg-amber-100 text-[#7C2D12]"}`}>
                  {recommendation.priority} priority
                </span>
              </div>
              <p className="mt-3 break-words text-xs leading-relaxed text-muted">{recommendation.action}</p>
              <p className="mt-3 border-t border-[#E8DCC8] pt-3 text-xs font-semibold leading-relaxed text-gold-text">
                Expected impact: {recommendation.expectedImpact}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <p className="report-print-hide text-xs leading-relaxed text-muted">
        This report preview is based on the dashboard&apos;s prepared figures and copy. No AI service or report backend is connected.
      </p>
      <div className="hidden print:block">
        <p className="text-[10px] text-gray-500">
          Prepared from ScaleUp dashboard figures as of {reportDate}.
        </p>
      </div>
    </div>
  );
}
