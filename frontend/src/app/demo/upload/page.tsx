const SAMPLE_FILES = [
  { id: "sales", fileName: "sales-oct-2026.csv", title: "Sales", rows: 7 },
  { id: "inventory", fileName: "inventory-oct-2026.csv", title: "Inventory", rows: 5 },
  { id: "expenses", fileName: "expenses-oct-2026.csv", title: "Expenses", rows: 5 },
  { id: "feedback", fileName: "customer-reviews-oct-2026.csv", title: "Customer reviews", rows: 5 },
];

export default function DemoUploadPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <header>
        <h1 className="text-2xl font-bold text-[#1F2A44]">Your business files</h1>
        <p className="mt-1 text-sm leading-6 text-[#5B6475]">These are example files in the read-only demo. Create an account to upload or manage your own CSV files.</p>
      </header>
      <ul className="space-y-3">
        {SAMPLE_FILES.map((file) => (
          <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E8DCC8] bg-white p-4">
            <a href={`/samples/${file.fileName}`} download className="text-sm font-bold text-[#1F2A44] underline">{file.fileName}</a>
            <span className="rounded-full border border-[#D5C3A5] bg-[#F7EFCF] px-3 py-1 text-sm font-semibold text-[#1F2A44]">
              {file.title} · {file.rows} {file.rows === 1 ? "row" : "rows"}
            </span>
          </li>
        ))}
      </ul>
      <a href="/signup" className="inline-flex min-h-11 items-center rounded-xl bg-[#1F2A44] px-5 py-3 text-sm font-bold text-white hover:bg-[#2B3A5E]">Create your account to upload files</a>
    </div>
  );
}
