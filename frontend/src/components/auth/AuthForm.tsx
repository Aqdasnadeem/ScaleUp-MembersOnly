"use client";

import { Suspense, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Lock, Mail, Eye, EyeOff, Store } from "lucide-react";
import ScaleUpLogo from "@/components/ScaleUpLogo";
import { ApiError, login, setRole, setToken, signup } from "@/lib/api";
import { resetBusiness } from "@/hooks/useBusiness";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import Button from "@/components/Button";

type AuthMode = "signin" | "signup";
type FieldErrors = Partial<Record<"email" | "password" | "businessName", string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AuthFormContent({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const isSignUp = mode === "signup";
  const updateError = (field: keyof FieldErrors, message: string) => {
    setFieldErrors((current) => ({ ...current, [field]: message || undefined }));
  };

  const { run: runSubmit, loading } = useAsyncAction(async () => {
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const result = isSignUp
        ? await signup(businessName.trim(), normalizedEmail, password)
        : await login(normalizedEmail, password);
      setToken(result.access_token);
      setRole(result.role);
      resetBusiness();
      router.replace(result.role === "super_admin" ? "/admin" : "/dashboard");
    } catch (reason) {
      if (reason instanceof ApiError) {
        if (reason.status === 409) setFieldErrors({ email: reason.message });
        else if (reason.status === 401) setError("Incorrect email or password");
        else setError(reason.message);
      } else {
        setError("The request could not be completed. Try again.");
      }
    }
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const nextErrors: FieldErrors = {};
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalizedEmail)) nextErrors.email = "Enter a valid email address.";
    if (isSignUp) {
      if (password.length < 8 || password.length > 128) nextErrors.password = "Password must be 8 to 128 characters.";
      if (!businessName.trim()) nextErrors.businessName = "Enter your business name.";
    } else if (!password) {
      nextErrors.password = "Enter your password.";
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    void runSubmit();
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const destination = event.key === "Home"
      ? "/login"
      : event.key === "End"
      ? "/signup"
        : isSignUp
        ? "/login"
        : "/signup";
    router.push(destination);
  };

  const fieldClass =
    "mt-1.5 min-h-11 w-full rounded-xl border border-[#D5C3A5] bg-white px-4 py-2.5 text-sm text-[#1F2A44] placeholder:text-[#5B6475] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#88682A] disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="min-h-screen bg-[#F6F1E8] text-[#1F2A44] md:grid md:grid-cols-2">
      <aside className="hidden min-h-screen md:block">
        <div className="fixed inset-y-0 left-0 z-0 hidden w-1/2 flex-col justify-center gap-16 bg-[#1F2A44] p-10 text-[#E8DCC8] md:flex lg:p-14">
          <Link href="/" aria-label="ScaleUp home" className="inline-flex w-fit items-center gap-3 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#E0C788]">
            <ScaleUpLogo size="lg" preload />
            <span className="text-4xl font-extrabold tracking-tight text-white">ScaleUp</span>
          </Link>
          <div className="max-w-xl">
            <p className="text-4xl font-extrabold leading-tight tracking-tight text-white lg:text-5xl">
              Find out why your sales changed.
            </p>
            <p className="mt-5 max-w-lg text-base leading-7 text-[#E8DCC8]">
              Upload your business files and see the evidence behind every answer.
            </p>
            <ul className="mt-8 space-y-4 text-sm leading-6">
              {[
                "Files are checked before they are saved",
                "Answers show the records behind them",
                "Each account only sees its own data",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-[#E0C788]" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>

      <main className="flex min-h-screen flex-col items-center px-4 py-6 sm:px-8 md:justify-center md:px-10 lg:px-16">
        <div className="mb-6 flex w-full max-w-xl items-center gap-3 md:hidden">
          <Link href="/" aria-label="ScaleUp home" className="inline-flex items-center gap-3 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#88682A]">
            <ScaleUpLogo size="md" preload />
            <span className="text-3xl font-extrabold tracking-tight text-[#1F2A44]">ScaleUp</span>
          </Link>
        </div>
        <div className="w-full max-w-xl rounded-2xl border border-[#D5C3A5] bg-white p-5 shadow-sm sm:p-8 lg:p-10">
          <div
            role="tablist"
            aria-label="Account options"
            onKeyDown={onTabKeyDown}
            className="mb-7 grid grid-cols-2 rounded-xl border border-[#D5C3A5] bg-[#FAF6EF] p-1"
          >
            <Link
              href="/login"
              role="tab"
              aria-selected={!isSignUp}
              tabIndex={!isSignUp ? 0 : -1}
              className={`flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#88682A] ${
                !isSignUp ? "bg-[#1F2A44] text-white shadow-sm" : "text-[#1F2A44] hover:bg-white"
              }`}
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              role="tab"
              aria-selected={isSignUp}
              tabIndex={isSignUp ? 0 : -1}
              className={`flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#88682A] ${
                isSignUp ? "bg-[#1F2A44] text-white shadow-sm" : "text-[#1F2A44] hover:bg-white"
              }`}
            >
              Create account
            </Link>
          </div>

          <h1 className="text-2xl font-extrabold text-[#1F2A44]">
            {isSignUp ? "Create your account" : "Sign in to ScaleUp"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#5B6475]">
            {isSignUp
              ? "It takes about a minute. Then upload your first CSV file."
              : "Welcome back. Enter your email and password."}
          </p>

          <form onSubmit={submit} noValidate className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-[#1F2A44]">Email</label>
              <span className="relative block">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5B6475]" aria-hidden="true" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    updateError("email", "");
                  }}
                  placeholder="owner@yourbusiness.com"
                  autoComplete="email"
                  required
                  disabled={loading}
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? "email-error" : undefined}
                  className={`${fieldClass} pl-10`}
                />
              </span>
              {fieldErrors.email && <p id="email-error" role="alert" aria-live="polite" className="mt-1.5 text-sm text-rose-700">{fieldErrors.email}</p>}
            </div>

            {isSignUp && (
              <div>
                <label htmlFor="business-name" className="block text-sm font-semibold text-[#1F2A44]">Business name</label>
                <span className="relative block">
                  <Store className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5B6475]" aria-hidden="true" />
                  <input
                    id="business-name"
                    value={businessName}
                    onChange={(event) => {
                      setBusinessName(event.target.value);
                      updateError("businessName", "");
                    }}
                    placeholder="e.g. Karachi Electronics"
                    autoComplete="organization"
                    minLength={1}
                    maxLength={120}
                    required
                    disabled={loading}
                    aria-invalid={Boolean(fieldErrors.businessName)}
                    aria-describedby={fieldErrors.businessName ? "business-name-error" : undefined}
                    className={`${fieldClass} pl-10`}
                  />
                </span>
                {fieldErrors.businessName && <p id="business-name-error" role="alert" aria-live="polite" className="mt-1.5 text-sm text-rose-700">{fieldErrors.businessName}</p>}
              </div>
            )}

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label htmlFor="password" className="block text-sm font-semibold text-[#1F2A44]">Password</label>
                {/* Hidden until the backend supports password reset. */}
              </div>
              <span className="relative block">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5B6475]" aria-hidden="true" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    updateError("password", "");
                  }}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  required
                  minLength={isSignUp ? 8 : undefined}
                  maxLength={isSignUp ? 128 : undefined}
                  disabled={loading}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={[
                    isSignUp ? "password-requirements" : "",
                    fieldErrors.password ? "password-error" : "",
                  ].filter(Boolean).join(" ") || undefined}
                  className={`${fieldClass} pr-20 pl-10`}
                />
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setShowPassword((shown) => !shown)}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-1 inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-xs font-bold text-[#72571F] hover:bg-[#FAF6EF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#88682A]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  {showPassword ? "Hide" : "Show"}
                </button>
              </span>
              {isSignUp && <p id="password-requirements" className="mt-2 text-xs text-[#5B6475]">Use 8 to 128 characters.</p>}
              {fieldErrors.password && <p id="password-error" role="alert" aria-live="polite" className="mt-1.5 text-sm text-rose-700">{fieldErrors.password}</p>}
            </div>

            {error && <p role="alert" aria-live="polite" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
            <Button type="submit" loading={loading} className="min-h-12 w-full">
              {isSignUp ? "Create account" : "Sign in"}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </form>

          {!isSignUp && (
            <>
              <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-[#5B6475]">
                <span className="h-px flex-1 bg-[#D5C3A5]" />
                or
                <span className="h-px flex-1 bg-[#D5C3A5]" />
              </div>
              <Link
                href="/demo/dashboard"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-[#1F2A44] bg-white px-4 py-3 text-sm font-bold text-[#1F2A44] hover:bg-[#FAF6EF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#88682A]"
              >
                View the sample dashboard (no sign up needed)
              </Link>
              <p className="mt-2 text-center text-xs text-[#5B6475]">The sample dashboard uses made-up data.</p>
            </>
          )}

          <Link href="/" className="mt-5 inline-flex min-h-10 w-full items-center justify-center rounded-lg text-sm font-semibold text-[#72571F] underline underline-offset-4 hover:text-[#1F2A44] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#88682A]">
            Back to ScaleUp
          </Link>
        </div>
      </main>
    </div>
  );
}

export default function AuthForm({ mode }: { mode: AuthMode }) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#F6F1E8] p-6 text-sm text-[#5B6475]" role="status">
          Loading account form...
        </main>
      }
    >
      <AuthFormContent mode={mode} />
    </Suspense>
  );
}
