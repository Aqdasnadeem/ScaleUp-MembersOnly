"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Smile,
  Frown,
  Search,
  Sparkles,
  Database,
  Tag,
} from "lucide-react";
import MetricCard from "@/components/MetricCard";
import { DemoPlannedNotice } from "@/components/DemoPlannedNotice";
import { formatDate, mockFeedback } from "@/lib/demo-data";
import { FeedbackRecord } from "@/lib/types";

export default function CustomerFeedbackNLPPage() {
  const [feedbackList] = useState<FeedbackRecord[]>(mockFeedback);
  const [semanticQuery, setSemanticQuery] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<string>("All");

  const positiveCount = feedbackList.filter((f) => f.sentiment === "Positive").length;
  const negativeCount = feedbackList.filter((f) => f.sentiment === "Negative").length;

  const topics = ["All", "Shipping Delay", "Product Quality", "Stock Availability", "Customer Service"];

  const filteredReviews = feedbackList.filter((item) => {
    const matchesTopic = selectedTopic === "All" || item.topic === selectedTopic;
    const matchesQuery =
      semanticQuery.trim() === "" ||
      item.comment.toLowerCase().includes(semanticQuery.toLowerCase()) ||
      item.topic.toLowerCase().includes(semanticQuery.toLowerCase()) ||
      item.customer.toLowerCase().includes(semanticQuery.toLowerCase());
    return matchesTopic && matchesQuery;
  });

  return (
    <div className="space-y-8 pb-12">
      <DemoPlannedNotice />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-[#1F2A44]">
            Customer Feedback
          </h2>
          <p className="text-xs text-[#1F2A44]/70 mt-0.5">
            Search customer reviews and see their recorded sentiment.
          </p>
        </div>

        <Link
          href={`/agent?q=${encodeURIComponent("Summarize negative customer feedback regarding delivery delays and courier issues")}`}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#1F2A44] hover:bg-[#2B3A5C] text-[#E8DCC8] text-xs font-semibold shadow-xs transition-colors border border-[#C6A75E]/40"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#C6A75E]" />
          <span>Ask the assistant</span>
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <MetricCard
          title="Positive reviews"
          value={positiveCount}
          subtitle="Based on the review list"
          icon={Smile}
        />
        <MetricCard
          title="Negative / Critical Reviews"
          value={negativeCount}
          subtitle="Items running out and delivery delays flagged"
          icon={Frown}
        />
        <MetricCard
          title="Total reviews"
          value={feedbackList.length}
          subtitle="Included in this demo"
          icon={Database}
        />
      </div>

      {/* Semantic Search Box */}
      <div className="bg-[#FAF6EF] rounded-2xl border border-[#E8DCC8] p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#1F2A44] flex items-center gap-2">
              <Database className="w-4 h-4 text-[#C6A75E]" />
              <span>Search reviews</span>
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Search reviews by words, names, or topics.
            </p>
          </div>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-[#C6A75E] absolute left-3.5 top-3" />
          <input
            type="text"
            value={semanticQuery}
            onChange={(e) => setSemanticQuery(e.target.value)}
            placeholder="Type concepts like 'slow shipping', 'keyboard out of stock', or 'great ergonomics'..."
            className="w-full bg-[#FAF7F2] border border-[#E8DCC8] focus:border-[#C6A75E] rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#1F2A44] placeholder-slate-400 focus:outline-none transition-colors"
          />
        </div>

        {/* Topic Filters */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted mr-1">
            Topic Clusters:
          </span>
          {topics.map((t) => (
            <button
              key={t}
              onClick={() => setSelectedTopic(t)}
              className={`text-xs px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                selectedTopic === t
                  ? "bg-[#1F2A44] text-[#E8DCC8] font-semibold"
                  : "bg-[#FAF7F2] border border-[#E8DCC8] text-[#1F2A44]/70 hover:text-[#1F2A44]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Reviews List */}
      <div className="bg-[#FAF6EF] rounded-2xl border border-[#E8DCC8] p-6 shadow-sm">
        <h3 className="text-base font-bold text-[#1F2A44] mb-4">Customer Review Stream & Sentiment Labels</h3>

        <div className="space-y-3">
          {filteredReviews.map((rev) => (
            <div
              key={rev.id}
              className="p-4 rounded-xl border border-[#E8DCC8] bg-[#FAF7F2]/60 hover:bg-[#FAF7F2] transition-colors flex flex-col sm:flex-row sm:items-start justify-between gap-3"
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-[#1F2A44]">{rev.customer}</span>
                  <span className="text-[#E8DCC8]">•</span>
                  <span className="text-xs text-muted">{formatDate(rev.date)}</span>
                  {rev.relatedSku && (
                    <>
                      <span className="text-[#E8DCC8]">•</span>
                      <span className="font-mono text-[10px] bg-white px-2 py-0.5 rounded border border-[#E8DCC8] text-[#1F2A44]/70">
                        {rev.relatedSku}
                      </span>
                    </>
                  )}
                </div>

                <p className="text-xs text-[#1F2A44]/90 leading-relaxed italic">
                  &quot;{rev.comment}&quot;
                </p>

                <div className="flex items-center gap-2 pt-1">
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted bg-white px-2 py-0.5 rounded border border-[#E8DCC8]">
                    <Tag className="w-3 h-3 text-[#C6A75E]" />
                    {rev.topic}
                  </span>
                </div>
              </div>

              <div className="shrink-0">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                    rev.sentiment === "Positive"
                      ? "bg-emerald-50 text-[#15803D] border border-emerald-200"
                      : "bg-rose-50 text-rose-800 border border-rose-200"
                  }`}
                >
                  {rev.sentiment === "Positive" ? (
                    <Smile className="w-3.5 h-3.5" />
                  ) : (
                    <Frown className="w-3.5 h-3.5" />
                  )}
                  <span>{rev.sentiment}</span>
                </span>
              </div>
            </div>
          ))}

          {filteredReviews.length === 0 && (
            <div className="p-8 text-center text-xs text-muted">
              No customer feedback matches the specified query or topic filter.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
