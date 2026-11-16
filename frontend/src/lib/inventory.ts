export type StockStatus = "stockout" | "low_stock" | "in_stock";

export interface InventoryProduct {
  product_id: number;
  product_key: string;
  product_name: string;
  category: string | null;
  stock_quantity: number;
  snapshot_date: string;
  threshold: number;
  status: StockStatus;
}

export interface InventoryAlertsResponse {
  threshold: number;
  has_inventory: boolean;
  alerts: InventoryProduct[];
}

export interface InventoryHistoryResponse {
  product_id: number;
  snapshots: Array<{ snapshot_date: string; stock_quantity: number }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function parseInventoryProduct(value: unknown): InventoryProduct {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.product_id) || value.product_id === 0 ||
    typeof value.product_key !== "string" ||
    typeof value.product_name !== "string" ||
    (value.category !== null && typeof value.category !== "string") ||
    !isNonNegativeInteger(value.stock_quantity) ||
    typeof value.snapshot_date !== "string" ||
    !isNonNegativeInteger(value.threshold) ||
    (value.status !== "stockout" && value.status !== "low_stock" && value.status !== "in_stock")
  ) {
    throw new Error("The server returned an invalid inventory product response.");
  }
  return {
    product_id: value.product_id,
    product_key: value.product_key,
    product_name: value.product_name,
    category: value.category,
    stock_quantity: value.stock_quantity,
    snapshot_date: value.snapshot_date,
    threshold: value.threshold,
    status: value.status,
  };
}

export function parseInventoryAlerts(value: unknown): InventoryAlertsResponse {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.threshold) ||
    typeof value.has_inventory !== "boolean" ||
    !Array.isArray(value.alerts)
  ) {
    throw new Error("The server returned an invalid inventory alerts response.");
  }
  return {
    threshold: value.threshold,
    has_inventory: value.has_inventory,
    alerts: value.alerts.map(parseInventoryProduct),
  };
}

export function parseInventoryProducts(value: unknown): InventoryProduct[] {
  if (!isRecord(value) || !Array.isArray(value.products)) {
    throw new Error("The server returned an invalid inventory products response.");
  }
  return value.products.map(parseInventoryProduct);
}

export function parseInventoryHistory(value: unknown): InventoryHistoryResponse {
  if (!isRecord(value) || !isNonNegativeInteger(value.product_id) || value.product_id === 0 || !Array.isArray(value.snapshots)) {
    throw new Error("The server returned an invalid inventory history response.");
  }
  const snapshots = value.snapshots.map((snapshot: unknown) => {
    if (
      !isRecord(snapshot) ||
      typeof snapshot.snapshot_date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.snapshot_date) ||
      !Number.isFinite(Date.parse(`${snapshot.snapshot_date}T00:00:00Z`)) ||
      new Date(`${snapshot.snapshot_date}T00:00:00Z`).toISOString().slice(0, 10) !== snapshot.snapshot_date ||
      !isNonNegativeInteger(snapshot.stock_quantity)
    ) {
      throw new Error("The server returned an invalid inventory history response.");
    }
    return { snapshot_date: snapshot.snapshot_date, stock_quantity: snapshot.stock_quantity };
  });
  return { product_id: value.product_id, snapshots };
}
