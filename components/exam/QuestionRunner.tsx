"use client";

import { useState } from "react";
import type { Question } from "@/types";

interface Props {
  planId: string;
  questions?: Question[];
}

export function QuestionRunner({ questions = [] }: Props) {
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  if (questions.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
        <p className="text-zinc-300 mb-4">בחר נושא וסוג תרגול כדי להתחיל.</p>
        <button className="px-5 py-2 rounded-lg bg-gradient-to-l from-fuchsia-500 to-blue-500 font-semibold">
          צור תרגיל
        </button>
      </div>
    );
  }

  const q = questions[idx];
  const userAnswer = answers[q.id];
  const answered = userAnswer !== undefined;

  return (
    <div className="space-y-4">
      <div className="text-xs text-zinc-400">שאלה {idx + 1} מתוך {questions.length}</div>
      <div className="h-1 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full bg-fuchsia-400" style={{ width: `${((idx + 1) / questions.length) * 100}%` }} />
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <p className="text-lg leading-relaxed mb-4">{q.content}</p>

        {q.type === "mcq" && q.options && (
          <div className="space-y-2">
            {q.options.map((opt) => {
              const isUser = userAnswer === opt.label;
              const cls = answered
                ? opt.is_correct
                  ? "bg-emerald-500/20 border-emerald-500/50"
                  : isUser
                  ? "bg-red-500/20 border-red-500/50"
                  : "bg-white/5 border-white/10"
                : "bg-white/5 border-white/10 hover:bg-white/10";
              return (
                <button
                  key={opt.label}
                  disabled={answered}
                  onClick={() => setAnswers({ ...answers, [q.id]: opt.label })}
                  className={`w-full text-right p-3 rounded-lg border transition ${cls}`}
                >
                  <span className="font-bold ml-2">{opt.label}.</span>
                  {opt.text}
                </button>
              );
            })}
          </div>
        )}

        {answered && q.explanation && (
          <div className="mt-4 p-3 rounded-lg bg-cyan-500/10 border-r-2 border-cyan-400 text-sm">
            <strong className="text-cyan-300">הסבר:</strong> {q.explanation}
            {q.source_file_ref && (
              <div className="text-xs text-zinc-400 mt-1">מקור: {q.source_file_ref}</div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button
          disabled={idx === 0}
          onClick={() => setIdx(idx - 1)}
          className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 disabled:opacity-40"
        >
          הקודמת
        </button>
        <button
          disabled={!answered || idx === questions.length - 1}
          onClick={() => setIdx(idx + 1)}
          className="px-4 py-2 rounded-lg bg-gradient-to-l from-fuchsia-500 to-blue-500 font-semibold disabled:opacity-40"
        >
          הבאה ←
        </button>
      </div>
    </div>
  );
}
