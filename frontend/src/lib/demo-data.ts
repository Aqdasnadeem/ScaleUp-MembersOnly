import type {
  AnomalyRecord,
  DashboardMetrics,
  ExpenseBreakdown,
  FeedbackRecord,
  ForecastDataPoint,
  InventoryItem,
  AnalysisHistoryItem,
  ProductPerformance,
  RecommendationItem,
  RevenueDataPoint,
} from "./types";

import { formatDate } from "./date";

export { DATE_FORMATS, formatDate } from "./date";
export type { DateFormat } from "./date";

export const DEMO_AS_OF = "2026-10-30";
export const SESSION_STORAGE_KEY = "scaleup-session-info";
export const STOCKOUT_START = "2026-10-01";
export const stockoutDays = Math.floor(
  (Date.parse(`${DEMO_AS_OF}T00:00:00Z`) - Date.parse(`${STOCKOUT_START}T00:00:00Z`)) /
    86_400_000
);

export const KEYBOARD = {
  sku: "SKU-102",
  name: "Mechanical Keyboard (Blue)",
  price: 8_500,
  // Revenue per unit in the same range as the other products (Rs 32 to 65).
  saleRate: 48,
  avgDailyUnits: 7,
  leadTimeDays: 14,
  minThreshold: 15,
} as const;

export const keyboardDailyLoss = KEYBOARD.saleRate * KEYBOARD.avgDailyUnits;
export const keyboardMonthlyLoss = keyboardDailyLoss * 30;
export const REVENUE_YTD = 342_500;
export const REVENUE_YTD_PREVIOUS = 303_638;
export const REVENUE_YTD_GROWTH = Number(
  (((REVENUE_YTD - REVENUE_YTD_PREVIOUS) / REVENUE_YTD_PREVIOUS) * 100).toFixed(1)
);

export function percentChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

export function formatCurrency(value: number, compact = false): string {
  const rounded = Math.round(Math.abs(value));
  const amount = compact && rounded >= 1000
    ? `${(rounded / 1000).toFixed(rounded % 1000 === 0 ? 0 : 1)}K`
    : rounded.toLocaleString("en-PK");
  return `${value < 0 ? "-" : ""}Rs ${amount}`;
}

interface ProductRecord extends Omit<ProductPerformance, "growth"> {
  lastUnitsSold: number;
  lastRevenue: number;
  lastMargin: number;
}

const productRecords: ProductRecord[] = [
  {
    sku: "SKU-101",
    name: "Wireless Ergonomic Mouse",
    category: "Electronics",
    unitsSold: 420,
    revenue: 13_440,
    lastUnitsSold: 354,
    lastRevenue: 11_342,
    margin: 44,
    lastMargin: 45,
    status: "Stable",
  },
  {
    sku: KEYBOARD.sku,
    name: KEYBOARD.name,
    category: "Electronics",
    unitsSold: 0,
    revenue: 0,
    lastUnitsSold: KEYBOARD.avgDailyUnits * 30,
    lastRevenue: keyboardMonthlyLoss,
    margin: 52,
    lastMargin: 53,
    status: "Declining",
  },
  {
    sku: "SKU-103",
    name: "USB-C Multiport Hub 7-in-1",
    category: "Accessories",
    unitsSold: 310,
    revenue: 13_950,
    lastUnitsSold: 287,
    lastRevenue: 12_893,
    margin: 38,
    lastMargin: 39,
    status: "Stable",
  },
  {
    sku: "SKU-104",
    name: "Noise-Canceling Desk Headset",
    category: "Audio",
    unitsSold: 190,
    revenue: 12_350,
    lastUnitsSold: 223,
    lastRevenue: 14_461,
    margin: 48,
    lastMargin: 49,
    status: "Declining",
  },
  {
    sku: "SKU-105",
    name: "Laptop Aluminum Riser Stand",
    category: "Furniture",
    unitsSold: 510,
    revenue: 19_380,
    lastUnitsSold: 410,
    lastRevenue: 15_591,
    margin: 58,
    lastMargin: 59,
    status: "Top Performer",
  },
];

export const mockProducts: ProductPerformance[] = productRecords.map((record) => ({
  sku: record.sku,
  name: record.name,
  category: record.category,
  unitsSold: record.unitsSold,
  revenue: record.revenue,
  growth: percentChange(record.revenue, record.lastRevenue),
  margin: record.margin,
  status: record.status,
}));

