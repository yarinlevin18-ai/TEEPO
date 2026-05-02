"use client";

import { useEffect, useState } from "react";

interface Props {
  examId: string;
  durationMinutes?: number;
  onSubmit?: () => void;
}

function formatHMS(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export function SimulationTimer({ examId, durationMinutes = 180, onSubmit }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(durationMinutes * 60);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          setRunning(false);
          onSubmit?.();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running, onSubmit]);

  return (
    <div dir="rtl" className="space-y-6">
      <div className="text-center">
        <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">סימולציה · מבחן {examId}</div>
        <div
          className={`text-7xl font-mono font-bold tabular-nums ${
            secondsLeft < 600 ? "text-red-400" : "text-zinc-100"
          }`}
          aria-live="polite"
        >
          {formatHMS(secondsLeft)}
        </div>
      </div>

      <div className="max-w-2xl mx-auto space-y-4">
        {/* Question content slot — populated by parent */}
        <div className="rounded-2xl border border-white/10 bg-zinc-900 p-6 min-h-[300px]">
          <p className="text-zinc-400">— תוכן השאלה הנוכחית —</p>
        </div>

        <div className="flex justify-between gap-3">
          <button className="px-4 py-2 rounded-lg bg-white/5 border border-white/10">קודמת</button>
          <button
            onClick={() => {
              setRunning(false);
              onSubmit?.();
            }}
            className="px-5 py-2 rounded-lg bg-red-600 font-semibold"
          >
            הגש סימולציה
          </button>
          <button className="px-4 py-2 rounded-lg bg-white/5 border border-white/10">הבאה ←</button>
        </div>
      </div>
    </div>
  );
}
