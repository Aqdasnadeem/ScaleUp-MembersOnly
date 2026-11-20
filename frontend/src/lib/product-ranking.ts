export interface ProductPerformance {
  product_id: number;
  product_key: string;
  product_name: string;
  gross_revenue: number;
  previous_gross_revenue: number;
  margin_percent: number | null;
}

export interface ProductRankingResponse {
  start_date: string;
  end_date: string;
  previous_start_date: string;
  previous_end_date: string;
  products_without_cost: number;
  products: ProductPerformance[];
}

export type ProductSortKey = "product_name" | "gross_revenue" | "previous_gross_revenue" | "margin_percent";
export type SortDirection = "ascending" | "descending";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseProductRanking(value: unknown): ProductRankingResponse {
  if (
    !isRecord(value) ||
    typeof value.start_date !== "string" ||
    typeof value.end_date !== "string" ||
    typeof value.previous_start_date !== "string" ||
    typeof value.previous_end_date !== "string" ||
    !isNumber(value.products_without_cost) ||
    !Array.isArray(value.products)
  ) {
    throw new Error("The server returned an invalid product ranking response.");
  }
  const products = value.products.map((item: unknown): ProductPerformance => {
    if (
      !isRecord(item) ||
      !isNumber(item.product_id) ||
      typeof item.product_key !== "string" ||
      typeof item.product_name !== "string" ||
      !isNumber(item.gross_revenue) ||
      !isNumber(item.previous_gross_revenue) ||
      (item.margin_percent != null && !isNumber(item.margin_percent))
    ) {
      throw new Error("The server returned an invalid product ranking response.");
    }
    return {
      product_id: item.product_id,
      product_key: item.product_key,
      product_name: item.product_name,
      gross_revenue: item.gross_revenue,
      previous_gross_revenue: item.previous_gross_revenue,
      margin_percent: item.margin_percent ?? null,
    };
  });
  return {
    start_date: value.start_date,
    end_date: value.end_date,
    previous_start_date: value.previous_start_date,
    previous_end_date: value.previous_end_date,
    products_without_cost: value.products_without_cost,
    products,
  };
}

export function sortProducts(
  products: ProductPerformance[],
  key: ProductSortKey,
  direction: SortDirection,
): ProductPerformance[] {
  return [...products].sort((a, b) => {
    const left = a[key];
    const right = b[key];
    if (left === null) return right === null ? a.product_key.localeCompare(b.product_key) : 1;
    if (right === null) return -1;
    const comparison = typeof left === "string" && typeof right === "string"
      ? left.localeCompare(right)
      : Number(left) - Number(right);
    return (direction === "ascending" ? comparison : -comparison) || a.product_key.localeCompare(b.product_key);
  });
}
