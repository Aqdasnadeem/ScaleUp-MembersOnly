import assert from "node:assert/strict";
import test from "node:test";
import { validateCsv } from "./csv";

const salesHeader =
  "order_id,date,customer_id,product_id,quantity,unit_price,total_amount";

test("validates the required columns and accepts a valid sales row", () => {
  const result = validateCsv(
    `${salesHeader}\nORD-1,2026-10-01,CUST-1,SKU-1,2,10.5,21`,
    "sales",
  );
  assert.equal(result.valid, true);
  assert.deepEqual(result.rows[0]?.data.total_amount, "21");
  assert.deepEqual(result.rowErrors, []);
});

test("preserves unmapped optional source columns when headers already match", () => {
  const result = validateCsv(
    `${salesHeader},channel\nORD-1,2026-10-01,CUST-1,SKU-1,2,10,20,web`,
    "sales",
  );
  assert.equal(result.valid, true);
  assert.equal(result.rows[0]?.data.channel, "web");
});

test("maps source CSV headers to the required sales fields before validation", () => {
  const result = validateCsv(
    "Order,Sale Date,Customer,SKU,Units,Price,Revenue\nORD-1,2026-10-01,CUST-1,SKU-1,2,10,20",
    "sales",
    "DMY",
    {
      order_id: "Order",
      date: "Sale Date",
      customer_id: "Customer",
      product_id: "SKU",
      quantity: "Units",
      unit_price: "Price",
      total_amount: "Revenue",
    },
  );
  assert.equal(result.valid, true);
  assert.deepEqual(result.rows[0]?.data, {
    order_id: "ORD-1",
    date: "2026-10-01",
    customer_id: "CUST-1",
    product_id: "SKU-1",
    quantity: "2",
    unit_price: "10",
    total_amount: "20",
  });
});

test("rejects mappings that reuse one source column for multiple targets", () => {
  const result = validateCsv(
    "A,B,C,D,E,F\nORD-1,2026-10-01,CUST-1,SKU-1,2,20",
    "sales",
    "DMY",
    {
      order_id: "A",
      date: "B",
      customer_id: "C",
      product_id: "D",
      quantity: "E",
      unit_price: "F",
      total_amount: "F",
    },
  );
  assert.equal(result.valid, false);
  assert.match(result.generalErrors.join(" "), /source column can only be mapped once/);
});

test("reports missing columns and row-numbered empty, negative, and invalid-date values", () => {
  const missing = validateCsv(
    "order_id,date,customer_id,product_id,quantity,unit_price\nORD-1,2026-10-01,CUST-1,SKU-1,1,10",
    "sales",
  );
  assert.deepEqual(missing.missingColumns, ["total_amount"]);
  assert.equal(missing.valid, false);

  const invalid = validateCsv(
    `${salesHeader}\nORD-1,2026-02-30,CUST-1,SKU-1,-1,10,10\nORD-2,,CUST-2,SKU-2,1,10,10`,
    "sales",
  );
  assert.equal(invalid.valid, false);
  assert.deepEqual(invalid.rowErrors.map((row) => row.rowNumber), [2, 3]);
  assert.match(invalid.rowErrors[0]?.messages.join(" "), /quantity must be a non-negative number/);
  assert.match(invalid.rowErrors[0]?.messages.join(" "), /date is not valid for the DMY file format/);
  assert.match(invalid.rowErrors[1]?.messages.join(" "), /date is required/);
});

test("keeps quoted commas and newlines inside a review field", () => {
  const result = validateCsv(
    [
      "feedback_id,date,customer_name,rating,review_text,product_id",
      'REV-1,2026-10-01,Sam,5,"Great, comfortable product',
      'and fast delivery",SKU-1',
    ].join("\n"),
    "feedback",
  );
  assert.equal(result.valid, true);
  assert.equal(result.rows[0]?.data.review_text, "Great, comfortable product\nand fast delivery");
});

test("rejects fractional stock and a malformed row width", () => {
  const result = validateCsv(
    [
      "sku_id,product_name,category,current_stock,min_threshold,unit_price",
      "SKU-1,Keyboard,Electronics,2.5,4,50,unexpected",
    ].join("\n"),
    "inventory",
  );
  assert.equal(result.valid, false);
  assert.match(result.rowErrors[0]?.messages.join(" "), /Expected 6 columns but found 7/);
  assert.match(result.rowErrors[0]?.messages.join(" "), /current_stock must be a whole number/);
});

test("parses dates using the account format and reports impossible dates by row", () => {
  const mdy = validateCsv(
    `${salesHeader}\nORD-1,3/10/26,C-1,P-1,1,100,100`,
    "sales",
    "MDY",
  );
  const dmy = validateCsv(
    `${salesHeader}\nORD-1,3/10/26,C-1,P-1,1,100,100`,
    "sales",
    "DMY",
  );
  const invalid = validateCsv(
    `${salesHeader}\nORD-1,31/02/26,C-1,P-1,1,100,100`,
    "sales",
    "DMY",
  );
  assert.equal(mdy.rows[0]?.data.date, "2026-03-10");
  assert.equal(dmy.rows[0]?.data.date, "2026-10-03");
  assert.deepEqual(invalid.rowErrors[0], {
    rowNumber: 2,
    messages: ["date is not valid for the DMY file format."],
  });
});
