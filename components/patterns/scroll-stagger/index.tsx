"use client";

// Scroll Stagger — items animate in as they enter the viewport with a stagger.
// Copied from motion-lab spec (scroll-stagger). React 18 adaptation: uses
// <Context.Provider value={...}> instead of the React 19 shorthand.
//
// Usage:
//   <ScrollStagger>
//     <ScrollStaggerItem><Card>...</Card></ScrollStaggerItem>
//     <ScrollStaggerItem><Card>...</Card></ScrollStaggerItem>
//   </ScrollStagger>

import { type ReactNode, type RefObject, createContext, useContext, useRef } from "react";
import {
  motion,
  useInView,
  type Variants,
  type Transition,
} from "framer-motion";

export interface ScrollStaggerProps {
  children: ReactNode;
  stagger?: number;
  duration?: number;
  distance?: number;
  once?: boolean;
  threshold?: number;
  direction?: "up" | "down" | "left" | "right";
  easing?: "spring" | "easeOut";
  scrollRoot?: RefObject<HTMLElement | null>;
}

interface StaggerConfig {
  distance: number;
  direction: "up" | "down" | "left" | "right";
  transition: Transition;
}

const StaggerContext = createContext<StaggerConfig>({
  distance: 30,
  direction: "up",
  transition: { type: "tween", ease: "easeOut", duration: 0.5 },
});

export function ScrollStagger({
  children,
  stagger = 0.08,
  duration = 0.5,
  distance = 30,
  once = true,
  threshold = 0.2,
  direction = "up",
  easing = "easeOut",
  scrollRoot,
}: ScrollStaggerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once, amount: threshold, root: scrollRoot });

  const transition: Transition =
    easing === "spring"
      ? { type: "spring", damping: 24, mass: 0.8, stiffness: 200 }
      : { type: "tween", ease: "easeOut", duration };

  const containerVariants: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: stagger,
      },
    },
  };

  return (
    <StaggerContext.Provider value={{ distance, direction, transition }}>
      <motion.div
        ref={ref}
        variants={containerVariants}
        initial="hidden"
        animate={isInView ? "visible" : "hidden"}
      >
        {children}
      </motion.div>
    </StaggerContext.Provider>
  );
}

function getHiddenOffset(direction: string, distance: number) {
  switch (direction) {
    case "down":
      return { opacity: 0, y: -distance };
    case "left":
      return { opacity: 0, x: distance };
    case "right":
      return { opacity: 0, x: -distance };
    default:
      return { opacity: 0, y: distance };
  }
}

export function ScrollStaggerItem({ children }: { children: ReactNode }) {
  const { distance, direction, transition } = useContext(StaggerContext);

  const itemVariants: Variants = {
    hidden: getHiddenOffset(direction, distance),
    visible: { opacity: 1, x: 0, y: 0, transition },
  };

  return <motion.div variants={itemVariants}>{children}</motion.div>;
}
