'use client'

/**
 * AcademicSummary — bottom-of-dashboard credits + GPA summary card,
 * per teepo-design/mockup_dashboard_v2.html §"המעקב האקדמי שלי".
 *
 * Left half (1.4fr): נקודות זכות שצברתי — big {earned}/{total} number,
 * shimmer progress bar, foot row with percent + remaining + trend chip.
 * Right half (1fr): ממוצע נוכחי — big GPA in --accent, honors badge,
 * foot row with semester GPA + delta-vs-last-semester trend.
 *
 * No fake data. Everything comes from useAcademicProgress(); when a
 * derivation can't run yet (no track configured, no grades), the
 * corresponding chip/section renders a clean empty state and the user
 * sees the rest of the card without invented numbers.
 *
 * The mockup's literal sample values — 78/120, 91.4, 92.8, +18, +1.4
 * — are NEVER hardcoded; they were placeholders only.
 */

import Link from 'next/link'
import { TrendingUp, Award, ExternalLink, ChevronLeft } from 'lucide-react'
import { useAcademicProgress, type HonorsBadge } from '@/lib/use-academic-progress'

function trendLabel(delta: number | null): { label: string; positive: boolean } | null {
  if (delta == null || delta === 0) return null
  const positive = delta > 0
  const sign = positive ? '+' : ''
  return {
    label: `${sign}${delta} מהסמסטר שעבר`,
    positive,
  }
}

function honorsLabel(h: HonorsBadge): string | null {
  if (!h) return null
  return h
}

export default function AcademicSummary() {
  const p = useAcademicProgress()

  // First-run / no-profile shell — point the user at /credits onboarding.
  if (!p.loading && (p.totalCreditsForDegree == null || p.totalCreditsForDegree === 0)) {
    return (
      <section className="academic-summary academic-summary-empty">
        <div className="as-empty-body">
          <p className="dp-title">בוא נגדיר את המסלול שלך</p>
          <p className="dp-empty-msg">
            כדי לעקוב אחרי הנק"ז והממוצע — ספר לנו מה אתה לומד.
          </p>
          <Link href="/credits" className="dp-btn primary">
            הגדר מסלול
            <ChevronLeft size={14} />
          </Link>
        </div>
      </section>
    )
  }

  const semesterTrend = trendLabel(p.semesterDelta)
  const honors = honorsLabel(p.honors)

  return (
    <section className="academic-summary" aria-label="המעקב האקדמי שלי">
      {/* ── Credits block (left) ──────────────────────────────────── */}
      <div className="stat-block credits">
        <span className="stat-eyebrow">נקודות זכות שצברתי</span>
        <div className="stat-big">
          {p.earnedCredits ?? '—'}
          <small>/ {p.totalCreditsForDegree ?? '—'}</small>
        </div>
        <div className="progress-bar" aria-hidden>
          <div
            className="progress-fill"
            style={{ width: `${p.percentComplete ?? 0}%` }}
          />
        </div>
        <div className="stat-foot">
          {p.percentComplete != null && p.remainingCredits != null ? (
            <span>
              {p.percentComplete}% מהדרך · נשארו {p.remainingCredits} נק"ז לסיום
            </span>
          ) : (
            <span className="ds-empty">לא ניתן לחשב התקדמות עדיין.</span>
          )}
          {p.earnedThisSemester != null && p.earnedThisSemester > 0 && (
            <span className="trend">
              <TrendingUp size={11} />
              +{p.earnedThisSemester} הסמסטר
            </span>
          )}
        </div>
      </div>

      {/* ── GPA block (right) ─────────────────────────────────────── */}
      <div className="stat-block">
        <span className="stat-eyebrow">ממוצע נוכחי</span>
        <div className="stat-big" style={{ color: 'var(--lp-accent, #16a34a)' }}>
          {p.currentGPA != null ? p.currentGPA.toFixed(1) : '—'}
        </div>
        {honors ? (
          <span className="gpa-grade">
            <Award size={12} />
            {honors}
            {p.coursesCompletedCount != null && (
              <span style={{ opacity: .7, marginInlineStart: 4 }}>
                · מתוך {p.coursesCompletedCount} קורסים
              </span>
            )}
          </span>
        ) : p.coursesCompletedCount != null && p.coursesCompletedCount > 0 ? (
          <span className="gpa-grade" style={{ background: 'transparent', border: '1px dashed var(--lp-line)' }}>
            מתוך {p.coursesCompletedCount} קורסים
          </span>
        ) : null}
        <div className="stat-foot">
          {p.semesterGPA != null ? (
            <span>סמסטר נוכחי: {p.semesterGPA.toFixed(1)}</span>
          ) : (
            <span className="ds-empty">אין ציוני סמסטר עדיין.</span>
          )}
          {semesterTrend && (
            <span className={`trend ${semesterTrend.positive ? '' : 'negative'}`}>
              <TrendingUp size={11} />
              {semesterTrend.label}
            </span>
          )}
        </div>
        {p.currentGPA == null && (
          <Link href="/credits" className="dp-btn" style={{ marginTop: 8, alignSelf: 'flex-start' }}>
            הוסף ציונים
            <ExternalLink size={13} />
          </Link>
        )}
      </div>
    </section>
  )
}
