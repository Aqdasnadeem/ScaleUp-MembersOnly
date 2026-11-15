"use client";

import { useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  Sparkles,
  ShieldCheck,
  Calendar,
  Layers,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import MetricCard from "@/components/MetricCard";
import { DemoPlannedNotice } from "@/components/DemoPlannedNotice";
import { formatCurrency, mockForecast } from "@/lib/demo-data";

export default function ForecastingPage() {
  const [forecastData] = useState(mockForecast);
  const novemberForecast = forecastData.find((point) => point.month === "Nov")?.forecast;
  const q4Forecast = forecastData
    .filter((point) => ["Nov", "Dec", "Jan"].includes(point.month))
    .reduce((total, point) => total + (point.forecast ?? 0), 0);
  if (novemberForecast === undefined) {
    throw new Error("Shared example forecast data is missing November.");
  }

  return (
    <div className="space-y-8 pb-12">
      <DemoPlannedNotice />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-serif font-bold text-[#1F2A44]">
              Sales Forecast
            </h2>
            <span className="text-[10px] font-bold bg-[#C6A75E]/20 text-[#1F2A44] border border-[#C6A75E]/40 px-2 py-0.5 rounded-full">
              Coming soon
            </span>
          </div>
          <p className="text-xs text-[#1F2A44]/70 mt-0.5">
            Example values for a future forecast
          </p>
        </div>

        <Link
          href="/agent?q=What does the sales forecast show?"
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#1F2A44] hover:bg-[#2B3A5C] text-[#E8DCC8] text-xs font-semibold shadow-xs transition-colors border border-[#C6A75E]/40"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#C6A75E]" />
          <span>Ask the assistant</span>
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <MetricCard
          title="Projected Nov Revenue"
          value={formatCurrency(novemberForecast)}
          subtitle="Illustrative value"
          icon={TrendingUp}
        />
        <MetricCard
          title="Projected Q4 Total"
          value={formatCurrency(q4Forecast)}
          subtitle="Q4 estimate"
          icon={Calendar}
        />
        <MetricCard
          title="Projection source"
          value="Example"
          subtitle="Preset values"
          icon={ShieldCheck}
        />
        <MetricCard
          title="Expected range"
          value="—"
          subtitle="Not a confidence interval"
          icon={Layers}
        />
      </div>

      {/* Forecast Line Chart */}
      <div className="bg-[#FAF6EF] rounded-2xl border border-[#E8DCC8] p-6 shadow-2xs">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-base font-bold text-[#1F2A44]">
              Monthly sales forecast example
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Shaded area shows an illustrative expected range
            </p>
          </div>
        </div>

        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={forecastData}>
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
              <Line
                type="monotone"
                dataKey="historical"
                name="Actual"
                stroke="#1F2A44"
                strokeWidth={3}
                dot={{ r: 4, fill: "#1F2A44" }}
              />
              <Line
                type="monotone"
                dataKey="forecast"
                name="Forecast"
                stroke="#C6A75E"
                strokeWidth={3}
                strokeDasharray="5 5"
                dot={{ r: 4, fill: "#C6A75E" }}
              />
              <Line
                type="monotone"
                dataKey="upperBound"
                name="Expected range"
                stroke="#DDC586"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="lowerBound"
                name="Expected range"
                stroke="#B5964D"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Model Parameters Box */}
      <div className="bg-[#FAF6EF] rounded-2xl border border-[#E8DCC8] p-6 shadow-2xs space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[#1F2A44]">
          Forecast details
        </h3>
        <p className="text-xs text-[#1F2A44]/80 leading-relaxed">
          These values are illustrative planning examples, not a live forecast.
        </p>
      </div>
    </div>
  );
}
