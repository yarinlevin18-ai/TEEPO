'use client'

import { Flame } from 'lucide-react'
import type { StreakInfo } from '@/lib/exam/streaks'

interface Props {
  streak: StreakInfo
}

export function StreakCard({ streak }: Props) {
  const isHot = streak.current >= 3
  const isCold = !streak.active_today && streak.current > 0

  return (
    <div className="exam-card-strong p-4 flex items-center gap-3 relative overflow-hidden">
      {/* Soft warm glow behind the flame when streak is hot */}
      {isHot && (
        <div
          aria-hidden
          className="absolute -left-4 top-1/2 -translate-y-1/2 w-24 h-24 rounded-full pointer-events-none"
          style={{
            background:
              'radial-gradient(circle, rgba(249, 115, 22, 0.20) 0%, rgba(249, 115, 22, 0) 70%)',
            filter: 'blur(6px)',
          }}
        />
      )}

      <div
        className={`relative shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center ${
          isHot
            ? 'bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-[0_4px_16px_rgba(249,115,22,0.4)]'
            : streak.current === 0
            ? 'bg-zinc-700/40 text-zinc-500'
            : 'bg-amber-500/20 text-amber-300'
        }`}
      >
        <Flame size={22} className={isHot ? 'streak-flicker' : ''} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-zinc-500">רצף יומי</div>
        <div className="flex items-baseline gap-2">
          <span
            className={`text-3xl font-black tabular-nums ${
              isHot ? 'text-orange-300' : streak.current === 0 ? 'text-zinc-400' : 'text-amber-300'
            }`}
          >
            {streak.current}
          </span>
          <span className="text-xs text-zinc-400">
            {streak.current === 1 ? 'יום' : 'ימים'}
          </span>
        </div>
        {streak.current === 0 ? (
          <div className="text-[11px] text-zinc-500 mt-0.5">תרגל היום כדי להתחיל רצף</div>
        ) : isCold ? (
          <div className="text-[11px] text-amber-300 mt-0.5">תרגל היום כדי לא לאבד את הרצף</div>
        ) : streak.longest > streak.current ? (
          <div className="text-[11px] text-zinc-500 mt-0.5">
            שיא אישי: {streak.longest} ימים
          </div>
        ) : (
          <div className="text-[11px] text-emerald-300 mt-0.5">שיא אישי חדש 🔥</div>
        )}
      </div>

      <style jsx>{`
        :global(.streak-flicker) {
          animation: streak-flicker 1.6s ease-in-out infinite;
          transform-origin: 50% 80%;
        }
        @keyframes streak-flicker {
          0%, 100% { transform: scale(1) rotate(-1.5deg); }
          50%      { transform: scale(1.08) rotate(2deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          :global(.streak-flicker) { animation: none; }
        }
      `}</style>
    </div>
  )
}
