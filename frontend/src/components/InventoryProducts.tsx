"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getInventoryProducts } from "@/lib/api";
import type { InventoryProduct } from "@/lib/inventory";
import Skeleton from "@/components/Skeleton";

export default function InventoryProducts() {
  const [products, setProducts] = useState<InventoryProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getInventoryProducts()
      .then((result) => { if (active) setProducts(result); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load inventory products.");
      });
    return () => { active = false; };
  }, []);

  return (
    <section className="rounded-2xl border border-[#354261] bg-[#1B2540] p-5 text-[#F7F3EC] shadow-sm sm:p-6" aria-labelledby="inventory-products-heading">
      <h2 id="inventory-products-heading" className="text-lg font-bold">Inventory products</h2>
      <p className="mt-1 text-sm text-[#D8DCE6]">Select a product to view its recorded stock history.</p>
      {error ? (
        <p className="mt-5 rounded-xl border border-[#E8A6A6] p-4 text-sm" role="alert">Unable to load inventory products: {error}</p>
      ) : !products ? (
        <div className="mt-5 space-y-2.5" role="status" aria-label="Loading inventory products">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full bg-[#354261]" />)}
        </div>
      ) : products.length === 0 ? (
        <p className="mt-5 text-sm">No inventory snapshots found. Upload inventory data to view product history.</p>
      ) : (
        <ul className="mt-4 divide-y divide-[#53617A]">
          {products.map((product) => (
            <li key={product.product_id}>
              <Link href={`/analytics/inventory/${product.product_id}`} className="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-lg px-2 py-4 hover:bg-[#293655] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F7F3EC]">
                <span><span className="block font-bold">{product.product_name}</span><span className="block text-xs text-[#D8DCE6]">{product.product_key}</span></span>
                <span className="text-sm">{product.stock_quantity} units</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
