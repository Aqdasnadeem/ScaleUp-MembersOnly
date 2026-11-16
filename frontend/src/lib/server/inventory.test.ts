import assert from "node:assert/strict";
import test from "node:test";
import { parseInventoryAlerts, parseInventoryHistory, parseInventoryProduct, parseInventoryProducts } from "../inventory";

const product = {
  product_id: 1,
  product_key: "P1",
  product_name: "Pen",
  category: null,
  stock_quantity: 0,
  snapshot_date: "2026-03-01",
  threshold: 10,
  status: "stockout",
};

test("inventory responses preserve actual stock and empty snapshot state", () => {
  assert.deepEqual(parseInventoryProduct(product), product);
  assert.deepEqual(
    parseInventoryAlerts({ threshold: 10, has_inventory: false, alerts: [] }),
    { threshold: 10, has_inventory: false, alerts: [] },
  );
  assert.deepEqual(
    parseInventoryAlerts({ threshold: 10, has_inventory: true, alerts: [product] }).alerts,
    [product],
  );
});

test("inventory responses reject missing and invalid fields instead of inventing stock", () => {
  assert.throws(() => parseInventoryAlerts({ threshold: 10, alerts: [] }), /invalid inventory alerts response/);
  assert.throws(() => parseInventoryProduct({ ...product, stock_quantity: null }), /invalid inventory product response/);
  assert.throws(() => parseInventoryProduct({ ...product, status: "unknown" }), /invalid inventory product response/);
});

test("inventory history preserves dated stock snapshots, including zero and empty history", () => {
  const history = {
    product_id: 1,
    snapshots: [
      { snapshot_date: "2026-03-01", stock_quantity: 12 },
      { snapshot_date: "2026-03-03", stock_quantity: 0 },
    ],
  };
  assert.deepEqual(parseInventoryHistory(history), history);
  assert.deepEqual(parseInventoryHistory({ product_id: 1, snapshots: [] }).snapshots, []);
  assert.deepEqual(parseInventoryProducts({ products: [product] }), [product]);
  assert.throws(() => parseInventoryHistory({ ...history, snapshots: null }), /invalid inventory history/);
  assert.throws(() => parseInventoryHistory({ ...history, snapshots: [{ snapshot_date: "2026-02-31", stock_quantity: 1 }] }), /invalid inventory history/);
  assert.throws(() => parseInventoryHistory({ ...history, snapshots: [{ snapshot_date: "2026-03-03", stock_quantity: null }] }), /invalid inventory history/);
});
