"use client";

import { useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  BarChart3,
  ShoppingCart,
  Percent,
  Sparkles,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import MetricCard from "@/components/MetricCard";
import {
  formatCurrency,
  GROSS_MARGIN_CHANGE,
  getPeriodFinancials,
  grossMarginPercent,
  mockProducts,
  UNIT_SALES_CHANGE,
  type ReportingRange,
} from "@/lib/demo-data";

export default function SalesAnalyticsPage() {
  const [products] = useState(mockProducts);
  const [timeRange, setTimeRange] = useState<ReportingRange>("30D");
  const financials = getPeriodFinancials(timeRange);

  const totalUnits = products.reduce((acc, p) => acc + p.unitsSold, 0);
  const topProduct = products.reduce((prev, curr) => (curr.revenue > prev.revenue ? curr : prev), products[0]);

  return (
    <div className="space-y-8 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-[#1F2A44]">Sales & Revenue Analytics</h2>
          <p className="text-xs text-[#1F2A44]/70 mt-0.5">
            Product velocity, revenue trends, margin performance, and sales shifts.
          </p>
        </div>

        <Link
          href={`/agent?q=${encodeURIComponent("Analyze product sales trends and margin decline")}`}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#1F2A44] hover:bg-[#2B3A5C] text-[#E8DCC8] text-xs font-semibold shadow-xs transition-colors border border-[#C6A75E]/40"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#C6A75E]" />
          <span>Ask the assistant</span>
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="flex flex-wrap items-center gap-2" aria-label="Sales reporting period">
        {(["30D", "90D", "YTD"] as const).map((range) => (
          <button
            key={range}
            type="button"
            onClick={() => setTimeRange(range)}
            aria-pressed={timeRange === range}
            className={`min-h-11 rounded-lg border px-4 py-2 text-sm font-semibold ${timeRange === range ? "border-[#1F2A44] bg-[#1F2A44] text-white" : "border-[#E8DCC8] bg-white text-[#1F2A44]"}`}
          >
            {range}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <MetricCard
          title="Total Gross Revenue"
          value={formatCurrency(financials.revenue)}
          subtitle={timeRange === "YTD" ? "Year to date" : `Last ${timeRange === "30D" ? "30" : "90"} days`}
          change={{ value: financials.change, label: financials.comparisonLabel }}
          icon={BarChart3}
        />
        <MetricCard
          title="Total Units Sold"
          value={totalUnits.toLocaleString()}
          change={{ value: UNIT_SALES_CHANGE, label: "vs last month" }}
          icon={ShoppingCart}
        />
        <MetricCard
          title="Average Gross Margin"
          value={`${grossMarginPercent}%`}
          change={{ value: GROSS_MARGIN_CHANGE, label: "slight compression", isPositiveGood: true }}
          icon={Percent}
        />
        <MetricCard
          title="Top Performer"
          value={topProduct.name}
          subtitle={`${formatCurrency(topProduct.revenue)} generated`}
          icon={TrendingUp}
        />
      </div>

      {/* Sales Trend Chart */}
      <div className="bg-[#FAF6EF] rounded-2xl border border-[#E8DCC8] p-6 shadow-2xs">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-base font-bold text-[#1F2A44]">Monthly Revenue vs Target Benchmark</h3>
            <p className="text-xs text-muted mt-0.5">Tracking realized sales against monthly budget objectives</p>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={financials.points}>
              <CartesianGrid strokeDasharray="3 3" stroke="#FAF7F2" vertical={false} />
              <XAxis dataKey="month" stroke="#1F2A44" fontSize={12} tickLine={false} />
              <YAxis width={76} tickFormatter={(value: number) => `Rs ${Math.round(value / 1000)}k`} stroke="#1F2A44" fontSize={12} tickLine={false} />
              <Tooltip
                formatter={(val) => formatCurrency(typeof val === "number" ? val : Number(val ?? 0))}
                contentStyle={{
                  backgroundColor: "#1F2A44",
                  borderColor: "#C6A75E",
                  borderRadius: "10px",
                  color: "#E8DCC8",
                }}
              />
              <Legend />
              <Bar dataKey="revenue" name="Revenue" fill="#1F2A44" radius={[6, 6, 0, 0]} />
              <Bar dataKey="target" name="Target" fill="#C6A75E" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Product Performance Table */}
      <div className="bg-[#FAF6EF] rounded-2xl border border-[#E8DCC8] p-6 shadow-2xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-[#1F2A44]">Product Portfolio Performance</h3>
            <p className="text-xs text-[#1F2A44]/70 mt-0.5">October 2026 product revenue and unit sales</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#E8DCC8] text-muted font-medium">
                <th className="pb-3 font-semibold">SKU</th>
                <th className="pb-3 font-semibold">Product Name</th>
                <th className="pb-3 font-semibold">Category</th>
                <th className="pb-3 font-semibold text-right">Units Sold</th>
                <th className="pb-3 font-semibold text-right">Revenue</th>
                <th className="pb-3 font-semibold text-right">Margin %</th>
                <th className="pb-3 font-semibold text-right">MoM Growth</th>
                <th className="pb-3 font-semibold text-right">Classification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#FAF7F2]">
              {products.map((item) => {
                const isTopPerformer = item.sku === topProduct.sku;
                return (
                <tr key={item.sku} className="hover:bg-[#FAF7F2] transition-colors">
                  <td className="py-3 font-mono text-muted font-semibold">{item.sku}</td>
                  <td className="py-3 font-bold text-[#1F2A44]">{item.name}</td>
                  <td className="py-3 text-[#1F2A44]/70">{item.category}</td>
                  <td className="py-3 text-right font-medium text-[#1F2A44]">{item.unitsSold}</td>
                  <td className="py-3 text-right font-bold text-[#1F2A44]">
                    {formatCurrency(item.revenue)}
                  </td>
                  <td className="py-3 text-right font-semibold text-[#1F2A44]">{item.margin}%</td>
                  <td className="py-3 text-right">
                    <span
                      className={`font-semibold ${
                        item.growth >= 0 ? "text-[#15803D]" : "text-rose-700"
                      }`}
                    >
                      {item.growth >= 0 ? "+" : ""}
                      {item.growth}%
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                        isTopPerformer
                          ? "bg-[#C6A75E]/20 text-[#1F2A44] border border-[#C6A75E]/40"
                          : item.status === "Stable"
                          ? "bg-slate-100 text-slate-700 border border-slate-200"
                          : "bg-rose-50 text-rose-700 border border-rose-200"
                      }`}
                    >
                      {isTopPerformer ? "Top Performer" : item.status === "Top Performer" ? "Stable" : item.status}
                    </span>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
