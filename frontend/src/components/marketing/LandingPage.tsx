"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  FileCheck2,
  FileSpreadsheet,
  Menu,
  MessageSquareText,
  Minus,
  PackageCheck,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import ScaleUpLogo from "@/components/ScaleUpLogo";

const questions = [
  {
    question: "Why did profit change in October?",
    answer:
      "Profit fell because the Mechanical Keyboard went out of stock and courier costs rose 48% compared with last month.",
    records: ["Sales", "Expenses", "Stock"],
    evidence: [
      "Courier spend vs budget Rs 33,100 / Rs 22,000",
      "Mechanical Keyboard stock 0 units",
    ],
  },
  {
    question: "Which items need reordering?",
    answer:
      "Three items need reordering: the Mechanical Keyboard, Wireless Ergonomic Mouse and Webcam.",
    records: ["Stock"],
    evidence: [
      "Mechanical Keyboard: 0 units in stock; reorder at 15",
      "Wireless Ergonomic Mouse: 4 units in stock; reorder at 20",
      "Webcam: 8 units in stock; reorder at 12",
    ],
  },
  {
    question: "What are customers saying?",
    answer:
      "Customers praise the product quality, while courier delays are a recurring concern in the latest reviews.",
    records: ["Reviews"],
    evidence: [
      "REV-701 · 1/5 · Courier took 6 days to deliver. Product is fine but shipping was awful.",
      "REV-702 · 5/5 · Excellent mouse, very comfortable for long coding sessions.",
    ],
  },
  {
    question: "What is the sales forecast?",
    answer:
      "The three-month moving average points to sales of about Rs 324,833 next month.",
    records: ["Sales"],
    evidence: [
      "August revenue Rs 312,000",
      "September revenue Rs 342,500",
      "October revenue Rs 320,000",
    ],
  },
] as const;

const features: { title: string; description: string; icon: LucideIcon; badge?: string }[] = [
  {
    title: "CSV upload with checks",
    description: "We point out missing columns and bad rows before anything is saved.",
    icon: FileSpreadsheet,
  },
  {
    title: "One dashboard",
    description: "Sales, stock, expenses and reviews together, so you do not switch between files.",
    icon: BarChart3,
  },
  {
    title: "Plain-English questions",
    description: "Ask \"why did sales drop?\" the way you would ask a person.",
    icon: MessageSquareText,
    badge: "Demo",
  },
  {
    title: "Evidence with every answer",
    description: "See the records behind each answer, so you can check it yourself.",
    icon: FileCheck2,
  },
  {
    title: "Stock and cost alerts",
    description: "Get flagged when an item runs out or a cost goes over budget.",
    icon: PackageCheck,
    badge: "Demo",
  },
  {
    title: "Reports and sales forecast",
    description: "PDF reports and a sales forecast are planned for the next phase of the project.",
    icon: TrendingUp,
    badge: "Planned",
  },
] as const;

const faqs = [
  {
    question: "What files do I need?",
    answer:
      "CSV files for sales, inventory, expenses and customer feedback. Each upload page shows the columns it expects and a sample file.",
  },
  {
    question: "Is my data safe?",
    answer: (
      <>
        Each account only sees its own data. See{" "}
        <a
          href="#where-your-files-go"
          className="font-semibold underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E0C788]"
        >
          Where your files go
        </a>{" "}
        above for what is sent to the outside AI service.
      </>
    ),
  },
  {
    question: "Do I need technical skills?",
    answer:
      "No. If you can save a file from Excel as CSV, you can use ScaleUp.",
  },
  {
    question: "Which questions can I ask?",
    answer:
      "Right now the assistant answers four example types: profit changes, items that need reordering, what customers say, and the sales forecast. More will come.",
  },
  {
    question: "Is it free?",
    answer: "Yes. ScaleUp is a student project and has no paid plans.",
  },
] as const;

