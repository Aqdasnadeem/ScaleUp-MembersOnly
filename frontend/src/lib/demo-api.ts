import type { AgentChatMessage, EvidenceItem } from "./types";
import { createDemoDashboard } from "./demo-dashboard";
import {
  formatCurrency,
  mockFeedback,
  mockInventory,
  mockRevenueTrend,
  REVENUE_YTD,
  totalExpenses,
} from "./demo-data";

export interface DashboardAlertEvidence {
  fileName: string;
  rowNumber: number;
  data: Record<string, string>;
}

export interface DashboardAlert {
  id: string;
  type: string;
  category: string;
  title: string;
  detail: string;
  evidence: DashboardAlertEvidence[];
}

export const ANALYSIS_HISTORY_STORAGE_KEY = "scaleup-analysis-history";
export const ANALYSIS_HISTORY_UPDATED_EVENT = "scaleup:analysis-history-updated";
const DEMO_ASSISTANT_HISTORY_KEY = "scaleup-demo-assistant-history";

export interface DemoAssistantHistoryRecord {
  id: string;
  question: string;
  answer: string;
  recordsUsed: EvidenceItem[];
  createdAt: string;
}

export function isDemoPreviewRoute(): boolean {
  return typeof window !== "undefined" && window.location.pathname.startsWith("/demo/");
}

export function readDemoAssistantHistory(): DemoAssistantHistoryRecord[] {
  try {
    const stored = window.localStorage.getItem(DEMO_ASSISTANT_HISTORY_KEY);
    if (!stored) return [];
    const value: unknown = JSON.parse(stored);
    if (!Array.isArray(value)) throw new Error("Saved demo assistant history has an invalid format.");
    return value.filter((item): item is DemoAssistantHistoryRecord =>
      typeof item === "object"
      && item !== null
      && "id" in item
      && typeof item.id === "string"
      && "question" in item
      && typeof item.question === "string"
      && "answer" in item
      && typeof item.answer === "string"
      && "createdAt" in item
      && typeof item.createdAt === "string"
      && "recordsUsed" in item
      && Array.isArray(item.recordsUsed),
    );
  } catch (error) {
    console.warn("Could not read saved demo assistant history.", error);
    return [];
  }
}

function saveDemoAssistantHistory(question: string, answer: AgentChatMessage): void {
  try {
    const record: DemoAssistantHistoryRecord = {
      id: answer.id,
      question,
      answer: answer.content,
      recordsUsed: answer.evidence ?? [],
      createdAt: new Date().toISOString(),
    };
    window.localStorage.setItem(
      DEMO_ASSISTANT_HISTORY_KEY,
      JSON.stringify([...readDemoAssistantHistory(), record].slice(-100)),
    );
  } catch (error) {
    console.warn("Could not save this demo question to browser history.", error);
  }
}

