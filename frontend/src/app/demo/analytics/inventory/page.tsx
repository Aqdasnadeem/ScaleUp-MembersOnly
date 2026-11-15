"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Package,
  AlertTriangle,
  Clock,
  Sparkles,
  Truck,
  ArrowRight,
  TrendingDown,
} from "lucide-react";
import MetricCard from "@/components/MetricCard";
import { DemoPlannedNotice } from "@/components/DemoPlannedNotice";
import { formatCurrency, keyboardDailyLoss, mockInventory } from "@/lib/demo-data";

export default function InventoryAnalyticsPage() {
  const [inventory] = useState(mockInventory);

  const lowStockCount = inventory.filter((i) => i.status === "Low Stock").length;
  const outOfStockCount = inventory.filter((i) => i.status === "Out of Stock").length;
  const totalValuation = inventory.reduce((acc, i) => acc + i.currentStock * i.unitPrice, 0);
  const averageSupplierLeadTime =
    inventory.reduce((total, item) => total + item.reorderLeadDays, 0) / inventory.length;

  return (
    <div className="space-y-8 pb-12">
      <DemoPlannedNotice />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-[#1F2A44]">
            Inventory and stock levels
          </h2>
          <p className="text-xs text-[#1F2A44]/70 mt-0.5">
            Current stock, reorder levels, items running out, and supplier lead times.
          </p>
        </div>

        <Link
          href={`/agent?q=${encodeURIComponent("Which products are at risk of stockout and need reorder?")}`}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#1F2A44] hover:bg-[#2B3A5C] text-[#E8DCC8] text-xs font-semibold shadow-xs transition-colors border border-[#C6A75E]/40"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#C6A75E]" />
          <span>Ask the assistant</span>
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <MetricCard
          title="Warehouse Asset Value"
          value={formatCurrency(totalValuation)}
          subtitle="On-hand inventory valuation"
          icon={Package}
        />
        <MetricCard
          title="Out of Stock SKUs"
          value={outOfStockCount}
          subtitle="Immediate replenishment critical"
          icon={AlertTriangle}
        />
        <MetricCard
          title="Low Stock Warnings"
          value={lowStockCount}
          subtitle="Below safety buffer threshold"
          icon={TrendingDown}
        />
        <MetricCard
          title="Average Supplier Lead Time"
          value={`${averageSupplierLeadTime.toFixed(1)} Days`}
          subtitle="Transit turnaround benchmark"
          icon={Truck}
        />
      </div>

      {/* Stockout Risk Alert Box */}
      <div className="p-5 rounded-2xl bg-[#FAF7F2] border border-[#C6A75E]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-white border border-[#E8DCC8] text-[#C6A75E]">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#1F2A44]">Urgent stock alert</h3>
            <p className="text-xs text-[#1F2A44]/80 mt-0.5">
              Mechanical Keyboards (SKU-102) stock is at <strong>0 units</strong>. Estimated missed sales are {formatCurrency(keyboardDailyLoss)} per day.
            </p>
          </div>
        </div>

        <Link
          href="/recommendations"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1F2A44] hover:bg-[#2D3D60] text-xs font-semibold text-[#E8DCC8] transition-colors shrink-0"
        >
          <span>View Reorder Strategy</span>
          <ArrowRight className="w-3.5 h-3.5 text-[#C6A75E]" />
        </Link>
      </div>

      {/* Detailed Inventory Table */}
      <div className="bg-[#FAF6EF] rounded-2xl border border-[#E8DCC8] p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-[#1F2A44]">Stock Ledger & Replenishment Monitor</h3>
            <p className="text-xs text-muted mt-0.5">Current inventory levels</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#E8DCC8] text-muted font-medium">
                <th className="pb-3 font-semibold">SKU ID</th>
                <th className="pb-3 font-semibold">Product Name</th>
                <th className="pb-3 font-semibold">Category</th>
                <th className="pb-3 font-semibold text-center">Current Stock</th>
                <th className="pb-3 font-semibold text-center">Safety Threshold</th>
                <th className="pb-3 font-semibold text-center">Supplier Lead Time</th>
                <th className="pb-3 font-semibold">Supplier Name</th>
                <th className="pb-3 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#FAF7F2]">
              {inventory.map((item) => (
                <tr key={item.id} className="hover:bg-[#FAF7F2] transition-colors">
                  <td className="py-3 font-mono font-semibold text-muted">{item.id}</td>
                  <td className="py-3 font-bold text-[#1F2A44]">{item.name}</td>
                  <td className="py-3 text-[#1F2A44]/70">{item.category}</td>
                  <td className="py-3 text-center font-bold text-[#1F2A44]">{item.currentStock} units</td>
                  <td className="py-3 text-center text-muted">{item.minThreshold} units</td>
                  <td className="py-3 text-center font-medium text-[#1F2A44]">{item.reorderLeadDays} days</td>
                  <td className="py-3 text-[#1F2A44]/80">{item.supplier}</td>
                  <td className="py-3 text-right">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                        item.status === "In Stock"
                          ? "bg-emerald-50 text-[#15803D] border border-emerald-200"
                          : item.status === "Low Stock"
                          ? "bg-amber-50 text-[#B45309] border border-amber-200"
                          : "bg-rose-50 text-rose-800 border border-rose-200"
                      }`}
                    >
                      {item.status}
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
