"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "gold" | "secondary" | "dangerOutline" | "dangerSolid";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: Variant;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary: "bg-[#1F2A44] text-white hover:bg-[#2B3A5E] focus-visible:outline-[#88682A]",
  gold: "bg-[#C6A75E] text-[#1F2A44] hover:bg-[#E0C788] focus-visible:outline-[#88682A]",
  secondary: "border border-[#D5C3A5] bg-white text-[#1F2A44] hover:bg-[#FAF6EF] focus-visible:outline-[#88682A]",
  dangerOutline: "border border-rose-300 text-rose-700 hover:bg-rose-50 focus-visible:outline-rose-400",
  dangerSolid: "bg-rose-700 text-white hover:bg-rose-800 focus-visible:outline-rose-400",
};

/**
 * The shared button for anything that sends a request. Wraps the classes already used across the
 * app (theme tokens from globals.css only, no new UI/icon library - lucide-react was already a
 * dependency). While loading, children stay laid out but invisible (not removed), so the button's
 * size never changes; the spinner is centered over them with an absolute overlay instead of a
 * permanently-reserved leading slot, which used to throw off centering for buttons whose children
 * already start with their own icon (e.g. Upload).
 */
export default function Button({
  loading = false,
  disabled,
  variant = "primary",
  className = "",
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`relative inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      <span className={`inline-flex items-center gap-2 whitespace-nowrap ${loading ? "invisible" : ""}`}>
        {children}
      </span>
      {loading && (
        <span className="absolute inset-0 inline-flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        </span>
      )}
    </button>
  );
}