async function queryDemoAgent(question: string): Promise<AgentChatMessage> {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 350));
  const normalized = question.toLowerCase();
  const timestamp = new Date().toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
  let response: AgentChatMessage;

  if (/profit|revenue|sales/.test(normalized)) {
    const profit = REVENUE_YTD - totalExpenses;
    response = {
      id: `demo-answer-${Date.now()}`,
      role: "agent",
      content: `In the year-to-date sample, revenue is ${formatCurrency(REVENUE_YTD)} and recorded expenses are ${formatCurrency(totalExpenses)}, leaving ${formatCurrency(profit)} before other costs.`,
      timestamp,
      toolsUsed: ["Sales", "Expenses"],
      evidence: [
        { source: "Sales", metric: "Year-to-date revenue", value: formatCurrency(REVENUE_YTD), detail: `Reported revenue total: ${formatCurrency(REVENUE_YTD)}.`, fileName: "sales-oct-2026.csv", rowNumber: 11 },
        { source: "Expenses", metric: "Year-to-date expenses", value: formatCurrency(totalExpenses), detail: `Recorded expenses total: ${formatCurrency(totalExpenses)}.`, fileName: "expenses-oct-2026.csv", rowNumber: 2 },
      ],
      generationNotice: "This answer uses the read-only sample records.",
    };
  } else if (/stock|inventory|reorder|restock|item/.test(normalized)) {
    const atRisk = mockInventory
      .map((item, index) => ({ item, rowNumber: index + 2 }))
      .filter(({ item }) => item.currentStock <= item.minThreshold);
    response = {
      id: `demo-answer-${Date.now()}`,
      role: "agent",
      content: atRisk.length
        ? `${atRisk.length} items are at or below their reorder thresholds: ${atRisk.map(({ item }) => `${item.name} (${item.currentStock} on hand; reorder at ${item.minThreshold})`).join("; ")}.`
        : "No sample inventory items are below their reorder thresholds.",
      timestamp,
      toolsUsed: ["Inventory"],
      evidence: atRisk.map(({ item, rowNumber }) => ({
        source: "Inventory",
        metric: "Stock and reorder threshold",
        value: `${item.currentStock} on hand`,
        detail: `${item.name} Ã‚Â· ${item.id} Ã‚Â· ${item.currentStock} on hand Ã‚Â· reorder at ${item.minThreshold}.`,
        fileName: "inventory-oct-2026.csv",
        rowNumber,
      })),
      generationNotice: "This answer uses the read-only sample records.",
    };
  } else if (/review|customer|feedback|say|saying/.test(normalized)) {
    const positive = mockFeedback.filter((review) => review.sentiment === "Positive").length;
    const negative = mockFeedback.filter((review) => review.sentiment === "Negative").length;
    response = {
      id: `demo-answer-${Date.now()}`,
      role: "agent",
      content: `The sample contains ${mockFeedback.length} customer reviews: ${positive} positive and ${negative} negative. Customers praise product quality and support, while delivery delays and stock availability are concerns.`,
      timestamp,
      toolsUsed: ["Customer reviews"],
      evidence: mockFeedback.slice(0, 3).map((review, index) => ({
        source: "Customer review",
        metric: `${review.sentiment} Ã‚Â· ${review.topic}`,
        value: review.id,
        detail: review.comment,
        fileName: "customer-reviews-oct-2026.csv",
        rowNumber: index + 2,
      })),
      generationNotice: "This answer uses the read-only sample records.",
    };
  } else if (/forecast|predict|next month/.test(normalized)) {
    const recent = mockRevenueTrend.slice(-3);
    const forecast = recent.reduce((sum, point) => sum + point.revenue, 0) / recent.length;
    response = {
      id: `demo-answer-${Date.now()}`,
      role: "agent",
      content: `The three-month moving average forecast is ${formatCurrency(forecast)} for next month, based on the latest three sample revenue periods.`,
      timestamp,
      toolsUsed: ["Sales history"],
      evidence: recent.map((point, index) => ({
        source: "Monthly sales",
        metric: `${point.month} revenue`,
        value: formatCurrency(point.revenue),
        detail: `${point.month} 2026 revenue: ${formatCurrency(point.revenue)}.`,
        fileName: "sales-oct-2026.csv",
        rowNumber: mockRevenueTrend.length - recent.length + index + 2,
      })),
      generationNotice: "This answer uses the read-only sample records.",
    };
  } else {
    response = {
      id: `demo-answer-${Date.now()}`,
      role: "agent",
      content: "I can answer questions about profit changes, items to reorder, customer reviews, and the sales forecast. Try one of the supported questions below.",
      timestamp,
      toolsUsed: ["No records checked"],
      suggestedQuestions: [
        "Why did profit change?",
        "Which items need reordering?",
        "What are customers saying?",
        "What is the sales forecast?",
      ],
    };
  }

  saveDemoAssistantHistory(question, response);
  return response;
}

export async function fetchDashboardAlerts(): Promise<DashboardAlert[]> {
  return createDemoDashboard().alerts;
}

export async function queryAgent(question: string): Promise<AgentChatMessage> {
  return queryDemoAgent(question);
}