export const OCTOBER_REVENUE = mockProducts.reduce((sum, product) => sum + product.revenue, 0);
export const SEPTEMBER_PRODUCT_REVENUE = productRecords.reduce((sum, record) => sum + record.lastRevenue, 0);
export const PRODUCT_REVENUE_GROWTH = percentChange(OCTOBER_REVENUE, SEPTEMBER_PRODUCT_REVENUE);

function buildOrderLines(): Array<{ orderId: string; sku: string; quantity: number }> {
  const quantities = [2, 3, 1, 4];
  const lines: Array<{ orderId: string; sku: string; quantity: number }> = [];
  let orderNumber = 0;
  mockProducts.forEach((product, productIndex) => {
    let remaining = product.unitsSold;
    let position = 0;
    while (remaining > 0) {
      const quantity = Math.min(quantities[(position + productIndex) % quantities.length], remaining);
      // Every third line joins the previous order, so orders and lines differ.
      if (position % 3 !== 2 || orderNumber === 0) orderNumber += 1;
      lines.push({ orderId: `ORD-${String(orderNumber).padStart(4, "0")}`, sku: product.sku, quantity });
      remaining -= quantity;
      position += 1;
    }
  });
  return lines;
}

export const mockOrderLines = buildOrderLines();
export const TOTAL_ORDERS = new Set(mockOrderLines.map((line) => line.orderId)).size;

const expenseRows: Array<Omit<ExpenseBreakdown, "percentage">> = [
  { category: "Inventory Procurement", amount: 132_000, budget: 95_000, trend: "Normal" },
  { category: "Logistics & Shipping", amount: 33_100, budget: 22_000, trend: "" },
  { category: "Marketing & Customer Ads", amount: 25_800, budget: 28_000, trend: "Within Budget" },
  { category: "Staff & Payroll", amount: 22_100, budget: 22_100, trend: "On Target" },
  { category: "Utilities, SaaS & Cloud", amount: 11_200, budget: 12_000, trend: "Optimal" },
];

export const totalExpenses = expenseRows.reduce((sum, expense) => sum + expense.amount, 0);
const LOGISTICS_PREVIOUS_EXPENSE = 22_365;
export const LOGISTICS_MOM_CHANGE = percentChange(33_100, LOGISTICS_PREVIOUS_EXPENSE);

export const mockExpensesBreakdown: ExpenseBreakdown[] = expenseRows.map((expense) => ({
  ...expense,
  percentage: Number(((expense.amount / totalExpenses) * 100).toFixed(1)),
  trend: expense.category === "Logistics & Shipping" ? `+${LOGISTICS_MOM_CHANGE}% vs last month` : expense.trend,
}));

export const totalExpenseBudget = mockExpensesBreakdown.reduce((sum, expense) => sum + expense.budget, 0);
const logisticsExpense = mockExpensesBreakdown.find((expense) => expense.category === "Logistics & Shipping");
if (!logisticsExpense) throw new Error("Shared logistics expense data is missing.");
export const LOGISTICS_EXPENSE = logisticsExpense.amount;
export const LOGISTICS_BUDGET = logisticsExpense.budget;
export const logisticsOverspend = LOGISTICS_EXPENSE - LOGISTICS_BUDGET;
export const logisticsOverspendPercent = Math.round((logisticsOverspend / LOGISTICS_BUDGET) * 100);
export const TOTAL_UNITS_SOLD = mockProducts.reduce((total, product) => total + product.unitsSold, 0);
export const UNIT_SALES_CHANGE = percentChange(
  TOTAL_UNITS_SOLD,
  productRecords.reduce((total, record) => total + record.lastUnitsSold, 0),
);

export const mockRevenueTrend: RevenueDataPoint[] = [
  { month: "Jan", revenue: 22_000, expenses: 18_000, target: 25_000 },
  { month: "Feb", revenue: 25_000, expenses: 19_200, target: 26_000 },
  { month: "Mar", revenue: 28_000, expenses: 20_500, target: 28_000 },
  { month: "Apr", revenue: 26_500, expenses: 19_800, target: 29_000 },
  { month: "May", revenue: 32_500, expenses: 22_100, target: 32_000 },
  { month: "Jun", revenue: 38_000, expenses: 24_500, target: 35_000 },
  { month: "Jul", revenue: 35_000, expenses: 23_800, target: 36_000 },
  { month: "Aug", revenue: 41_000, expenses: 26_200, target: 38_000 },
  { month: "Sep", revenue: 35_380, expenses: 24_900, target: 40_000 },
  { month: "Oct", revenue: OCTOBER_REVENUE, expenses: 25_200, target: 42_000 },
];

