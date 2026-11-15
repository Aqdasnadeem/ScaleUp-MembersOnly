import React from "react";
import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    label: string;
    isPositiveGood?: boolean;
  };
  subtitle?: string;
  icon: LucideIcon;
  variant?: "parchment" | "navy";
}

export default function MetricCard({
  title,
  value,
  change,
  subtitle,
  icon: Icon,
  variant = "parchment",
}: MetricCardProps) {
  const isPositive = change ? change.value >= 0 : false;
  const isGood = change
    ? change.isPositiveGood !== undefined
      ? change.isPositiveGood
        ? isPositive
        : !isPositive
      : isPositive
    : true;

  if (variant === "navy") {
    return (
      <div className="bg-[#1F2A44] rounded-2xl border border-[#C6A75E] p-6 shadow-xl text-[#E8DCC8] relative overflow-visible group">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#C6A75E]/10 rounded-full blur-2xl -mr-10 -mt-10" />

        <div className="flex items-center justify-between relative z-10">
          <p className="text-[11px] font-bold text-[#C6A75E] uppercase tracking-widest">
            {title}
          </p>
          <div className="p-2.5 rounded-xl bg-[#131A2B] border border-[#C6A75E]/40 text-[#C6A75E]">
            <Icon className="w-5 h-5" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-baseline gap-2 relative z-10">
          <h3 className="min-w-0 break-words text-2xl sm:text-3xl font-extrabold tracking-tight text-white">{value}</h3>
          {change && (
            <span
              className={`inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full ${
                isGood
                  ? "bg-[#C6A75E]/20 text-[#C6A75E] border border-[#C6A75E]/50"
                  : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
              }`}
            >
              {isPositive ? "+" : ""}
              {change.value}%
            </span>
          )}
        </div>

        {(subtitle || change) && (
          <p className="mt-2 text-xs text-[#E8DCC8]/70 relative z-10">
            {change ? change.label : subtitle}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-[#FAF6EF] rounded-2xl border border-[#E8DCC8] hover:border-[#C6A75E] p-6 shadow-sm hover:shadow-lg transition-all relative overflow-visible group">
      {/* Gold top accent line */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#1F2A44] via-[#C6A75E] to-[#E8DCC8] opacity-60 group-hover:opacity-100 transition-opacity" />

      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-[#1F2A44]/70 uppercase tracking-widest">
          {title}
        </p>
        <div className="p-2.5 rounded-xl bg-[#1F2A44] border border-[#C6A75E]/40 text-[#C6A75E] shadow-sm">
          <Icon className="w-4 h-4" />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-2">
        <h3 className="min-w-0 break-words text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1F2A44]">{value}</h3>
        {change && (
          <span
            className={`inline-flex items-center text-xs font-bold px-2.5 py-0.5 rounded-full ${
              isGood
                ? "bg-emerald-100/70 text-[#15803D] border border-emerald-300"
                : "bg-rose-100/70 text-rose-900 border border-rose-300"
            }`}
          >
            {isPositive ? "+" : ""}
            {change.value}%
          </span>
        )}
      </div>

      {(subtitle || change) && (
        <p className="mt-2 text-xs text-[#1F2A44]/70 font-medium">
          {change ? change.label : subtitle}
        </p>
      )}
    </div>
  );
}
