"use client";

import Image from "next/image";
import { motion } from "framer-motion";

export interface ScaleUpLogoProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
  variant?: "icon" | "full";
  animated?: boolean;
  preload?: boolean;
}

const SIZE_MAP = {
  xs: { box: "w-6 h-6", px: 24, text: "text-sm", sub: "text-[9px]" },
  sm: { box: "w-8 h-8", px: 32, text: "text-base", sub: "text-[10px]" },
  md: { box: "w-11 h-11", px: 44, text: "text-xl", sub: "text-[11px]" },
  lg: { box: "w-14 h-14", px: 56, text: "text-2xl", sub: "text-xs" },
  xl: { box: "w-20 h-20", px: 80, text: "text-3xl", sub: "text-sm" },
  "2xl": { box: "w-28 h-28", px: 112, text: "text-4xl", sub: "text-base" },
};

export default function ScaleUpLogo({
  size = "md",
  className = "",
  variant = "icon",
  animated = true,
  preload = false,
}: ScaleUpLogoProps) {
  const currentSize = SIZE_MAP[size];

  const logoIcon = (
    <div
      style={{
        width: currentSize.px,
        height: currentSize.px,
        minWidth: currentSize.px,
        minHeight: currentSize.px,
        maxWidth: currentSize.px,
        maxHeight: currentSize.px,
      }}
      className={`${currentSize.box} relative shrink-0 flex items-center justify-center overflow-hidden rounded-[18%] ${className}`}
    >
      <Image
        src="/logo-icon.png"
        alt=""
        width={256}
        height={260}
        sizes={`${currentSize.px}px`}
        preload={preload}
        className="h-full w-full object-contain"
      />
    </div>
  );

  const brandName = (
    <div className="flex flex-col text-left leading-none">
      <div className="flex items-center gap-1.5">
        <span className={`font-black tracking-tight text-white ${currentSize.text}`}>
          Scale<span className="text-transparent bg-clip-text bg-gradient-to-r from-[#E0C788] via-[#C6A75E] to-[#FAF6EF]">Up</span>
        </span>
        <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-widest bg-[#C6A75E]/20 text-[#C6A75E] border border-[#C6A75E]/40">
          AI
        </span>
      </div>
      <span
        className={`font-semibold tracking-wider uppercase text-[#C6A75E]/80 mt-1 ${currentSize.sub}`}
      >
        Decision Intelligence
      </span>
    </div>
  );

  const content = (
    <div className="inline-flex items-center gap-3">
      {logoIcon}
      {variant === "full" && brandName}
    </div>
  );

  return animated ? (
    <motion.div
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      className="inline-flex cursor-pointer"
    >
      {content}
    </motion.div>
  ) : (
    content
  );
}