export type ReportingRange = "30D" | "90D" | "YTD";

export function getPeriodFinancials(range: ReportingRange) {
  const currentPoints = range === "YTD"
    ? mockRevenueTrend
    : mockRevenueTrend.slice(range === "90D" ? -3 : -1);
  const previousPoints = range === "YTD"
    ? null
    : mockRevenueTrend.slice(range === "90D" ? -6 : -2, range === "90D" ? -3 : -1);
  const revenue = currentPoints.reduce((total, point) => total + point.revenue, 0);
  const expenses = currentPoints.reduce((total, point) => total + point.expenses, 0);
  const previousRevenue = range === "YTD"
    ? REVENUE_YTD_PREVIOUS
    : range === "30D"
    ? SEPTEMBER_PRODUCT_REVENUE
    : previousPoints?.reduce((total, point) => total + point.revenue, 0) ?? 0;
  const change = percentChange(revenue, previousRevenue);
  const comparisonLabel = range === "YTD"
    ? "vs previous year"
    : `vs previous ${range === "30D" ? "30" : "90"} days`;
  return { revenue, expenses, previousRevenue, change, comparisonLabel, points: currentPoints };
}

export const mockInventory: InventoryItem[] = [
  {
    id: "SKU-101",
    name: "Wireless Ergonomic Mouse",
    category: "Electronics",
    currentStock: 4,
    minThreshold: 20,
    unitPrice: 3_200,
    reorderLeadDays: 7,
    supplier: "TechDistro Karachi",
    status: "Low Stock",
  },
  {
    id: KEYBOARD.sku,
    name: KEYBOARD.name,
    category: "Electronics",
    currentStock: 0,
    minThreshold: KEYBOARD.minThreshold,
    unitPrice: KEYBOARD.price,
    reorderLeadDays: KEYBOARD.leadTimeDays,
    supplier: "Global Peripherals",
    status: "Out of Stock",
  },
  {
    id: "SKU-103",
    name: "USB-C Multiport Hub 7-in-1",
    category: "Accessories",
    currentStock: 18,
    minThreshold: 15,
    unitPrice: 4_500,
    reorderLeadDays: 5,
    supplier: "Harbor Tech Hub",
    status: "In Stock",
  },
  {
    id: "SKU-104",
    name: "Noise-Canceling Desk Headset",
    category: "Audio",
    currentStock: 7,
    minThreshold: 25,
    unitPrice: 6_500,
    reorderLeadDays: 10,
    supplier: "Acoustic Supplies",
    status: "Low Stock",
  },
  {
    id: "SKU-105",
    name: "Laptop Aluminum Riser Stand",
    category: "Furniture",
    currentStock: 62,
    minThreshold: 10,
    unitPrice: 3_800,
    reorderLeadDays: 4,
    supplier: "ErgoCraft Studio",
    status: "In Stock",
  },
];

export const itemsAtRisk = mockInventory.filter((item) => item.status !== "In Stock").length;
export const inventoryValue = mockInventory.reduce(
  (total, item) => total + item.currentStock * item.unitPrice,
  0
);
export const grossMarginPercent = Number(
  (
    mockProducts.reduce((total, product) => total + product.revenue * product.margin, 0) /
    OCTOBER_REVENUE
  ).toFixed(1)
);
const septemberGrossMargin = Number(
  (
    productRecords.reduce((total, record) => total + record.lastRevenue * record.lastMargin, 0) /
    SEPTEMBER_PRODUCT_REVENUE
  ).toFixed(1)
);
export const GROSS_MARGIN_CHANGE = Number((grossMarginPercent - septemberGrossMargin).toFixed(1));
export const netProfitYtd = REVENUE_YTD - totalExpenses;
export const netProfitMarginYtd = Number(((netProfitYtd / REVENUE_YTD) * 100).toFixed(1));

