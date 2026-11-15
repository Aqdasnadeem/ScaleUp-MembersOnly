"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Layers,
  Sparkles,
  CheckCircle2,
  Cpu,
  ChevronRight,
} from "lucide-react";
import {
  formatCurrency,
  mockInvestigationSteps,
  OCTOBER_REVENUE,
} from "@/lib/demo-data";
import { InvestigationStep } from "@/lib/types";

export default function InvestigationViewPage() {
  const [steps] = useState<InvestigationStep[]>(mockInvestigationSteps);

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-[#1F2A44]">
            AI Investigation & Multi-Source Analysis Flow
          </h2>
          <p className="text-xs text-[#1F2A44]/70 mt-0.5">Explanation of the likely cause and the records checked.</p>
        </div>

        <Link
          href="/agent"
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#1F2A44] hover:bg-[#2B3A5C] text-[#E8DCC8] text-xs font-semibold shadow-xs transition-colors border border-[#C6A75E]/40"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#C6A75E]" />
          <span>Ask about this investigation</span>
        </Link>
      </div>

      {/* Investigation Case Brief */}
      <div className="bg-gradient-to-r from-[#1F2A44] to-[#2B3A5C] rounded-2xl p-6 text-white border border-[#C6A75E]/40 shadow-md">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#C6A75E] mb-2">
          <Cpu className="w-4 h-4" />
          <span className="text-xs rounded border border-[#C6A75E]/60 px-2 py-1">Investigation INV-2026-904</span>
          <span>Investigation</span>
        </div>
        <h3 className="text-lg font-bold font-serif text-white mb-2">
          &quot;Why did net profit margin decline in October despite positive gross sales?&quot;
        </h3>
        <p className="text-xs text-[#E8DCC8]/80 leading-relaxed max-w-3xl">
          October sales were {formatCurrency(OCTOBER_REVENUE)}. The records suggest the keyboard stockout and higher courier costs contributed to the lower margin.
        </p>

        <div className="mt-4 pt-4 border-t border-[#2D3D60] flex flex-wrap items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-[#E8DCC8]">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#C6A75E]" />
            Records checked
          </span>
          <span className="text-[#C6A75E]">â€¢</span>
          <span className="text-[#E8DCC8]/80">Data reviewed</span>
        </div>
      </div>

      {/* Investigation Execution Timeline */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-[#1F2A44] flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#C6A75E]" />
          <span>Tool Execution Steps & Findings Timeline</span>
        </h3>

        <div className="space-y-4">
          {steps.map((step) => (
              <div
                key={step.stepNumber}
                className="bg-[#FAF6EF] rounded-2xl border border-[#E8DCC8] hover:border-[#C6A75E] p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-5 relative overflow-hidden transition-all"
              >
                <div className="flex items-start gap-4 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-[#FAF7F2] border border-[#E8DCC8] flex items-center justify-center font-bold text-sm text-[#1F2A44] shrink-0">
                    #{step.stepNumber}
                  </div>

                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-[#1F2A44] bg-[#FAF7F2] px-2 py-0.5 rounded border border-[#E8DCC8]">
                        âš¡ {step.tool}
                      </span>
                      <span className="text-xs font-semibold text-muted">
                        Domain: {step.domain}
                      </span>
                    </div>

                    <p className="text-xs text-[#1F2A44]/70 pt-1">
                      <strong>Tool Action:</strong> {step.action}
                    </p>

                    <div className="mt-2 rounded-xl border border-[#C6A75E] bg-[#F7EFCF] p-3 text-xs font-medium leading-relaxed text-[#1F2A44] shadow-sm">
                      <strong>Finding:</strong> {step.finding}
                    </div>
                  </div>
                </div>

                <div className="shrink-0 flex md:flex-col items-end gap-2 w-full md:w-auto justify-between border-t md:border-t-0 pt-3 md:pt-0 border-[#FAF7F2]">
                  <Link
                    href={`/evidence?step=${step.stepNumber}`}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1F2A44] hover:text-gold-text transition-colors"
                  >
                    <span>View Evidence</span>
                    <ChevronRight className="w-3.5 h-3.5 text-[#C6A75E]" />
                  </Link>
                </div>
              </div>
          ))}
        </div>
      </div>
    </div>
  );
}
