"use client";

// FadeScale — gentle fade + slight scale-in reveal.
//
// NOT in motion-lab spec yet. Adapted from hero-reveal's "soft" preset
// (duration: 0.8s, easeOut) with scale instead of y-translation.
// TODO: promote this into motion-lab as a dedicated pattern, then replace.
//
// Usage:
//   <FadeScale delay={0.4}><Hero /></FadeScale>          // on mount, delayed
//   <FadeScale trigger="scroll"><Mockup /></FadeScale>   // on scroll-into-view

import { type ReactNode, useRef } from "react";
import { motion, useInView } from "framer-motion";

export interface FadeScaleProps {
  children: ReactNode;
  trigger?: "mount" | "scroll";
  delay?: number;
  duration?: number;
  scaleFrom?: number;
  threshold?: number;
  once?: boolean;
}

export function FadeScale({
  children,
  trigger = "scroll",
  delay = 0,
  duration = 0.8,
  scaleFrom = 0.96,
  threshold = 0.25,
  once = true,
}: FadeScaleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once, amount: threshold });
  const shouldPlay = trigger === "scroll" ? inView : true;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: scaleFrom }}
      animate={shouldPlay ? { opacity: 1, scale: 1 } : { opacity: 0, scale: scaleFrom }}
      transition={{ duration, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
