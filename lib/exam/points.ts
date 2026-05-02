// Points ledger + rank calculation for TEEPO Exam.
//
// A single `PointEvent` log is the source of truth. Totals (global +
// per-exam) are derived; ranks are bucketed by total. The predicted exam
// score is an assumption-based mapping from rank — a heuristic, not a real
// statistical model. The point is to give the student a visceral sense of
// where they stand, not a calibrated prediction.

import type { Flashcard } from '@/types'

export type PointSource =
  | 'day_complete'
  | 'day_partial'
  | 'practice_mcq'
  | 'practice_open'
  | 'practice_flashcard'
  | 'simulation'
  | 'game_match'
  | 'game_gravity'
  | 'game_hangman'

export interface PointEvent {
  id: string
  /** When set, the event also counts toward the per-exam total. Otherwise it's global-only. */
  exam_id?: string
  plan_id?: string
  source: PointSource
  amount: number
  created_at: string
  /** Free-form metadata (e.g. score, mistakes, hearts left) for transparency. */
  meta?: Record<string, unknown>
}

// ---- Award helpers ----

export function pointsForDay(verdict: 'all' | 'partial' | 'none'): number {
  if (verdict === 'all') return 50
  if (verdict === 'partial') return 20
  return 0
}

export function pointsForMcq(scorePercent: number): number {
  // 100% = 50 pts. Linear scaling.
  return Math.round((scorePercent / 100) * 50)
}

export function pointsForOpen(scorePercent: number): number {
  return Math.round((scorePercent / 100) * 50)
}

export function pointsForFlashcards(knownCount: number): number {
  return knownCount
}

export function pointsForSimulation(scorePercent: number): number {
  // 100% = 100 pts. Higher ceiling because simulations are heavier.
  return Math.round(scorePercent)
}

export function pointsForMatch(matched: number, mistakes: number, total: number): number {
  if (matched < total) return Math.round(matched * 2) // partial credit for quitting
  return 30 + (mistakes === 0 ? 10 : 0)
}

export function pointsForGravity(cleared: number, livesLeft: number, total: number): number {
  if (cleared < total) return cleared * 3
  return 30 + livesLeft * 5
}

export function pointsForHangman(won: number): number {
  return won * 5
}

// ---- Ranks ----

export interface Rank {
  id: 'beginner' | 'bronze' | 'silver' | 'gold' | 'diamond' | 'champion'
  label: string
  emoji: string
  threshold: number      // minimum total points to enter this rank
  predictedScore: number // assumed exam %, used only as a heuristic display
  tone: string           // tailwind class for accent color
}

// Ordered low → high.
export const RANKS: Rank[] = [
  { id: 'beginner', label: 'מתחיל',  emoji: '🌱', threshold: 0,    predictedScore: 60, tone: 'text-zinc-300' },
  { id: 'bronze',   label: 'ארד',    emoji: '🥉', threshold: 100,  predictedScore: 70, tone: 'text-amber-400' },
  { id: 'silver',   label: 'כסף',    emoji: '🥈', threshold: 250,  predictedScore: 78, tone: 'text-zinc-200' },
  { id: 'gold',     label: 'זהב',    emoji: '🥇', threshold: 500,  predictedScore: 85, tone: 'text-yellow-300' },
  { id: 'diamond',  label: 'יהלום',  emoji: '💎', threshold: 800,  predictedScore: 90, tone: 'text-cyan-300' },
  { id: 'champion', label: 'אלוף',   emoji: '👑', threshold: 1200, predictedScore: 95, tone: 'text-fuchsia-300' },
]

export function rankFor(points: number): Rank {
  let current = RANKS[0]
  for (const r of RANKS) {
    if (points >= r.threshold) current = r
    else break
  }
  return current
}

export function nextRank(points: number): Rank | null {
  const current = rankFor(points)
  const idx = RANKS.findIndex((r) => r.id === current.id)
  return idx >= 0 && idx < RANKS.length - 1 ? RANKS[idx + 1] : null
}

/** Progress 0..1 between current rank threshold and next. Returns 1 at top rank. */
export function rankProgress(points: number): number {
  const current = rankFor(points)
  const next = nextRank(points)
  if (!next) return 1
  const span = next.threshold - current.threshold
  return Math.min(1, Math.max(0, (points - current.threshold) / span))
}

// ---- Aggregation ----

export function totalPoints(events: PointEvent[]): number {
  return events.reduce((s, e) => s + e.amount, 0)
}

export function examPoints(events: PointEvent[], examId: string): number {
  return events.filter((e) => e.exam_id === examId).reduce((s, e) => s + e.amount, 0)
}

export function recentEvents(events: PointEvent[], limit = 5): PointEvent[] {
  return [...events]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit)
}

// Source labels in Hebrew for the activity feed.
export const SOURCE_LABEL: Record<PointSource, string> = {
  day_complete: 'סיום יום מלא',
  day_partial: 'סיום יום חלקי',
  practice_mcq: 'תרגול אמריקאיות',
  practice_open: 'תרגול פתוחות',
  practice_flashcard: 'כרטיסיות זיכרון',
  simulation: 'סימולציית מבחן',
  game_match: 'משחק זיכרון',
  game_gravity: 'התפצוצות',
  game_hangman: 'איש תלוי',
}

// Re-exported for convenience to game components that already import this file.
export type { Flashcard }
