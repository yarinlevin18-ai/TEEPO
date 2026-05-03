// Achievements — deterministic unlocks based on store data.
//
// Each achievement carries a `criteria` function that takes the current
// store snapshot and returns true if the achievement is unlocked. Unlocks
// are computed on every render; the dashboard fires a toast and persists
// the id list when it sees a new one.

import type { PointEvent } from '@/lib/exam/points'
import type {
  Flashcard,
  PracticeSession,
  Simulation,
  StudyPlan,
} from '@/types'
import { computeStreak } from './streaks'
import { planMastery } from './mastery'

export interface AchievementCtx {
  pointEvents: PointEvent[]
  practiceSessions: PracticeSession[]
  simulations: Simulation[]
  flashcards: Flashcard[]
  plans: StudyPlan[]
  totalPoints: number
}

export interface Achievement {
  id: string
  emoji: string
  label: string
  description: string
  /** Returns true when the achievement is currently met. */
  criteria: (ctx: AchievementCtx) => boolean
  /** Optional progress 0..1 for locked achievements (shown on the card). */
  progress?: (ctx: AchievementCtx) => number
}

// Helpers
const allEvents = (ctx: AchievementCtx) => ctx.pointEvents
const eventsByHour = (ctx: AchievementCtx, fromHour: number, toHour: number) =>
  allEvents(ctx).filter((e) => {
    const h = new Date(e.created_at).getHours()
    return h >= fromHour && h < toHour
  })

const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_practice',
    emoji: '🎯',
    label: 'תרגיל ראשון',
    description: 'סיימת את התרגיל הראשון שלך.',
    criteria: (ctx) => ctx.practiceSessions.length >= 1,
  },
  {
    id: 'streak_3',
    emoji: '🔥',
    label: 'שלוש בשורה',
    description: 'תרגלת 3 ימים ברציפות.',
    criteria: (ctx) => computeStreak(ctx.pointEvents).longest >= 3,
    progress: (ctx) => Math.min(1, computeStreak(ctx.pointEvents).current / 3),
  },
  {
    id: 'streak_7',
    emoji: '🌟',
    label: 'שבוע מושלם',
    description: 'תרגלת 7 ימים ברציפות.',
    criteria: (ctx) => computeStreak(ctx.pointEvents).longest >= 7,
    progress: (ctx) => Math.min(1, computeStreak(ctx.pointEvents).current / 7),
  },
  {
    id: 'streak_14',
    emoji: '🏔️',
    label: 'שבועיים בלי הפסקה',
    description: 'מסלול של 14 ימים רצופים.',
    criteria: (ctx) => computeStreak(ctx.pointEvents).longest >= 14,
    progress: (ctx) => Math.min(1, computeStreak(ctx.pointEvents).current / 14),
  },
  {
    id: 'mcq_perfect',
    emoji: '💯',
    label: 'ציון מושלם',
    description: 'תרגיל אמריקאיות עם 100%.',
    criteria: (ctx) =>
      ctx.practiceSessions.some((s) => s.type === 'mcq' && (s.score ?? 0) >= 100),
  },
  {
    id: 'flashcards_100',
    emoji: '📚',
    label: 'מאה כרטיסיות',
    description: '100 כרטיסיות במצב "ידעתי".',
    criteria: (ctx) => {
      const known = ctx.flashcards.filter(
        (c) => c.status === 'known' || c.status === 'due_again',
      ).length
      return known >= 100
    },
    progress: (ctx) => {
      const known = ctx.flashcards.filter(
        (c) => c.status === 'known' || c.status === 'due_again',
      ).length
      return Math.min(1, known / 100)
    },
  },
  {
    id: 'first_simulation',
    emoji: '🎓',
    label: 'סימולציה ראשונה',
    description: 'סיימת את הסימולציה הראשונה.',
    criteria: (ctx) => ctx.simulations.length >= 1,
  },
  {
    id: 'simulation_high',
    emoji: '🏆',
    label: 'אלוף סימולציה',
    description: 'סימולציה עם ציון 90% או יותר.',
    criteria: (ctx) => ctx.simulations.some((s) => (s.score ?? 0) >= 90),
  },
  {
    id: 'topic_mastered',
    emoji: '🧠',
    label: 'שולט בנושא',
    description: 'הגעת ל-80% שליטה בנושא.',
    criteria: (ctx) => {
      for (const plan of ctx.plans) {
        const scores = planMastery(
          plan,
          ctx.practiceSessions,
          ctx.simulations,
          ctx.flashcards,
        )
        if (scores.some((s) => s.score !== null && s.score >= 80)) return true
      }
      return false
    },
  },
  {
    id: 'night_owl',
    emoji: '🌙',
    label: 'לומד הלילה',
    description: 'תרגלת בין 22:00 ל-04:00.',
    criteria: (ctx) =>
      allEvents(ctx).some((e) => {
        const h = new Date(e.created_at).getHours()
        return h >= 22 || h < 4
      }),
  },
  {
    id: 'early_bird',
    emoji: '🌅',
    label: 'לומד הבוקר',
    description: 'תרגלת בין 05:00 ל-08:00.',
    criteria: (ctx) => eventsByHour(ctx, 5, 8).length > 0,
  },
  {
    id: 'rank_champion',
    emoji: '👑',
    label: 'אלוף',
    description: 'הגעת לדרגה הגבוהה ביותר.',
    criteria: (ctx) => ctx.totalPoints >= 1200,
    progress: (ctx) => Math.min(1, ctx.totalPoints / 1200),
  },
]

export function listAchievements(): Achievement[] {
  return ACHIEVEMENTS
}

/** Returns the IDs that are currently unlocked given the context. */
export function currentlyUnlocked(ctx: AchievementCtx): Set<string> {
  const out = new Set<string>()
  for (const a of ACHIEVEMENTS) {
    try {
      if (a.criteria(ctx)) out.add(a.id)
    } catch {
      // Defensive: skip an achievement that throws (e.g. malformed data).
    }
  }
  return out
}

/** Returns achievements newly unlocked since the previous snapshot. */
export function newlyUnlocked(ctx: AchievementCtx, previous: string[]): Achievement[] {
  const prev = new Set(previous)
  const now = currentlyUnlocked(ctx)
  return ACHIEVEMENTS.filter((a) => now.has(a.id) && !prev.has(a.id))
}
