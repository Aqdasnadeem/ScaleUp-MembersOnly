"use client";

import { useEffect, useState } from "react";
import { getProductRanking } from "@/lib/api";
import { formatDate } from "@/lib/date";
import {
  sortProducts,
  type ProductRankingResponse,
  type ProductSortKey,
  type SortDirection,
} from "@/lib/product-ranking";
import Skeleton from "@/components/Skeleton";

const columns: Array<{ key: ProductSortKey; label: string }> = [
  { key: "product_name", label: "Product" },
  { key: "gross_revenue", label: "Gross revenue" },
  { key: "previous_gross_revenue", label: "Previous revenue" },
  { key: "margin_percent", label: "Margin" },
];

export default function ProductRankingTable({
  startDate,
  endDate,
  currency,
  dateFormat,
}: {
  startDate: string;
  endDate: string;
  currency: string;
  dateFormat: string;
}) {
  const [data, setData] = useState<ProductRankingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<ProductSortKey>("gross_revenue");
  const [direction, setDirection] = useState<SortDirection>("descending");

  useEffect(() => {
    let active = true;
    getProductRanking({ startDate, endDate })
      .then((result) => { if (active) setData(result); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load product rankings.");
      });
    return () => { active = false; };
  }, [startDate, endDate]);

  function changeSort(key: ProductSortKey) {
    if (key === sortKey) {
      setDirection((current) => current === "ascending" ? "descending" : "ascending");
    } else {
      setSortKey(key);
      setDirection(key === "product_name" ? "ascending" : "descending");
    }
  }

  const money = (value: number) => new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);

  return (
    <section className="rounded-2xl border border-[#354261] bg-[#1B2540] p-5 text-[#F7F3EC] shadow-sm sm:p-6" aria-labelledby="product-ranking-heading">
      <h2 id="product-ranking-heading" className="text-lg font-bold">Product performance ranking</h2>
      {error ? (
        <p className="mt-5 rounded-xl border border-[#E8A6A6] p-4 text-sm" role="alert">
          Unable to load product rankings: {error}
        </p>
      ) : !data ? (
        <div className="mt-5 space-y-2.5" role="status" aria-label="Loading product rankings">
          <Skeleton className="h-4 w-1/3 bg-[#354261]" />
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full bg-[#354261]" />)}
        </div>
      ) : data.products.length === 0 ? (
        <p className="mt-5 text-sm">No product sales were found in either comparison period.</p>
      ) : (
        <div className="mt-5">
          {data.products_without_cost > 0 && (
            <p className="mb-3 text-sm text-[#D8DCE6]">
              {data.products_without_cost} product{data.products_without_cost === 1 ? "" : "s"} shown without a cost have margin N/A.
            </p>
          )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Product revenue and margin comparison. Select a column heading to sort.</caption>
            <thead>
              <tr className="border-b border-[#8290A8]">
                {columns.map(({ key, label }) => (
                  <th key={key} scope="col" aria-sort={sortKey === key ? direction : "none"} className="pb-3 pr-4">
                    <button
                      type="button"
                      onClick={() => changeSort(key)}
                      title={key === "previous_gross_revenue"
                        ? `Previous period: ${formatDate(data.previous_start_date, dateFormat)}–${formatDate(data.previous_end_date, dateFormat)}`
                        : undefined}
                      className="min-h-11 font-bold text-[#F7F3EC] hover:text-[#E9C985] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F7F3EC]"
                    >
                      {label} {sortKey === key && <span aria-hidden="true">{direction === "ascending" ? "↑" : "↓"}</span>}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortProducts(data.products, sortKey, direction).map((product) => (
                <tr key={product.product_id} className="border-b border-[#53617A]">
                  <th scope="row" className="py-4 pr-4 font-semibold">
                    {product.product_name}
                    <span className="block text-xs font-normal text-[#D8DCE6]">{product.product_key}</span>
                  </th>
                  <td className="py-4 pr-4">{money(product.gross_revenue)}</td>
                  <td className="py-4 pr-4">{money(product.previous_gross_revenue)}</td>
                  <td className="py-4 pr-4">{product.margin_percent === null ? "N/A" : `${product.margin_percent.toFixed(1)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}
    </section>
  );
}