const navigation = [
  { label: "How it works", id: "how-it-works" },
  { label: "Features", id: "features" },
  { label: "FAQ", id: "faq" },
] as const;

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(query.matches);
    updatePreference();
    query.addEventListener("change", updatePreference);
    return () => query.removeEventListener("change", updatePreference);
  }, []);

  return reducedMotion;
}

export default function LandingPage() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState(0);
  const [demoRun, setDemoRun] = useState(0);
  const [answerAnimation, setAnswerAnimation] = useState({ questionIndex: 0, length: 0 });
  const [videoOpen, setVideoOpen] = useState(false);
  const videoDialogRef = useRef<HTMLDialogElement>(null);
  const walkthroughFrameRef = useRef<HTMLIFrameElement>(null);
  const playButtonRef = useRef<HTMLButtonElement>(null);
  const selectedDemo = questions[selectedQuestion];
  const typedLength = answerAnimation.questionIndex === selectedQuestion ? answerAnimation.length : 0;
  const answerComplete = typedLength >= selectedDemo.answer.length;

  useEffect(() => {
    const sections = navigation
      .map(({ id }) => document.getElementById(id))
      .filter((section): section is HTMLElement => section !== null);
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleSection = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        if (visibleSection) setActiveSection(visibleSection.target.id);
      },
      { rootMargin: "-88px 0px -65% 0px", threshold: [0, 0.25, 0.5, 0.75] },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      const timer = window.setTimeout(
        () => setAnswerAnimation({ questionIndex: selectedQuestion, length: selectedDemo.answer.length }),
        0,
      );
      return () => window.clearTimeout(timer);
    }

    let length = 0;
    const timer = window.setInterval(() => {
      length = Math.min(length + 3, selectedDemo.answer.length);
      setAnswerAnimation({ questionIndex: selectedQuestion, length });
      if (length >= selectedDemo.answer.length) window.clearInterval(timer);
    }, 22);
    return () => window.clearInterval(timer);
  }, [demoRun, reducedMotion, selectedDemo.answer, selectedQuestion]);

  useEffect(() => {
    const dialog = videoDialogRef.current;
    if (!dialog) return;

    if (videoOpen && !dialog.open) {
      dialog.showModal();
    } else if (!videoOpen && dialog.open) {
      dialog.close();
    }
  }, [videoOpen]);

  const stopWalkthrough = () => {
    const frame = walkthroughFrameRef.current;
    frame?.contentWindow?.postMessage("scaleup-stop", "*");
    window.speechSynthesis?.cancel();
    if (frame) frame.src = "about:blank";
  };

  const closeVideo = () => {
    stopWalkthrough();
    setVideoOpen(false);
    playButtonRef.current?.focus();
  };

  useEffect(() => {
    const handleWalkthroughMessage = (event: MessageEvent<unknown>) => {
      if (
        event.origin === "null"
        && event.source === walkthroughFrameRef.current?.contentWindow
        && event.data === "scaleup-cta"
      ) {
        stopWalkthrough();
        setVideoOpen(false);
        playButtonRef.current?.focus();
        router.push("/signup");
      }
    };
    window.addEventListener("message", handleWalkthroughMessage);
    return () => window.removeEventListener("message", handleWalkthroughMessage);
  }, [router]);

  const scrollToSection = (sectionId: string) => {
    setMobileMenuOpen(false);
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: reducedMotion ? "instant" : "smooth",
      block: "start",
    });
  };

  return (
    <div id="top" className="min-h-screen bg-[#F6F1E8] text-[#1F2A44]">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-lg bg-[#E0C788] px-4 py-3 font-bold text-[#1F2A44] focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-[#D5C3A5] bg-[#1F2A44] text-[#E8DCC8]">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#E0C788]"
            aria-label="ScaleUp home"
          >
            <ScaleUpLogo size="md" />
            <span className="text-2xl">ScaleUp</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-semibold md:flex" aria-label="Main navigation">
            {navigation.map(({ label, id }) => (
              <a
                key={id}
                href={`#${id}`}
                aria-current={activeSection === id ? "location" : undefined}
                className={`rounded-md py-2 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E0C788] ${
                  activeSection === id ? "text-white underline decoration-[#E0C788] underline-offset-8" : ""
                }`}
              >
                {label}
              </a>
            ))}
            <Link href="/login" className="rounded-md py-2 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E0C788]">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex min-h-11 items-center rounded-lg bg-[#E0C788] px-4 text-[#1F2A44] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Create free account
            </Link>
          </nav>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[#E8DCC8]/50 hover:bg-[#2B3A5E] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E0C788] md:hidden"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {mobileMenuOpen && (
          <nav id="mobile-navigation" className="grid gap-2 border-t border-[#2D3D60] px-4 py-4 text-sm font-semibold md:hidden" aria-label="Mobile navigation">
            {navigation.map(({ label, id }) => (
              <a
                key={id}
                href={`#${id}`}
                aria-current={activeSection === id ? "location" : undefined}
                onClick={() => setMobileMenuOpen(false)}
                className="min-h-11 rounded-lg px-3 py-3 hover:bg-[#2B3A5E] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E0C788]"
              >
                {label}
              </a>
            ))}
            <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="min-h-11 rounded-lg px-3 py-3 hover:bg-[#2B3A5E] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E0C788]">
              Sign in
            </Link>
            <Link href="/signup" onClick={() => setMobileMenuOpen(false)} className="min-h-11 rounded-lg bg-[#E0C788] px-3 py-3 text-center text-[#1F2A44] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              Create free account
            </Link>
          </nav>
        )}
      </header>

      <main id="main-content">
        <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 py-12 sm:px-6 md:py-20 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="hero-enter">
            <h1 className="mt-4 max-w-xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Find out why your sales changed.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-[#374151]">
              Upload your sales, stock, expense and customer review files. ScaleUp shows what is happening in your business and answers your questions, with the evidence behind every answer.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/signup" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#1F2A44] px-5 py-3 text-sm font-bold text-white hover:bg-[#2B3A5E] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#88682A]">
                Create free account <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <button
                type="button"
                onClick={() => scrollToSection("how-it-works")}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#1F2A44] px-5 py-3 text-sm font-bold text-[#1F2A44] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#88682A]"
              >
                See how it works <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="visual-enter overflow-hidden rounded-3xl border border-[#D5C3A5] bg-[#1F2A44] p-3 shadow-xl sm:p-4">
            <button
              ref={playButtonRef}
              type="button"
              onClick={() => setVideoOpen(true)}
              aria-label="Play the 40-second ScaleUp walkthrough"
              className="group relative block aspect-video w-full overflow-hidden rounded-2xl bg-[#131A2B] text-left focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#E0C788]"
            >
              <Image
                src="/video/walkthrough-poster.png"
                alt=""
                fill
                priority
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              />
              <span className="absolute inset-0 bg-gradient-to-t from-[#131A2B]/85 via-[#131A2B]/10 to-[#131A2B]/20" aria-hidden="true" />
              <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/25 bg-[#131A2B]/75 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm sm:left-6 sm:top-6">
                <Play className="h-3 w-3 fill-current text-[#E0C788]" aria-hidden="true" />
                Product walkthrough
              </span>
              <span className="absolute right-4 top-4 rounded-full bg-[#131A2B]/80 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm sm:right-6 sm:top-6">
                0:40
              </span>
              <span className="absolute left-1/2 top-1/2 inline-flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/80 bg-[#C6A75E] text-[#1F2A44] shadow-xl transition-transform group-hover:scale-110 sm:h-[4.5rem] sm:w-[4.5rem]">
                <Play className="ml-1 h-6 w-6 fill-current sm:h-7 sm:w-7" aria-hidden="true" />
              </span>
              <span className="absolute inset-x-4 bottom-4 text-left sm:inset-x-6 sm:bottom-6">
                <span className="block text-lg font-bold text-white sm:text-2xl">See ScaleUp in action</span>
                <span className="mt-1 block text-xs text-white/90 sm:text-sm">A 40-second tour of your dashboard, uploads and evidence-backed answers</span>
              </span>
            </button>
            <div className="flex items-center justify-between gap-3 px-2 pb-1 pt-3">
              <p className="text-sm font-semibold text-white">Captions on · Voice off by default</p>
              <span className="text-xs text-[#E8DCC8]/80">Press play to watch</span>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-20 border-y border-[#E8DCC8] bg-[#FAF6EF]">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-20">
            <p className="text-sm font-bold uppercase tracking-widest text-[#72571F]">How it works</p>
            <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Three steps from files to answers</h2>
            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
              {[
                {
                  number: "1",
                  title: "Upload your CSV files",
                  description: "Add your sales, stock, expense and customer review files. We check them and tell you if a column is missing.",
                },
                {
                  number: "2",
                  title: "See your dashboard",
                  description: "Revenue, expenses, stock and customer reviews in one place, ready as soon as the files are loaded.",
                },
                {
                  number: "3",
                  title: "Ask a question in plain English",
                  description: "Ask \"Why did profit drop?\" and get an answer with the records that support it, plus suggested next steps.",
                },
              ].map(({ number, title, description }) => (
                <article key={number} className="rounded-2xl border border-[#E8DCC8] bg-white p-6">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#1F2A44] text-lg font-bold text-[#E0C788]">{number}</span>
                  <h3 className="mt-4 text-lg font-bold">{title}</h3>
                  <p className="mt-2 text-base leading-7 text-[#374151]">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="assistant" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-20">
          <div className="grid items-start gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-sm font-bold uppercase tracking-widest text-[#72571F]">The assistant</p>
              <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Every answer shows its evidence</h2>
              <p className="mt-4 text-base leading-7 text-[#374151]">
                You do not have to trust a number you cannot check. Each answer lists the records it used, so you can see where it came from.
              </p>
              <p className="mt-5 rounded-xl border border-[#D5C3A5] bg-[#FAF6EF] p-4 text-sm leading-6 text-[#374151]">
                Sample data shown. The assistant currently answers four example question types.
              </p>
            </div>

            <div className="rounded-2xl border border-[#D5C3A5] bg-white p-4 shadow-sm sm:p-6" aria-label="Interactive assistant sample">
              <div className="flex items-center gap-3 border-b border-[#E8DCC8] pb-4">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#1F2A44] text-[#E0C788]">
                  <MessageSquareText className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-bold">Ask ScaleUp</h3>
                  <p className="text-xs text-[#5B6475]">Choose a sample question</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2" aria-label="Example questions">
                {questions.map(({ question }, index) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => {
                      setSelectedQuestion(index);
                      setDemoRun((run) => run + 1);
                    }}
                    aria-pressed={selectedQuestion === index}
                    className={`min-h-11 rounded-lg border px-3 py-2 text-left text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#88682A] sm:text-sm ${
                      selectedQuestion === index
                        ? "border-[#1F2A44] bg-[#1F2A44] text-white"
                        : "border-[#E8DCC8] bg-[#FAF6EF] text-[#1F2A44] hover:border-[#C6A75E]"
                    }`}
                  >
                    {question}
                  </button>
                ))}
              </div>
              <div className="mt-5 rounded-xl bg-[#F6F1E8] p-4 sm:p-5">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#72571F]">
                  <Sparkles className="h-4 w-4" aria-hidden="true" /> Answer
                </p>
                <p className="mt-2 min-h-14 text-sm leading-6 text-[#1F2A44]" aria-live="polite" aria-atomic="true">
                  {selectedDemo.answer.slice(0, typedLength)}
                  {!answerComplete && <span aria-hidden="true" className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-[#72571F]" />}
                </p>
                {answerComplete && (
                  <div className="mt-4 border-t border-[#D5C3A5] pt-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#72571F]">Records checked</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedDemo.records.map((record) => (
                        <span key={record} className="rounded-md border border-[#D5C3A5] bg-white px-2.5 py-1 text-xs font-semibold text-[#1F2A44]">
                          {record}
                        </span>
                      ))}
                    </div>
                    <ul className="mt-3 space-y-2">
                      {selectedDemo.evidence.map((row) => (
                        <li key={row} className="rounded-lg border border-[#E8DCC8] bg-white px-3 py-2 text-xs leading-5 text-[#374151] sm:text-sm">
                          {row}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-20 border-y border-[#E8DCC8] bg-[#FAF6EF]">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-20">
            <p className="text-sm font-bold uppercase tracking-widest text-[#72571F]">Features</p>
            <h2 className="mt-2 text-3xl font-bold sm:text-4xl">What you can do with ScaleUp</h2>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ title, description, icon: Icon, badge }) => (
                <article key={title} aria-label={badge === "Planned" ? `${title}, planned` : title} className="rounded-2xl border border-[#E8DCC8] bg-white p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#1F2A44] text-[#E0C788]">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    {badge && (
                      <span className="rounded-full border border-[#88682A] bg-[#F7EFCF] px-2.5 py-1 text-xs font-bold text-[#1F2A44]">
                        {badge}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-4 text-lg font-bold">{title}</h3>
                  <p className="mt-2 text-base leading-6 text-[#374151]">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="where-your-files-go" className="scroll-mt-20 bg-[#1F2A44] text-[#E8DCC8]">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-20">
            <p className="text-sm font-bold uppercase tracking-widest text-[#E0C788]">Your data</p>
            <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Where your files go</h2>
            <p className="mt-3 max-w-2xl text-base leading-7">
              Plain answers, so you know what happens to your business data.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                "Each account only sees its own data. Your files are used only to answer your questions.",
                "Your questions, and the figures needed to answer them, are sent to an outside AI service (Google Gemini).",
                "Your original CSV files are not sent to Google Gemini.",
                "ScaleUp is a university final-year project. It is not a certified or enterprise service.",
              ].map((statement) => (
                <p key={statement} className="flex gap-3 rounded-xl border border-[#C6A75E]/40 bg-[#131A2B]/40 p-5 text-sm leading-6 text-[#E8DCC8]">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#E0C788]" aria-hidden="true" />
                  <span>{statement}</span>
                </p>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-20">
          <p className="text-sm font-bold uppercase tracking-widest text-[#72571F]">FAQ</p>
          <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Common questions</h2>
          <div className="mt-6 space-y-3">
            {faqs.map(({ question, answer }, index) => {
              const isOpen = openFaq === index;
              const answerId = `faq-answer-${index + 1}`;
              return (
                <article key={question} className="rounded-xl border border-[#E8DCC8] bg-[#FAF6EF]">
                  <h3>
                    <button
                      type="button"
                      id={`faq-question-${index + 1}`}
                      aria-expanded={isOpen}
                      aria-controls={answerId}
                      onClick={() => setOpenFaq(isOpen ? null : index)}
                      className="flex min-h-14 w-full items-center justify-between gap-4 rounded-xl px-4 py-4 text-left text-base font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#88682A]"
                    >
                      <span>{question}</span>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#D5C3A5] text-[#1F2A44]" aria-hidden="true">
                        {isOpen ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      </span>
                    </button>
                  </h3>
                  {isOpen && (
                    <div id={answerId} role="region" aria-labelledby={`faq-question-${index + 1}`} className="px-4 pb-4 text-sm leading-6 text-[#374151]">
                      {answer}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className="bg-[#FAF6EF]">
          <div className="mx-auto max-w-6xl px-4 py-12 text-center sm:px-6 md:py-20">
            <h2 className="mx-auto max-w-2xl text-3xl font-bold sm:text-4xl">Ready to see what is behind your numbers?</h2>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href="/signup" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1F2A44] px-5 py-3 text-sm font-bold text-white hover:bg-[#2B3A5E] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#88682A]">
                Create free account <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link href="/login" className="inline-flex min-h-11 items-center rounded-xl border border-[#1F2A44] px-5 py-3 text-sm font-bold text-[#1F2A44] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#88682A]">
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#131A2B] text-[#E8DCC8]">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.3fr_0.7fr_1fr]">
          <div>
            <Link href="/" className="inline-flex items-center gap-2 rounded-md font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E0C788]">
              <ScaleUpLogo size="sm" />
              <span>ScaleUp</span>
            </Link>
            <p className="mt-3 max-w-sm text-sm leading-6">
              Upload your business files and find out why your numbers changed, with the evidence behind every answer.
            </p>
          </div>
          <nav aria-label="Product links">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#E0C788]">Product</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {navigation.map(({ label, id }) => (
                <li key={id}><a href={`#${id}`} className="rounded-sm hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E0C788]">{label}</a></li>
              ))}
              <li><Link href="/login" className="rounded-sm hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E0C788]">Sign in</Link></li>
              <li><Link href="/signup" className="rounded-sm hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E0C788]">Create free account</Link></li>
            </ul>
          </nav>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#E0C788]">The project</h2>
            <p className="mt-3 text-sm font-semibold">Built by</p>
            <p className="mt-1 text-sm leading-6">Alishba Tariq<br />Aqdas Nadeem<br />Chandni Abdullah<br />Humna Ahmed</p>
          </div>
        </div>
        <div className="border-t border-[#2D3D60]">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 text-xs text-[#E8DCC8]/80 sm:px-6 sm:flex-row sm:items-center sm:justify-between">
            <p>© 2026 ScaleUp</p>
            <p>Sample screens use demo data</p>
          </div>
        </div>
      </footer>

      <dialog
        ref={videoDialogRef}
        aria-labelledby="walkthrough-title"
        aria-describedby="walkthrough-description"
        onCancel={closeVideo}
        onClose={() => {
          stopWalkthrough();
          setVideoOpen(false);
        }}
        onClick={(event) => {
          if (event.target === videoDialogRef.current) closeVideo();
        }}
        className="m-auto w-[min(94vw,960px)] max-w-none rounded-2xl border border-[#D5C3A5] bg-[#1F2A44] p-4 text-[#E8DCC8] shadow-2xl backdrop:bg-[#131A2B]/80 sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="walkthrough-title" className="text-xl font-bold text-white">Watch the 40-second walkthrough</h2>
            <p id="walkthrough-description" className="mt-1 text-sm">Captions on · Voice off by default</p>
          </div>
          <button
            type="button"
            onClick={closeVideo}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#E8DCC8]/50 hover:bg-[#2B3A5E] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E0C788]"
            aria-label="Close walkthrough"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {videoOpen && (reducedMotion ? (
            <Image
              src="/video/walkthrough-poster.png"
              alt="ScaleUp walkthrough poster showing CSV validation, a business dashboard and an evidence-backed assistant answer"
              width={1920}
              height={1080}
              className="h-auto w-full rounded-xl"
              priority
            />
          ) : (
            <iframe
              ref={walkthroughFrameRef}
              title="ScaleUp 40-second walkthrough"
              src="/video/scaleup-walkthrough-v4.html"
              sandbox="allow-scripts"
              loading="eager"
              className="aspect-video w-full rounded-xl border-0 bg-[#131A2B]"
            />
          )
        )}
        <p className="mt-3 text-xs text-[#E8DCC8]/80">Captions are on by default. Voice narration is off unless you turn it on.</p>
      </dialog>
    </div>
  );
}
