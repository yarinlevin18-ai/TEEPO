'use client'

import { Lock } from 'lucide-react'
import {
  listAchievements,
  type Achievement,
  type AchievementCtx,
} from '@/lib/exam/achievements'

interface Props {
  ctx: AchievementCtx
  unlocked: string[]
  /** When true, shows all (locked + unlocked). When false, locked are hidden. */
  showLocked?: boolean
}

export function AchievementsGrid({ ctx, unlocked, showLocked = true }: Props) {
  const all = listAchievements()
  const set = new Set(unlocked)
  const unlockedCount = all.filter((a) => set.has(a.id)).length

  const visible = showLocked ? all : all.filter((a) => set.has(a.id))

  if (visible.length === 0) {
    return (
      <div className="exam-card p-6 text-center text-sm text-zinc-400">
        עדיין אין הישגים. תרגל קצת ונאסוף אותם כאן.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-zinc-400">
          {unlockedCount} מתוך {all.length} פתוחים
        </span>
        <div className="h-1.5 w-32 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="h-full bg-gradient-to-l from-amber-400 via-orange-400 to-indigo-400 transition-all"
            style={{ width: `${(unlockedCount / all.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {visible.map((a) => (
          <Card key={a.id} achievement={a} unlocked={set.has(a.id)} ctx={ctx} />
        ))}
      </div>
    </div>
  )
}

function Card({
  achievement,
  unlocked,
  ctx,
}: {
  achievement: Achievement
  unlocked: boolean
  ctx: AchievementCtx
}) {
  const progress = !unlocked && achievement.progress ? achievement.progress(ctx) : 0

  return (
    <div
      className={
        unlocked
          ? 'relative rounded-xl p-3 border transition border-amber-500/40 bg-gradient-to-br from-amber-500/25 to-orange-500/15'
          : 'relative rounded-xl p-3 border transition exam-card opacity-80'
      }
      title={achievement.description}
    >
      <div className="flex items-start gap-2">
        <div
          className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-xl ${
            unlocked ? 'bg-amber-500/30' : 'bg-zinc-700/60'
          }`}
        >
          {unlocked ? achievement.emoji : <Lock size={14} className="text-zinc-400" />}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={`text-xs font-semibold leading-tight ${
              unlocked ? 'text-zinc-50' : 'text-zinc-200'
            }`}
          >
            {achievement.label}
          </div>
          <div className="text-[10px] text-zinc-300/80 mt-0.5 line-clamp-2 leading-snug">
            {achievement.description}
          </div>
        </div>
      </div>

      {!unlocked && achievement.progress && (
        <div className="mt-2 h-1 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="h-full bg-amber-400/60 transition-all"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}
    </div>
  )
}
