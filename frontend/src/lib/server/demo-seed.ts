import type { UploadCategory } from "./csv";
import type { ValidatedRow } from "./data";

export const DEMO_DATASETS: Array<{
  category: UploadCategory;
  fileName: string;
  rows: ValidatedRow[];
}> = [
  {
    category: "sales",
    fileName: "demo-sales.csv",
    rows: [
      {
        rowNumber: 2,
        data: {
          order_id: "AUG-001",
          date: "2026-08-01",
          customer_id: "CUST-001",
          product_id: "SKU-102",
          quantity: "15",
          unit_price: "4000",
          total_amount: "60000",
        },
      },
      {
        rowNumber: 3,
        data: {
          order_id: "AUG-002",
          date: "2026-08-11",
          customer_id: "CUST-002",
          product_id: "SKU-101",
          quantity: "63",
          unit_price: "4000",
          total_amount: "252000",
        },
      },
      {
        rowNumber: 4,
        data: {
          order_id: "SEP-001",
          date: "2026-09-10",
          customer_id: "CUST-003",
          product_id: "SKU-102",
          quantity: "12",
          unit_price: "5000",
          total_amount: "60000",
        },
      },
      {
        rowNumber: 5,
        data: {
          order_id: "SEP-002",
          date: "2026-09-18",
          customer_id: "CUST-004",
          product_id: "SKU-101",
          quantity: "50",
          unit_price: "5650",
          total_amount: "282500",
        },
      },
      {
        rowNumber: 6,
        data: {
          order_id: "OCT-001",
          date: "2026-10-12",
          customer_id: "CUST-005",
          product_id: "SKU-101",
          quantity: "64",
          unit_price: "5000",
          total_amount: "320000",
        },
      },
    ],
  },
  {
    category: "expenses",
    fileName: "demo-expenses.csv",
    rows: [
      {
        rowNumber: 2,
        data: {
          expense_id: "SEP-COURIER",
          date: "2026-09-12",
          category: "Courier",
          amount: "22365",
          budget: "22000",
          vendor: "Karachi Fast Express",
          description: "September courier deliveries",
        },
      },
      {
        rowNumber: 3,
        data: {
          expense_id: "SEP-OTHER",
          date: "2026-09-20",
          category: "Operations",
          amount: "159635",
          budget: "180000",
          vendor: "Scale Up Supplies",
          description: "September operating expenses",
        },
      },
      {
        rowNumber: 4,
        data: {
          expense_id: "OCT-COURIER",
          date: "2026-10-14",
          category: "Courier",
          amount: "33100",
          budget: "22000",
          vendor: "Karachi Fast Express",
          description: "October courier deliveries",
        },
      },
      {
        rowNumber: 5,
        data: {
          expense_id: "OCT-OTHER",
          date: "2026-10-22",
          category: "Operations",
          amount: "191100",
          budget: "210000",
          vendor: "Scale Up Supplies",
          description: "October operating expenses",
        },
      },
    ],
  },
  {
    category: "inventory",
    fileName: "demo-inventory.csv",
    rows: [
      {
        rowNumber: 2,
        data: {
          sku_id: "SKU-102",
          product_name: "Mechanical Keyboard",
          category: "Electronics",
          current_stock: "0",
          min_threshold: "15",
          unit_price: "8500",
        },
      },
      {
        rowNumber: 3,
        data: {
          sku_id: "SKU-101",
          product_name: "Wireless Ergonomic Mouse",
          category: "Electronics",
          current_stock: "4",
          min_threshold: "20",
          unit_price: "3200",
        },
      },
      {
        rowNumber: 4,
        data: {
          sku_id: "SKU-108",
          product_name: "Webcam",
          category: "Electronics",
          current_stock: "8",
          min_threshold: "12",
          unit_price: "7200",
        },
      },
    ],
  },
  {
    category: "feedback",
    fileName: "demo-reviews.csv",
    rows: [
      {
        rowNumber: 2,
        data: {
          feedback_id: "REV-701",
          date: "2026-10-18",
          customer_name: "Hamza Khan",
          rating: "1",
          review_text: "Courier took 6 days to deliver. Product is fine but shipping was awful.",
          product_id: "SKU-101",
        },
      },
      {
        rowNumber: 3,
        data: {
          feedback_id: "REV-702",
          date: "2026-10-20",
          customer_name: "Ayesha Noor",
          rating: "5",
          review_text: "Excellent mouse, very comfortable for long coding sessions.",
          product_id: "SKU-101",
        },
      },
    ],
  },
];
