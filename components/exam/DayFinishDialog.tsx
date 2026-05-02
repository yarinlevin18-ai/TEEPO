'use client'

// Daily summary dialog — spec §5.2.2.
// Asks "איך הלך היום?" with 3 outcomes and an optional blocker note.

import { useState } from 'react'

export type CompletionVerdict = 'all' | 'partial' | 'none'

interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (verdict: CompletionVerdict, note?: string) => void
}

const OPTIONS: Array<{ verdict: CompletionVerdict; label: string; emoji: string; tone: string }> = [
  { verdict: 'all', label: 'השלמתי הכל', emoji: '✓', tone: 'bg-emerald-500/20 border-emerald-500/50 hover:bg-emerald-500/30' },
  { verdict: 'partial', label: 'השלמתי חלק', emoji: '◐', tone: 'bg-amber-500/20 border-amber-500/50 hover:bg-amber-500/30' },
  { verdict: 'none', label: 'לא הצלחתי', emoji: '✗', tone: 'bg-red-500/20 border-red-500/50 hover:bg-red-500/30' },
]

export function DayFinishDialog({ open, onClose, onSubmit }: Props) {
  const [verdict, setVerdict] = useState<CompletionVerdict | null>(null)
  const [note, setNote] = useState('')

  if (!open) return null

  const submit = () => {
    if (!verdict) return
    onSubmit(verdict, note.trim() || undefined)
    setVerdict(null)
    setNote('')
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="סיכום יום"
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6 space-y-5 shadow-2xl"
      >
        <header>
          <h2 className="text-xl font-bold">איך הלך היום?</h2>
          <p className="text-sm text-zinc-400 mt-1">סיכום קצר עוזר לתכנית להתאים את עצמה למחר.</p>
        </header>

        <div className="grid grid-cols-3 gap-2">
          {OPTIONS.map((o) => (
            <button
              key={o.verdict}
              onClick={() => setVerdict(o.verdict)}
              aria-pressed={verdict === o.verdict}
              className={`flex flex-col items-center justify-center gap-1 p-3 rounded-lg border transition ${
                verdict === o.verdict
                  ? o.tone + ' ring-2 ring-white/30'
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
            >
              <span className="text-2xl" aria-hidden>
                {o.emoji}
              </span>
              <span className="text-xs font-medium">{o.label}</span>
            </button>
          ))}
        </div>

        {verdict && verdict !== 'all' && (
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5" htmlFor="day-note">
              מה עיכב אותך? (אופציונלי)
            </label>
            <textarea
              id="day-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="עומס בקורסים אחרים, יום קשה, תוכן שהתקשיתי איתו..."
              className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm outline-none focus:border-fuchsia-400 resize-y"
            />
          </div>
        )}

        <div className="flex justify-between gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"
          >
            ביטול
          </button>
          <button
            onClick={submit}
            disabled={!verdict}
            className="px-5 py-2 rounded-lg bg-gradient-to-l from-fuchsia-500 to-blue-500 font-semibold disabled:opacity-40"
          >
            שמור והמשך מחר
          </button>
        </div>
      </div>
    </div>
  )
}
