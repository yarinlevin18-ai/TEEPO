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
    <div className="uni-picker-v2">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="uni-picker-v2-head"
      >
        <div className="uni-picker-v2-icon">
          <GraduationCap size={26} />
        </div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </motion.div>

      <div className="uni-picker-v2-grid">
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
              className="uni-picker-v2-card"
            >
              <div className="uni-picker-v2-card-top">
                <div
                  className="uni-picker-v2-card-badge"
                  style={{
                    background: `linear-gradient(135deg, ${u.color}, ${u.color}AA)`,
                    boxShadow: `0 6px 18px ${u.color}33`,
                  }}
                >
                  {u.short}
                </div>
                {isLoading && <Loader2 size={18} className="spin" />}
              </div>
              <p className="uni-picker-v2-name">{u.name}</p>
              <p className="uni-picker-v2-short">{u.short}</p>
            </motion.button>
          )
        })}
      </div>

      {error && (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="uni-picker-v2-error"
        >
          {error}
        </motion.p>
      )}

      <p className="uni-picker-v2-foot">
        אוניברסיטות נוספות (טכניון, האוניברסיטה העברית, רייכמן ועוד) יתווספו בשלב 3.
      </p>
    </div>
  )
}
