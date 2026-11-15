"use client";

import React from "react";
import { motion, type HTMLMotionProps } from "framer-motion";

type ViewportMargin = NonNullable<
  HTMLMotionProps<"div">["viewport"]
>["margin"];

export type AnimationType =
  | "fade-up"
  | "fade-down"
  | "fade-left"
  | "fade-right"
  | "zoom-in"
  | "fade";

interface ScrollRevealProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
  animation?: AnimationType;
  delay?: number;
  duration?: number;
  distance?: number;
  className?: string;
  viewportMargin?: ViewportMargin;
  once?: boolean;
}

export default function ScrollReveal({
  children,
  animation = "fade-up",
  delay = 0,
  duration = 0.65,
  distance = 32,
  className = "",
  viewportMargin = "-50px",
  once = true,
  ...props
}: ScrollRevealProps) {
  const getInitial = () => {
    switch (animation) {
      case "fade-up":
        return { opacity: 0, y: distance };
      case "fade-down":
        return { opacity: 0, y: -distance };
      case "fade-left":
        return { opacity: 0, x: distance };
      case "fade-right":
        return { opacity: 0, x: -distance };
      case "zoom-in":
        return { opacity: 0, scale: 0.94, y: distance / 2 };
      case "fade":
      default:
        return { opacity: 0 };
    }
  };

  const getTarget = () => {
    switch (animation) {
      case "zoom-in":
        return { opacity: 1, scale: 1, y: 0 };
      default:
        return { opacity: 1, x: 0, y: 0 };
    }
  };

  return (
    <motion.div
      initial={getInitial()}
      whileInView={getTarget()}
      viewport={{ once, margin: viewportMargin }}
      transition={{
        duration,
        delay,
        ease: [0.16, 1, 0.3, 1], // Smooth Apple-style cubic bezier
      }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}
