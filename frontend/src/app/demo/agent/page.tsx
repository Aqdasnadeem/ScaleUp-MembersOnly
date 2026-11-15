"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Bot,
  User,
  Send,
  Sparkles,
  Layers,
  Search,
  Lightbulb,
  Cpu,
} from "lucide-react";
import { AgentChatMessage } from "@/lib/types";
import { queryAgent } from "@/lib/demo-api";
import Link from "next/link";

const SUGGESTED_QUERIES = [
  "Why did profit change?",
  "Which items need reordering?",
  "What are customers saying?",
  "What is the sales forecast?",
];

function AgentChatView() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const [inputQuery, setInputQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Checking sales, stock, and expense data...");
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const lastInitialQuery = useRef("");

  const [conversation, setConversation] = useState<AgentChatMessage[]>([
    {
      id: "agent-welcome",
      role: "agent",
      content:
        "Ask about profit changes, items that need reordering, what customers say, or the sales forecast. Calculations use your uploaded records; only aggregated figures are sent to Google Gemini.",
      timestamp: "Ready",
      toolsUsed: ["No records checked"],
    },
  ]);

  const scrollToBottom = () => {
    const container = chatScrollRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversation, loading]);

  const handleSend = useCallback(async (queryText?: string) => {
    const text = (queryText || inputQuery).trim();
    if (!text || loading) return;

    const userMessage: AgentChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setConversation((prev) => [...prev, userMessage]);
    setInputQuery("");
    const normalized = text.toLowerCase();
    setLoadingMessage(
      /review|customer|feedback|say|saying/.test(normalized)
        ? "Checking customer review data..."
        : /forecast|predict|next month/.test(normalized)
          ? "Checking sales history..."
          : /stock|inventory|reorder|restock/.test(normalized)
            ? "Checking stock and sales data..."
            : "Checking sales, stock, and expense data...",
    );
    setLoading(true);

    try {
      const response = await queryAgent(text);
      setConversation((prev) => [...prev, response]);
    } catch (reason) {
      const errorMessage: AgentChatMessage = {
        id: `err-${Date.now()}`,
        role: "agent",
        content: reason instanceof Error ? reason.message : "The answer could not be prepared. Please try again.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        toolsUsed: ["No records checked"],
      };
      setConversation((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  }, [inputQuery, loading]);

  useEffect(() => {
    if (initialQuery && initialQuery !== lastInitialQuery.current) {
      lastInitialQuery.current = initialQuery;
      void handleSend(initialQuery);
    }
  }, [initialQuery, handleSend]);

  return (
    <div className="mx-auto flex h-[calc(100dvh-8rem)] min-h-[28rem] max-w-5xl min-w-0 flex-col">
      {/* Header Info */}
      <div className="mb-4 flex items-center justify-between pb-3 border-b border-[#E8DCC8]">
        <div>
          <h2 className="text-xl font-serif font-bold tracking-tight text-[#1F2A44] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#C6A75E]" />
            <span>Ask the assistant</span>
          </h2>
          <p className="mt-1 text-[13px] leading-5 text-[#374151]">
            Calculations use your records. Only aggregated figures are sent to Google Gemini.
          </p>
        </div>

        <div className="hidden sm:flex items-center gap-2">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#FAF7F2] text-[#1F2A44] border border-[#E8DCC8] flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-[#C6A75E]" />
            <span>4 supported question types</span>
          </span>
        </div>
      </div>

      {/* Suggested Prompts Pill Carousel */}
      <div className="mb-4">
        <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">
          Supported questions
        </p>
        <div className="flex flex-wrap gap-2 pb-1.5">
          {SUGGESTED_QUERIES.map((q) => (
            <button
              key={q}
              onClick={() => handleSend(q)}
              className="max-w-full rounded-lg border border-[#D5C3A5] bg-white px-3 py-2 text-left text-[13px] leading-5 text-[#1F2A44] shadow-2xs transition-colors hover:border-[#88682A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#88682A]"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Messages Scroll Container */}
      <div ref={chatScrollRef} className="mb-4 min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pr-2">
        {conversation.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {/* Agent Avatar */}
            {msg.role === "agent" && (
              <div className="w-9 h-9 rounded-xl bg-[#1F2A44] border border-[#C6A75E]/50 flex items-center justify-center text-[#C6A75E] shrink-0 shadow-sm mt-1">
                <Bot className="w-5 h-5" />
              </div>
            )}

            {/* Message Bubble & Cards */}
            <div
              className={`w-fit max-w-[min(100%,48rem)] rounded-2xl p-4 shadow-sm transition-all sm:p-5 ${
                msg.role === "user"
                  ? "bg-[#1F2A44] text-[#E8DCC8] border border-[#C6A75E]/60 rounded-tr-none shadow-md"
                  : "bg-[#FAF6EF] border border-[#E8DCC8] hover:border-[#C6A75E] text-[#1F2A44] rounded-tl-none"
              }`}
            >
              {/* Tool Execution Tags (If agent used tools) */}
              {msg.role === "agent" && msg.toolsUsed && msg.toolsUsed.length > 0 && (
                <div className="mb-3.5 pb-3 border-b border-[#FAF7F2]">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider mb-2">
                    <Layers className="w-3.5 h-3.5 text-[#C6A75E]" />
                    <span className="text-gold-text">Records checked</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {msg.toolsUsed.map((tool) => (
                      <span
                        key={tool}
                        className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md bg-[#FAF7F2] text-[#1F2A44] border border-[#E8DCC8]"
                      >
                        âš¡ {tool}
                      </span>
                    ))}
                  </div>

                  {/* Investigation Steps */}
                  {msg.investigationSteps && msg.investigationSteps.length > 0 && (
                    <div className="mt-3 space-y-1 rounded-lg bg-[#FAF7F2] p-3 font-mono text-xs leading-5 text-[#374151]">
                      {msg.investigationSteps.map((step, idx) => (
                        <div key={idx}>{step}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Main Text Content */}
              <p className="whitespace-pre-wrap text-sm leading-7 text-current">{msg.content}</p>

              {msg.generationNotice && (
                <p role="status" className="mt-3 rounded-lg border border-[#D5C3A5] bg-white px-3 py-2 text-xs leading-5 text-[#5B6475]">
                  {msg.generationNotice}
                </p>
              )}

              {msg.technicalDetails && (
                <details className="mt-3 rounded-xl border border-[#E8DCC8] bg-white p-3 text-xs">
                  <summary className="cursor-pointer font-semibold text-[#1F2A44]">
                    How this example was prepared
                  </summary>
                  <p className="mt-2 leading-relaxed text-[#1F2A44]/80">{msg.technicalDetails}</p>
                </details>
              )}

              {msg.suggestedQuestions && msg.suggestedQuestions.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-semibold text-[#1F2A44]">Try one of these supported questions:</p>
                  <div className="flex flex-wrap gap-2">
                    {msg.suggestedQuestions.map((question) => (
                      <button
                        key={question}
                        type="button"
                        onClick={() => void handleSend(question)}
                        disabled={loading}
                        className="rounded-lg border border-[#C6A75E]/60 bg-white px-2.5 py-1.5 text-xs text-[#1F2A44] hover:bg-[#FAF6EF] disabled:opacity-50"
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Supporting source rows used to calculate the answer */}
              {msg.evidence && msg.evidence.length > 0 && (
                <div className="mt-4 pt-3.5 border-t border-[#FAF7F2]">
                  <div className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-[#1F2A44]">
                    <Search className="w-3.5 h-3.5 text-[#C6A75E]" />
                    <span>Exact evidence rows used</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {msg.evidence.map((item, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F2] p-3 text-[13px] leading-5"
                      >
                        <p className="font-bold uppercase tracking-wide text-[#72571F]">{item.source}</p>
                        <p className="mt-1 break-all font-semibold leading-5 text-[#1F2A44]">
                          {item.fileName} Â· Row {item.rowNumber}
                        </p>
                        <p className="mt-2 break-words leading-6 text-[#374151]">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actionable Recommendations Section (Page 11 link) */}
              {msg.recommendations && msg.recommendations.length > 0 && (
                <div className="mt-4 pt-3.5 border-t border-[#FAF7F2]">
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#1F2A44]">
                      <Lightbulb className="w-3.5 h-3.5 text-[#C6A75E]" />
                      <span>Example recommendations</span>
                    </div>
                    <Link href="/recommendations" className="text-[11px] font-bold text-gold-text hover:underline">
                      Recommendation Panel â†’
                    </Link>
                  </div>
                  <div className="space-y-2">
                    {msg.recommendations.map((rec, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-[#FAF7F2] border border-[#E8DCC8] rounded-xl text-xs"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              rec.priority === "High"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-amber-100 text-[#B45309]"
                            }`}
                          >
                            {rec.priority}
                          </span>
                          <span className="font-bold text-[#1F2A44]">{rec.action}</span>
                        </div>
                        <p className="text-[11px] text-[#1F2A44]/70 ml-1 mt-1">{rec.rationale}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timestamp */}
              <div
                className={`mt-2 text-[10px] ${
                  msg.role === "user" ? "text-[#E8DCC8]/70 text-right" : "text-muted"
                }`}
              >
                {msg.timestamp}
              </div>
            </div>

            {/* User Avatar */}
            {msg.role === "user" && (
              <div className="w-9 h-9 rounded-xl bg-[#C6A75E] flex items-center justify-center text-[#1F2A44] shrink-0 shadow-sm mt-1 font-bold text-xs">
                <User className="w-5 h-5" />
              </div>
            )}
          </div>
        ))}

        {/* Loading Spinner / Agent Thinking Stage */}
        {loading && (
          <div className="flex gap-3.5 items-start">
            <div className="w-9 h-9 rounded-xl bg-[#1F2A44] border border-[#C6A75E] flex items-center justify-center text-[#C6A75E] shrink-0 shadow-sm animate-pulse">
              <Bot className="w-5 h-5" />
            </div>
            <div className="bg-white border border-[#E8DCC8] rounded-2xl p-4 rounded-tl-none shadow-2xs space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#1F2A44]">
                <Sparkles className="w-4 h-4 text-[#C6A75E] animate-spin" />
                <span>{loadingMessage}</span>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="bg-[#FAF6EF] border-2 border-[#E8DCC8] focus-within:border-[#C6A75E] rounded-2xl p-2.5 shadow-md flex items-center gap-2 transition-colors"
      >
        <input
          type="text"
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          placeholder="Ask about profit, stock, customer reviews or a sales forecast..."
          className="min-w-0 flex-1 px-4 py-2.5 text-sm leading-6 text-[#1F2A44] placeholder-[#5B6475] focus:outline-none"
        />

        <button
          type="submit"
          disabled={!inputQuery.trim() || loading}
          className={`p-2.5 rounded-xl transition-all flex items-center justify-center cursor-pointer ${
            !inputQuery.trim() || loading
              ? "bg-[#FAF7F2] text-muted cursor-not-allowed"
              : "bg-[#1F2A44] hover:bg-[#2B3A5C] text-[#E8DCC8] shadow-sm shadow-[#1F2A44]/20"
          }`}
        >
          <Send className="w-4 h-4 text-[#C6A75E]" />
        </button>
      </form>
    </div>
  );
}

export default function AgentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64 text-sm text-muted">
          Loading AI Agent Console...
        </div>
      }
    >
      <AgentChatView />
    </Suspense>
  );
}
