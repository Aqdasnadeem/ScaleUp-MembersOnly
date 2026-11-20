"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getInventoryProduct } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { useBusiness } from "@/hooks/useBusiness";
import type { InventoryProduct } from "@/lib/inventory";
import InventoryHistoryChart from "@/components/InventoryHistoryChart";
import Skeleton from "@/components/Skeleton";

export default function InventoryProductDetails({ productId }: { productId: string }) {
  const { business } = useBusiness();
  const [product, setProduct] = useState<InventoryProduct | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getInventoryProduct(productId)
      .then((result) => { if (active) setProduct(result); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load product inventory.");
      });
    return () => { active = false; };
  }, [productId]);

  return (
    <div className="space-y-6 pb-12">
      <Link href="/analytics/inventory" className="inline-block text-sm font-bold text-[#72571F] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#72571F]">
        Back to stock alerts
      </Link>
      {error ? (
        <p className="rounded-xl border border-[#8B2F2F] bg-white p-4 text-sm text-[#8B2F2F]" role="alert">Unable to load product: {error}</p>
      ) : !product ? (
        <div className="space-y-3 rounded-2xl border border-[#354261] bg-[#1B2540] p-6" role="status" aria-label="Loading product inventory">
          <Skeleton className="h-7 w-1/2 bg-[#354261]" />
          <Skeleton className="h-4 w-1/4 bg-[#354261]" />
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full bg-[#354261]" />)}
          </div>
        </div>
      ) : (
        <section className="rounded-2xl border border-[#354261] bg-[#1B2540] p-6 text-[#F7F3EC]">
          <h1 className="text-2xl font-bold">{product.product_name}</h1>
          <p className="mt-1 text-sm text-[#D8DCE6]">{product.product_key}</p>
          <dl className="mt-6 grid gap-5 sm:grid-cols-2">
            <div><dt className="text-sm text-[#D8DCE6]">Stock status</dt><dd className="mt-1 font-bold">{product.status === "stockout" ? "Stockout" : product.status === "low_stock" ? "Low stock" : "In stock"}</dd></div>
            <div><dt className="text-sm text-[#D8DCE6]">Current stock</dt><dd className="mt-1 font-bold">{product.stock_quantity} units</dd></div>
            <div><dt className="text-sm text-[#D8DCE6]">Low-stock threshold</dt><dd className="mt-1 font-bold">{product.threshold} units</dd></div>
            <div><dt className="text-sm text-[#D8DCE6]">Latest snapshot</dt><dd className="mt-1 font-bold">{formatDate(product.snapshot_date, business?.date_format)}</dd></div>
            {product.category && <div><dt className="text-sm text-[#D8DCE6]">Category</dt><dd className="mt-1 font-bold">{product.category}</dd></div>}
          </dl>
        </section>
      )}
      {product && <InventoryHistoryChart key={productId} productId={productId} dateFormat={business?.date_format} />}
    </div>
  );
}
