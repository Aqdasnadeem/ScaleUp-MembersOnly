import assert from "node:assert/strict";
import test from "node:test";
import { parseProductRanking, sortProducts } from "../product-ranking";

const response = {
  start_date: "2026-03-10",
  end_date: "2026-03-11",
  previous_start_date: "2026-03-08",
  previous_end_date: "2026-03-09",
  products_without_cost: 1,
  products: [
    { product_id: 1, product_key: "A", product_name: "Pen", gross_revenue: 20, previous_gross_revenue: 10, margin_percent: 60 },
    { product_id: 2, product_key: "B", product_name: "Cap", gross_revenue: 5, previous_gross_revenue: 0 },
    { product_id: 3, product_key: "C", product_name: "Mug", gross_revenue: 10, previous_gross_revenue: 20, margin_percent: 0 },
  ],
};

test("ranking preserves absent and zero margins and sorts numeric columns both ways", () => {
  const products = parseProductRanking(response).products;
  assert.equal(products[1].margin_percent, null);
  assert.equal(products[2].margin_percent, 0);
  assert.deepEqual(sortProducts(products, "gross_revenue", "ascending").map((p) => p.product_key), ["B", "C", "A"]);
  assert.deepEqual(sortProducts(products, "gross_revenue", "descending").map((p) => p.product_key), ["A", "C", "B"]);
  assert.deepEqual(sortProducts(products, "margin_percent", "ascending").map((p) => p.product_key), ["C", "A", "B"]);
  assert.deepEqual(sortProducts(products, "margin_percent", "descending").map((p) => p.product_key), ["A", "C", "B"]);
});

test("ranking accepts empty results but rejects malformed payloads", () => {
  assert.deepEqual(parseProductRanking({ ...response, products: [] }).products, []);
  assert.throws(() => parseProductRanking({ ...response, products: null }), /invalid product ranking response/);
  assert.throws(() => parseProductRanking({ ...response, products: [{ ...response.products[0], gross_revenue: "20" }] }), /invalid product ranking response/);
  assert.throws(() => parseProductRanking({ ...response, products: [{ ...response.products[0], margin_percent: "unknown" }] }), /invalid product ranking response/);
});
