"use client";

import { useState } from "react";
import type { Flashcard } from "@/types";

// Spec §6.5: simple fixed schedule 1d / 3d / 7d / 14d. SM-2 deferred to phase 2.
const NEXT_INTERVAL_DAYS = [1, 3, 7, 14];

export function nextDueDate(card: Flashcard, knew: boolean): string {
  if (!knew) {
    return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  }
  const lastIdx = card.last_reviewed
    ? Math.min(NEXT_INTERVAL_DAYS.length - 1, intervalIndex(card))
    : 0;
  const days = NEXT_INTERVAL_DAYS[Math.min(lastIdx + 1, NEXT_INTERVAL_DAYS.length - 1)];
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

function intervalIndex(card: Flashcard): number {
  if (!card.last_reviewed || !card.next_due) return 0;
  const span = (new Date(card.next_due).getTime() - new Date(card.last_reviewed).getTime()) / 86400000;
  return NEXT_INTERVAL_DAYS.findIndex((d) => d >= span);
}

interface Props {
  cards: Flashcard[];
  onJudge?: (card: Flashcard, knew: boolean) => void;
}

export function FlashcardDeck({ cards, onJudge }: Props) {
  const [idx, setIdx] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [knownCount, setKnownCount] = useState(0);

  if (cards.length === 0) return <p className="text-zinc-400">אין כרטיסיות בסבב הנוכחי.</p>;
  if (idx >= cards.length) {
    return (
      <div className="text-center p-8">
        <h2 className="text-2xl font-bold mb-2">סיימת את הסבב</h2>
        <p className="text-zinc-300">ידעת {knownCount} מתוך {cards.length}.</p>
      </div>
    );
  }

  const card = cards[idx];

  const judge = (knew: boolean) => {
    onJudge?.(card, knew);
    if (knew) setKnownCount((c) => c + 1);
    setShowBack(false);
    setIdx((i) => i + 1);
  };

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="text-xs text-zinc-400 text-center">
        {idx + 1} / {cards.length} · ידעת {knownCount}
      </div>

      <div
        onClick={() => setShowBack((s) => !s)}
        className="aspect-[3/2] rounded-2xl border border-white/10 bg-gradient-to-br from-fuchsia-500/10 to-blue-500/10 p-8 flex items-center justify-center text-center cursor-pointer select-none"
      >
        <p className="text-xl">{showBack ? card.back : card.front}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => judge(false)} className="py-3 rounded-lg bg-red-500/20 border border-red-500/50 font-semibold">
          לא ידעתי ✗
        </button>
        <button onClick={() => judge(true)} className="py-3 rounded-lg bg-emerald-500/20 border border-emerald-500/50 font-semibold">
          ידעתי ✓
        </button>
      </div>
    </div>
  );
}
