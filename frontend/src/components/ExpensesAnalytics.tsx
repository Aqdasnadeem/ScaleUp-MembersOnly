"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getExpenseCategories, getExpenseEntries } from "@/lib/api";
import { formatDate } from "@/lib/date";
import type { ExpenseCategoriesResponse, ExpenseCategory, ExpenseEntriesResponse } from "@/lib/expenses";
import { useBusiness } from "@/hooks/useBusiness";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function currencyAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-PK", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

function Entries({ month, category, currency, dateFormat }: {
  month: string;
  category: string;
  currency: string;
  dateFormat: string;
}) {
  const [data, setData] = useState<ExpenseEntriesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getExpenseEntries(month, category)
      .then((result) => { if (active) setData(result); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load entries."); });
    return () => { active = false; };
  }, [month, category]);

  if (error) return <p className="mt-4 text-sm" role="alert">Unable to load entries: {error}</p>;
  if (!data) return <p className="mt-4 text-sm" role="status">Loading entries…</p>;
  if (data.entries.length === 0) return <p className="mt-4 text-sm">No entries in this category for the selected month.</p>;
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[400px] text-left text-sm">
        <caption className="sr-only">Expense entries for {category}</caption>
        <thead><tr className="border-b border-[#8290A8]"><th scope="col" className="py-2 pr-4">Date</th><th scope="col" className="py-2 pr-4">Description</th><th scope="col" className="py-2 text-right">Amount</th></tr></thead>
        <tbody>
          {data.entries.map((entry) => (
            <tr key={entry.expense_id} className="border-b border-[#53617A]">
              <td className="py-3 pr-4 whitespace-nowrap">{formatDate(entry.date, dateFormat)}</td>
              <td className="py-3 pr-4">{entry.description || "—"}</td>
              <td className="py-3 text-right whitespace-nowrap">{currencyAmount(entry.amount, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CategoryRow({ item, month, currency, dateFormat }: {
  item: ExpenseCategory;
  month: string;
  currency: string;
  dateFormat: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const change = item.change_percent === null
    ? "N/A"
    : `${item.change_percent > 0 ? "+" : ""}${item.change_percent.toFixed(1)}%`;
  return (
    <li className="border-b border-[#53617A] py-4 last:border-b-0">
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}
        className="flex min-h-11 w-full flex-wrap items-center justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-[#293655] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F7F3EC]">
        <span className="font-bold">{item.category}</span>
        <span className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <span>{currencyAmount(item.total, currency)}</span>
          <span>{change} vs last month</span>
          <span aria-hidden="true">{expanded ? "−" : "+"}</span>
        </span>
      </button>
      {expanded && <Entries month={month} category={item.category} currency={currency} dateFormat={dateFormat} />}
    </li>
  );
}

function CategoryList({ month, currency, dateFormat }: { month: string; currency: string; dateFormat: string }) {
  const [data, setData] = useState<ExpenseCategoriesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getExpenseCategories(month)
      .then((result) => { if (active) setData(result); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load expenses."); });
    return () => { active = false; };
  }, [month]);

  if (error) return <p className="mt-5 text-sm" role="alert">Unable to load expenses: {error}</p>;
  if (!data) return <p className="mt-5 text-sm" role="status">Loading expenses…</p>;
  return (
    <>
      <p className="mt-2 text-sm text-[#D8DCE6]">Comparing {data.month} with {data.previous_month}. N/A means the previous total was zero.</p>
      {data.categories.length === 0 ? (
        <p className="mt-5 text-sm">No expense entries in either month. Upload expense data to see categories.</p>
      ) : (
        <ul className="mt-4">
          {data.categories.map((item) => <CategoryRow key={item.category} item={item} month={month} currency={currency} dateFormat={dateFormat} />)}
        </ul>
      )}
    </>
  );
}

export default function ExpensesAnalytics() {
  const { business, loading, error } = useBusiness();
  const [month, setMonth] = useState(currentMonth);

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1B2540] sm:text-3xl">Expenses by category</h1>
          <p className="mt-1 text-sm text-[#46516A]">Compare monthly spending and explore the entries behind each category.</p>
        </div>
        <Link href="/upload" className="inline-flex min-h-11 items-center rounded-xl bg-[#1B2540] px-5 py-3 text-sm font-bold text-[#F7F3EC] hover:bg-[#293655] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#72571F]">Upload expenses</Link>
      </header>
      <section className="rounded-2xl border border-[#354261] bg-[#1B2540] p-5 text-[#F7F3EC] shadow-sm sm:p-6" aria-labelledby="expense-categories-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="expense-categories-heading" className="text-lg font-bold">Category totals</h2>
          <label className="text-sm font-semibold">Month
            <input type="month" value={month} min="0002-01" max="9998-12" onChange={(event) => setMonth(event.target.value)} className="ml-3 rounded-lg border border-[#8290A8] bg-[#F7F3EC] px-3 py-2 text-[#1B2540]" />
          </label>
        </div>
        {loading ? <p className="mt-5 text-sm" role="status">Loading business settings…</p>
          : error ? <p className="mt-5 text-sm" role="alert">Unable to load business settings.</p>
          : !business ? <p className="mt-5 text-sm">Sign in to view expenses.</p>
          : !month ? <p className="mt-5 text-sm">Select a month to view expenses.</p>
          : <CategoryList key={month} month={month} currency={business.currency} dateFormat={business.date_format} />}
      </section>
    </div>
  );
}
