export type DataCategory = "sales" | "inventory" | "expenses" | "feedback" | "products" | "customers";

export interface DashboardMetrics {
  totalRevenue: number;
  revenueChange: number;
  totalExpenses: number;
  expenseChange: number;
  lowStockItems: number;
  totalOrders: number;
  activeAnomalies: number;
  customerSentimentScore: number;
}

export interface RevenueDataPoint {
  month: string;
  revenue: number;
  expenses: number;
  target: number;
}

export interface ProductPerformance {
  sku: string;
  name: string;
  category: string;
  unitsSold: number;
  revenue: number;
  growth: number;
  margin: number;
  status: "Top Performer" | "Stable" | "Declining";
}

export interface ExpenseBreakdown {
  category: string;
  amount: number;
  budget: number;
  percentage: number;
  trend: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  currentStock: number;
  minThreshold: number;
  unitPrice: number;
  reorderLeadDays: number;
  supplier: string;
  status: "In Stock" | "Low Stock" | "Out of Stock";
}

export interface FeedbackRecord {
  id: string;
  customer: string;
  sentiment: "Positive" | "Neutral" | "Negative";
  score: number; // e.g. 0.94
  topic: string;
  comment: string;
  date: string;
  relatedSku?: string;
}

export interface AnomalyRecord {
  id: string;
  title: string;
  category: "sales" | "inventory" | "expenses" | "feedback";
  severity: "high" | "medium" | "low";
  detectedAt: string;
  description: string;
  deviation: string;
  affectedEntity: string;
  evidence: string;
}

export interface EvidenceItem {
  source: string;
  metric: string;
  value: string;
  detail: string;
  fileName?: string;
  rowNumber?: number;
  rowData?: Record<string, string>;
}

export interface RecommendationItem {
  id: string;
  priority: "High" | "Medium" | "Low";
  title: string;
  action: string;
  rationale: string;
  expectedImpact: string;
  difficulty: "Easy" | "Moderate" | "Strategic";
  evidenceIds: string[];
}

export interface InvestigationStep {
  stepNumber: number;
  tool: string;
  domain: string;
  action: string;
  finding: string;
  confidence?: number;
}

export interface AgentChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: string;
  toolsUsed?: string[];
  evidence?: EvidenceItem[];
  recommendations?: RecommendationItem[];
  investigationSteps?: string[];
  technicalDetails?: string;
  suggestedQuestions?: string[];
  generationNotice?: string;
}

export interface AnalysisHistoryItem {
  id: string;
  timestamp: string;
  question: string;
  category: string;
  toolsCalled: string[];
  summary: string;
  status: "Completed" | "Flagged" | "Action Required" | "Unsupported";
}

export interface ForecastDataPoint {
  month: string;
  historical?: number;
  forecast?: number;
  upperBound?: number;
  lowerBound?: number;
}
