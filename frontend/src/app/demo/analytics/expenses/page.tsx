"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Receipt,
  DollarSign,
  TrendingDown,
  AlertTriangle,
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
import { DemoPlannedNotice } from "@/components/DemoPlannedNotice";
import { formatCurrency, mockExpensesBreakdown } from "@/lib/demo-data";

export default function ExpenseAnalyticsPage() {
  const [expenses] = useState(mockExpensesBreakdown);

  const totalSpent = expenses.reduce((acc, e) => acc + e.amount, 0);
  const totalBudget = expenses.reduce((acc, e) => acc + e.budget, 0);
  const logisticsOverBudget = expenses
    .filter((expense) => expense.category === "Logistics & Shipping")
    .reduce((total, expense) => total + expense.amount - expense.budget, 0);

  return (
    <div className="space-y-8 pb-12">
      <DemoPlannedNotice />
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-[#1F2A44]">
            Expenses and budgets
          </h2>
          <p className="text-xs text-[#1F2A44]/70 mt-0.5">
            Spending categories, expense trends, budget variances, and cost anomalies.
          </p>
        </div>

        <Link
          href={`/agent?q=${encodeURIComponent("Investigate why courier and logistics costs surged 48%")}`}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#1F2A44] hover:bg-[#2B3A5C] text-[#E8DCC8] text-xs font-semibold shadow-xs transition-colors border border-[#C6A75E]/40"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#C6A75E]" />
          <span>Ask the assistant</span>
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <MetricCard
          title="Year-to-date operating costs"
          value={formatCurrency(totalSpent)}
          change={{ value: -4.3, label: "reduction MoM", isPositiveGood: false }}
          icon={DollarSign}
        />
        <MetricCard
          title="Allocated Budget"
          value={formatCurrency(totalBudget)}
          subtitle="Year-to-date allocated budget"
          icon={Receipt}
        />
        <MetricCard
          title="Budget Variance"
          value={`${totalSpent - totalBudget >= 0 ? "+" : ""}${formatCurrency(totalSpent - totalBudget)}`}
          subtitle={totalSpent > totalBudget ? "Over budget" : "Under budget"}
          icon={TrendingDown}
        />
        <MetricCard
          title="Unusual cost"
          value="Logistics (+48%)"
          subtitle={`Over budget by ${formatCurrency(logisticsOverBudget)}`}
          icon={AlertTriangle}
        />
      </div>

      {/* Expense Allocation Chart */}
      <div className="bg-[#FAF6EF] rounded-2xl border border-[#E8DCC8] p-6 shadow-2xs">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-base font-bold text-[#1F2A44]">Actual Spend vs Budgeted Allocation</h3>
            <p className="text-xs text-muted mt-0.5">Visualizing departmental budget burn and variances</p>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={expenses}>
              <CartesianGrid strokeDasharray="3 3" stroke="#FAF7F2" vertical={false} />
              <XAxis dataKey="category" stroke="#1F2A44" fontSize={11} tickLine={false} />
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
              <Legend formatter={(value) => <span className="text-[#1F2A44]">{value}</span>} />
              <Bar dataKey="amount" name="Actual Spend" fill="#1F2A44" radius={[6, 6, 0, 0]} />
              <Bar dataKey="budget" name="Approved Budget" fill="#C6A75E" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Expense Ledger Table */}
      <div className="bg-[#FAF6EF] rounded-2xl border border-[#E8DCC8] p-6 shadow-2xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-[#1F2A44]">Departmental Expense Breakdown</h3>
            <p className="text-xs text-muted mt-0.5">Detailed line items and automated pattern checks</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#E8DCC8] text-muted font-medium">
                <th className="pb-3 font-semibold">Expense Category</th>
                <th className="pb-3 font-semibold text-right">Actual Amount</th>
                <th className="pb-3 font-semibold text-right">Budget Limit</th>
                <th className="pb-3 font-semibold text-right">Share %</th>
                <th className="pb-3 font-semibold text-right">Variance Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#FAF7F2]">
              {expenses.map((item) => (
                <tr key={item.category} className="hover:bg-[#FAF7F2] transition-colors">
                  <td className="py-3 font-bold text-[#1F2A44]">{item.category}</td>
                  <td className="py-3 text-right font-bold text-[#1F2A44]">
                    {formatCurrency(item.amount)}
                  </td>
                  <td className="py-3 text-right text-[#1F2A44]/70">{formatCurrency(item.budget)}</td>
                  <td className="py-3 text-right font-semibold text-[#1F2A44]">{((item.amount / totalSpent) * 100).toFixed(1)}%</td>
                  <td className="py-3 text-right">
                    <p className="font-bold text-[#1F2A44]">
                      {item.amount - item.budget > 0 ? "+" : ""}
                      {formatCurrency(item.amount - item.budget)}
                    </p>
                    <span
                      className={`mt-1 inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                        item.trend.includes("Spike")
                          ? "bg-rose-50 text-rose-800 border border-rose-200"
                          : "bg-emerald-50 text-[#15803D] border border-emerald-200"
                      }`}
                    >
                      {item.trend}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
