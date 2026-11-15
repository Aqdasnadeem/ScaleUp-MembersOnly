import Link from "next/link";

const components = [
  ["Agent flow", "LangGraph agent (planned backend integration)"],
  ["Review search", "pgvector with sentence-transformers all-MiniLM-L6-v2 (384 dimensions)"],
  ["Anomaly checks", "Isolation Forest"],
  ["Forecasting", "Sales time-series forecasting"],
  ["Backend services", "FastAPI and Gemini (planned)"],
  ["Database", "PostgreSQL (planned)"],
];

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-[#F6F1E8] px-4 py-16 text-[#1F2A44]">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm font-semibold text-[#1F2A44] underline underline-offset-4">← ScaleUp home</Link>
        <p className="mt-10 text-sm font-semibold text-[#5B6475]">Product guide</p>
        <h1 className="mt-2 text-4xl font-bold">How it works</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[#5B6475]">
          This website is a frontend demo. Its assistant uses scripted answers; it does not connect to a live business database or run a live AI model.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {components.map(([name, description]) => (
            <section key={name} className="rounded-xl border border-[#D5C3A5] bg-white p-5">
              <h2 className="font-bold">{name}</h2>
              <p className="mt-2 text-sm leading-6 text-[#5B6475]">{description}</p>
            </section>
          ))}
        </div>
        <p className="mt-8 rounded-xl border border-[#D5C3A5] bg-[#FAF6EF] p-5 text-sm leading-6">
          FastAPI, LangGraph and Gemini backend integration is planned, not currently connected. The technical methods above describe the intended system; this demo uses built-in data.
        </p>
      </div>
    </main>
  );
}