export const mockFeedback: FeedbackRecord[] = [
  {
    id: "REV-801",
    customer: "Daniyal Siddiqui",
    sentiment: "Negative",
    score: 0.94,
    topic: "Shipping Delay",
    comment: "Delivery took 6 days to reach Clifton. Product is premium but courier service was terribly slow.",
    date: "2026-10-07",
    relatedSku: "SKU-101",
  },
  {
    id: "REV-802",
    customer: "Zainab Malik",
    sentiment: "Positive",
    score: 0.98,
    topic: "Product Quality",
    comment: "The aluminum laptop stand is flawless. Solid build, perfect ergonomics for daily office use.",
    date: "2026-10-06",
    relatedSku: "SKU-105",
  },
  {
    id: "REV-803",
    customer: "Bilal Farooq",
    sentiment: "Negative",
    score: 0.89,
    topic: "Stock Availability",
    comment: "Tried to order 5 keyboards for our engineering team but the keyboard has been out of stock since the start of the month.",
    date: "2026-10-14",
    relatedSku: KEYBOARD.sku,
  },
  {
    id: "REV-804",
    customer: "Hira Mansoor",
    sentiment: "Positive",
    score: 0.91,
    topic: "Customer Service",
    comment: "Support team answered my queries regarding USB-C hub compatibility within 10 minutes.",
    date: "2026-10-04",
    relatedSku: "SKU-103",
  },
];

export const RELATED_REVIEW_COUNT = mockFeedback.filter(
  (review) => review.topic === "Shipping Delay" || review.topic === "Stock Availability",
).length;

export const mockAnomalies: AnomalyRecord[] = [
  {
    id: "ANO-2026-01",
    title: "Courier costs above the monthly budget",
    category: "expenses",
    severity: "high",
    detectedAt: DEMO_AS_OF,
    description: `Courier costs rose ${LOGISTICS_MOM_CHANGE}% month-over-month.`,
    deviation: `${formatCurrency(logisticsOverspend)} over budget (+${logisticsOverspendPercent}%)`,
    affectedEntity: "Logistics & Shipping",
    evidence: "Courier costs were higher than the monthly plan.",
  },
  {
    id: "ANO-2026-02",
    title: "Mechanical Keyboard stockout",
    category: "sales",
    severity: "medium",
    detectedAt: DEMO_AS_OF,
    description: `Mechanical Keyboard sales have been stopped for ${stockoutDays} days because stock is at zero.`,
    deviation: "No October sales",
    affectedEntity: `${KEYBOARD.sku} (${KEYBOARD.name})`,
    evidence: `Stock reached zero on ${STOCKOUT_START}; estimated missed sales are ${formatCurrency(keyboardDailyLoss)} per day.`,
  },
  {
    id: "ANO-2026-03",
    title: "Customer reviews mention delivery delays",
    category: "feedback",
    severity: "low",
    detectedAt: "2026-10-14",
    description: "Customers reported late deliveries and unavailable keyboards.",
    deviation: `${RELATED_REVIEW_COUNT} related reviews`,
    affectedEntity: "Customer reviews",
    evidence: "Customer review search found comments about courier delays and stock availability.",
  },
];

export const mockMetrics: DashboardMetrics = {
  totalRevenue: REVENUE_YTD,
  revenueChange: REVENUE_YTD_GROWTH,
  totalExpenses,
  expenseChange: -4.3,
  lowStockItems: itemsAtRisk,
  totalOrders: TOTAL_ORDERS,
  activeAnomalies: mockAnomalies.length,
  customerSentimentScore: 84,
};

export const mockInvestigationSteps = [
  {
    stepNumber: 1,
    tool: "Sales",
    domain: "Sales & Orders",
    action: "Checked October revenue by product.",
    finding: `October sales were ${formatCurrency(OCTOBER_REVENUE)}. Mechanical Keyboard sales stopped when stock ran out.`,
  },
  {
    stepNumber: 2,
    tool: "Stock",
    domain: "Warehouse Stock",
    action: "Checked stock and reorder levels.",
    finding: `SKU-102 has 0 units against a minimum of ${KEYBOARD.minThreshold}; the mouse and headset are also low.`,
  },
  {
    stepNumber: 3,
    tool: "Expenses",
    domain: "Operating Costs",
    action: "Compared courier invoices with the monthly budget.",
    finding: `Courier costs are ${formatCurrency(logisticsOverspend)} over budget and ${LOGISTICS_MOM_CHANGE}% higher than last month.`,
  },
  {
    stepNumber: 4,
    tool: "Reviews",
    domain: "Customer Reviews",
    action: "Searched customer reviews for stock and delivery issues.",
    finding: "Customers mentioned delayed deliveries and unavailable keyboards.",
  },
];

