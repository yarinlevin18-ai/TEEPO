"use client";

// Hero Reveal — staggered fade-up on mount.
// Copied from motion-lab spec (hero-reveal). React 18 adaptation: uses
// <Context.Provider value={...}> instead of the React 19 shorthand.
//
// Usage:
//   <HeroReveal>
//     <HeroRevealItem><h1>Big headline</h1></HeroRevealItem>
//     <HeroRevealItem><p>Subtitle</p></HeroRevealItem>
//     <HeroRevealItem><Button>Get started</Button></HeroRevealItem>
//   </HeroReveal>

import { type ReactNode, createContext, useContext, useRef } from "react";
import {
  motion,
  useInView,
  type Variants,
  type Transition,
} from "framer-motion";

export interface HeroRevealProps {
  children: ReactNode;
  stagger?: number;
  delay?: number;
  duration?: number;
  distance?: number;
  once?: boolean;
  easing?: "spring" | "easeOut";
}

interface RevealConfig {
  distance: number;
  transition: Transition;
}

const RevealContext = createContext<RevealConfig>({
  distance: 24,
  transition: { type: "spring", damping: 24, mass: 0.8, stiffness: 200 },
});

export function HeroReveal({
  children,
  stagger = 0.08,
  delay = 0.1,
  duration = 0.6,
  distance = 24,
  once = true,
  easing = "spring",
}: HeroRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once, amount: 0.3 });

  const transition: Transition =
    easing === "spring"
      ? { type: "spring", damping: 24, mass: 0.8, stiffness: 200 }
      : { type: "tween", ease: "easeOut", duration };

  const containerVariants: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: stagger,
        delayChildren: delay,
      },
    },
  };

  return (
    <RevealContext.Provider value={{ distance, transition }}>
      <motion.div
        ref={ref}
        variants={containerVariants}
        initial="hidden"
        animate={isInView ? "visible" : "hidden"}
      >
        {children}
      </motion.div>
    </RevealContext.Provider>
  );
}

export function HeroRevealItem({ children }: { children: ReactNode }) {
  const { distance, transition } = useContext(RevealContext);

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: distance },
    visible: { opacity: 1, y: 0, transition },
  };

  return <motion.div variants={itemVariants}>{children}</motion.div>;
}
