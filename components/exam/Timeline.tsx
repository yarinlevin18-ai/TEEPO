"use client";

import Link from "next/link";
import type { Exam } from "@/types";
import { daysBetween } from "@/lib/exam/plan-builder";

interface Props {
  exams?: Exam[];
}

function urgencyColor(daysAway: number): string {
  if (daysAway <= 7) return "bg-red-500/20 border-red-500/50 text-red-200";
  if (daysAway <= 21) return "bg-amber-500/20 border-amber-500/50 text-amber-200";
  return "bg-emerald-500/20 border-emerald-500/50 text-emerald-200";
}

export function Timeline({ exams = [] }: Props) {
  const today = new Date().toISOString().slice(0, 10);

  if (exams.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-zinc-400">
        אין מבחנים בציר הזמן. הוסף מבחן ידנית או סנכרן את הפורטל.
      </div>
    );
  }

  const sorted = [...exams].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="flex gap-3 overflow-x-auto pb-2" role="list">
      {sorted.map((exam) => {
        const days = daysBetween(today, exam.date);
        return (
          <Link
            key={exam.id}
            href={`/exam/plan/${exam.id}`}
            role="listitem"
            className={`min-w-[200px] rounded-xl border p-4 transition hover:scale-[1.02] ${urgencyColor(
              days,
            )}`}
          >
            <div className="text-xs opacity-80">{exam.date}</div>
            <div className="font-semibold mt-1">{exam.title}</div>
            <div className="text-2xl font-bold tabular-nums mt-2">{days} ימים</div>
          </Link>
        );
      })}
    </div>
  );
}