export const mockRecommendations: RecommendationItem[] = [
  {
    id: "REC-01",
    priority: "High",
    title: "Reorder keyboards and mice",
    action: "Place a standard reorder for 120 Mechanical Keyboards and 40 Ergonomic Mice, and set a reorder alert at the minimum threshold so rush shipping isn't needed again.",
    rationale: "Standard replenishment addresses low stock without adding more rush-shipping costs.",
    expectedImpact: `Estimated ${formatCurrency(keyboardMonthlyLoss)} monthly sales opportunity`,
    difficulty: "Easy",
    evidenceIds: ["ANO-2026-02", "REV-803"],
  },
  {
    id: "REC-02",
    priority: "High",
    title: "Review courier costs",
    action: "Review the courier invoices and use scheduled deliveries where possible.",
    rationale: `Courier spending is above the monthly budget and rose ${LOGISTICS_MOM_CHANGE}% compared with last month.`,
    expectedImpact: `${formatCurrency(logisticsOverspend)} monthly overspend to review`,
    difficulty: "Moderate",
    evidenceIds: ["ANO-2026-01", "REV-801"],
  },
  {
    id: "REC-03",
    priority: "Medium",
    title: "Set low-stock alerts",
    action: "Set reorder alerts at the minimum stock level for the mouse and headset.",
    rationale: "Alerts give the team time to reorder before stock runs out.",
    expectedImpact: "Earlier warning for low-stock items",
    difficulty: "Easy",
    evidenceIds: ["ANO-2026-02"],
  },
];

export const mockForecast: ForecastDataPoint[] = [
  { month: "May", historical: 32_500 },
  { month: "Jun", historical: 38_000 },
  { month: "Jul", historical: 35_000 },
  { month: "Aug", historical: 41_000 },
  { month: "Sep", historical: 35_380 },
  { month: "Oct", historical: OCTOBER_REVENUE },
  { month: "Nov", forecast: 51_200, upperBound: 54_100, lowerBound: 48_300 },
  { month: "Dec", forecast: 58_900, upperBound: 63_200, lowerBound: 54_600 },
  { month: "Jan", forecast: 52_400, upperBound: 56_800, lowerBound: 48_000 },
  { month: "Feb", forecast: 54_800, upperBound: 59_400, lowerBound: 50_200 },
];

export const mockHistory: AnalysisHistoryItem[] = [
  {
    id: "HIS-101",
    timestamp: `${DEMO_AS_OF} 14:22`,
    question: "Why did net profit margin decline in October despite positive gross sales?",
    category: "Financials & Expenses",
    toolsCalled: ["Sales", "Expenses", "Stock"],
    summary: "Mechanical Keyboard stock ran out and courier spending rose above budget.",
    status: "Action Required" as const,
  },
  {
    id: "HIS-102",
    timestamp: "2026-10-29 10:45",
    question: "Which items are at high risk of stockout?",
    category: "Inventory & Supply Chain",
    toolsCalled: ["Stock", "Sales"],
    summary: "Three items are at risk: one is out of stock and two are low.",
    status: "Completed" as const,
  },
  {
    id: "HIS-103",
    timestamp: "2026-10-28 16:15",
    question: "What are customers saying about delivery delays?",
    category: "Customer Feedback",
    toolsCalled: ["Reviews"],
    summary: "Customer reviews mention late deliveries and unavailable keyboards.",
    status: "Completed" as const,
  },
];

export function formatDateTime(value: string): string {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/);
  if (!match) return value;
  return match[2] ? `${formatDate(match[1])} ${match[2]}` : formatDate(match[1]);
}

export const DEMO_SCENARIOS = [
  { keys: ["margin", "profit"], id: "margin" },
  { keys: ["stock", "stockout", "reorder"], id: "stockout" },
  { keys: ["complaint", "review", "feedback"], id: "feedback" },
  { keys: ["forecast", "predict", "next month"], id: "forecast" },
] as const;

export type DemoScenarioId = (typeof DEMO_SCENARIOS)[number]["id"] | "unsupported";

export function matchScenario(question: string): DemoScenarioId {
  const normalized = question.toLowerCase();
  return DEMO_SCENARIOS.find((scenario) =>
    scenario.keys.some((key) => normalized.includes(key))
  )?.id ?? "unsupported";
}
