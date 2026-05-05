'use client'

/**
 * University picker shown during onboarding (task #14).
 *
 * The user picks BGU or TAU once; the choice is written to
 * `settings.university` in the Drive DB and drives every subsequent
 * piece of "which university are we?" behaviour (catalog file, scraper
 * routing, sidebar branding, advisor knowledge base, etc.).
 *
 * This component is presentational only — the actual write happens in
 * the consumer (see `OnboardingGate.tsx`).
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { GraduationCap, Loader2 } from 'lucide-react'
import type { UniversityCode } from '@/types'
import GlowCard from '@/components/ui/GlowCard'

interface University {
  code: UniversityCode
  name: string
  short: string
  /** Used as the card's accent / glow tint. */
  color: string
}

const UNIVERSITIES: University[] = [
  {
    code: 'bgu',
    name: 'אוניברסיטת בן-גוריון בנגב',
    short: 'BGU',
    color: '#6366f1',
  },
  {
    code: 'tau',
    name: 'אוניברסיטת תל אביב',
    short: 'TAU',
    color: '#f59e0b',
  },
]

interface Props {
  onPick: (code: UniversityCode) => Promise<void> | void
  /** Optional headline override — useful when reusing in Settings page (task #18). */
  title?: string
  subtitle?: string
}

export default function UniversitySelector({
  onPick,
  title = 'באיזו אוניברסיטה אתה לומד?',
  subtitle = 'נטען לך את הקטלוג הנכון, נתחבר ל-Moodle המתאים, וננגיש את החומרים של האוניברסיטה שלך. אפשר לשנות בהגדרות בכל זמן.',
}: Props) {
  const [savingCode, setSavingCode] = useState<UniversityCode | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handlePick = async (code: UniversityCode) => {
    if (savingCode) return
    setError(null)
    setSavingCode(code)
    try {
      await onPick(code)
    } catch (e: any) {
      setError(e?.message || 'שמירת הבחירה נכשלה. נסה שוב.')
      setSavingCode(null)
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="text-center mb-8"
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{
            background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(139,92,246,0.10))',
            boxShadow: 'inset 0 0 0 1px rgba(99,102,241,0.18), 0 0 30px rgba(99,102,241,0.10)',
          }}
        >
          <GraduationCap size={26} className="text-accent-400" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-ink mb-3">{title}</h1>
        <p className="text-sm text-ink-muted leading-relaxed max-w-md mx-auto">{subtitle}</p>
      </motion.div>

      <div className="grid sm:grid-cols-2 gap-4">
        {UNIVERSITIES.map((u, i) => {
          const isLoading = savingCode === u.code
          const otherIsLoading = savingCode !== null && !isLoading
          return (
            <motion.button
              key={u.code}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: otherIsLoading ? 0.4 : 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.06, duration: 0.3 }}
              whileHover={!savingCode ? { scale: 1.02, y: -2 } : undefined}
              whileTap={!savingCode ? { scale: 0.98 } : undefined}
              onClick={() => handlePick(u.code)}
              disabled={!!savingCode}
              className="text-right disabled:cursor-not-allowed"
            >
              <GlowCard
                glowColor={`${u.color}1A`}
                className="p-6 h-full transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                    style={{
                      background: `linear-gradient(135deg, ${u.color}, ${u.color}AA)`,
                      boxShadow: `0 6px 20px ${u.color}33`,
                    }}
                  >
                    {u.short}
                  </div>
                  {isLoading && <Loader2 size={18} className="animate-spin text-ink-muted" />}
                </div>
                <p className="font-bold text-ink text-base leading-tight">{u.name}</p>
                <p className="text-xs text-ink-subtle mt-1">{u.short}</p>
              </GlowCard>
            </motion.button>
          )
        })}
      </div>

      {error && (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center text-sm text-red-400 mt-6"
        >
          {error}
        </motion.p>
      )}

      <p className="text-center text-xs text-ink-subtle mt-8">
        אוניברסיטות נוספות (טכניון, האוניברסיטה העברית, רייכמן ועוד) יתווספו בשלב 3.
      </p>
    </div>
  )
}
