'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GraduationCap, Search, Plus, Trash2, Check,
  ChevronRight, ChevronLeft, Target,
  TrendingUp, Award, Sparkles, X, Loader2,
  AlertTriangle, Pencil,
} from 'lucide-react'
import { api } from '@/lib/api-client'
import { useAuth } from '@/lib/auth-context'
import { useDB } from '@/lib/db-context'
import { computeCreditSummary } from '@/lib/catalog'
import Modal from '@/components/ui/Modal'
import ErrorAlert from '@/components/ui/ErrorAlert'
import GradesList from '@/components/credits/GradesList'

// ── Types ──────────────────────────────────────────────────────
type Track = {
  id: string
  name: string
  departments: string[]
  total_credits: number
  type: string
  details: Record<string, any>
}

type CatalogCourse = {
  course_id: string
  name: string
  name_en?: string
  credits: number
  department: string
  year?: number
  semester?: string
  type: string
  tracks: string[]
  prerequisites: string[]
  category?: string
}

type StudentCourse = {
  id: string
  course_id: string
  course_name: string
  credits: number
  status: string
  grade?: number
  semester?: string
  academic_year?: string
  source: string
}

type CreditSummary = {
  total_required: number
  completed_credits: number
  in_progress_credits: number
  remaining: number
  remaining_semesters: number
  recommended_per_semester: number
  average: number | null
  courses_completed: number
  courses_in_progress: number
}

// ══════════════════════════════════════════════════════════════
// Main Page
// ══════════════════════════════════════════════════════════════

export default function CreditsPage() {
  const { user } = useAuth()
  const { db, ready, loading: dbLoading } = useDB()
  const [track, setTrack] = useState<Track | null>(null)
  const [trackLoading, setTrackLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const profile = db.student_profile || null
  const needsOnboarding = ready && !profile
  const university = db.settings?.university

  // Resolve track details from the bundled catalog whenever profile changes.
  useEffect(() => {
    if (!profile?.track_id) { setTrack(null); return }
    let cancelled = false
    setTrackLoading(true)
    api.catalog.track(profile.track_id, university)
      .then((res: any) => { if (!cancelled) setTrack(res.track as Track) })
      .catch((err: any) => { if (!cancelled) setError(err?.message || 'שגיאה בטעינת המסלול') })
      .finally(() => { if (!cancelled) setTrackLoading(false) })
    return () => { cancelled = true }
  }, [profile?.track_id, university])

  if (!ready || dbLoading || trackLoading) {
    return (
      <div className="cream-page credits-v2">
        <div className="credits-v2-main animate-fade-in" dir="rtl">
          <div className="credits-v2-skeleton">
            <div className="shimmer h-8 w-48 rounded-lg" />
            <div className="shimmer h-4 w-64 rounded-lg" />
          </div>
          <div className="credits-v2-stat-grid">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="shimmer h-24 rounded-2xl" />
            ))}
          </div>
          <div className="shimmer h-48 rounded-2xl" />
          <div className="shimmer h-64 rounded-2xl" />
        </div>
      </div>
    )
  }

  if (needsOnboarding) {
    return (
      <div dir="rtl">
        {error && (
          <div className="cream-page credits-v2">
            <div className="credits-v2-wizard-error">
              <ErrorAlert message={error} onDismiss={() => setError(null)} />
            </div>
          </div>
        )}
        <OnboardingWizard onComplete={() => setError(null)} />
      </div>
    )
  }

  return <CreditsDashboard profile={profile} track={track} />
}

// ══════════════════════════════════════════════════════════════
// Onboarding Wizard
// ══════════════════════════════════════════════════════════════

function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const { db, setStudentProfile, upsertStudentCoursesBulk } = useDB()
  const university = db.settings?.university
  const [step, setStep] = useState(1)
  const [tracks, setTracks] = useState<Track[]>([])
  const [tracksLoading, setTracksLoading] = useState(true)
  const [tracksError, setTracksError] = useState<string | null>(null)
  const [selectedTrack, setSelectedTrack] = useState<string>('')
  const [startYear, setStartYear] = useState(new Date().getFullYear())
  const [currentYear, setCurrentYear] = useState(1)
  const [saving, setSaving] = useState(false)

  const loadTracks = useCallback(async () => {
    setTracksLoading(true)
    setTracksError(null)
    try {
      // 15s timeout so we don't hang forever when Render backend is asleep
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('השרת לא הגיב (ייתכן שהוא בהפעלה מחדש). נסה שוב בעוד רגע.')), 15000)
      )
      const result = await Promise.race([api.catalog.tracks(university), timeout])
      setTracks(result as Track[])
    } catch (err: any) {
      setTracksError(err?.message || 'לא הצלחנו לטעון את רשימת המסלולים')
    } finally {
      setTracksLoading(false)
    }
  }, [university])

  useEffect(() => { loadTracks() }, [loadTracks])

  const handleSave = async () => {
    if (!selectedTrack) return
    setSaving(true)
    try {
      const t = tracks.find(t => t.id === selectedTrack)
      const totalSemesters = t?.type === 'dual' ? 6 : 6

      // Save profile to Drive DB
      await setStudentProfile({
        track_id: selectedTrack,
        start_year: startYear,
        current_year: currentYear,
        expected_end: startYear + Math.ceil(totalSemesters / 2),
      })

      // Auto-add mandatory courses for the track
      try {
        const trackData = await api.catalog.track(selectedTrack, university)
        const mandatory = (trackData.courses || []).filter((c: CatalogCourse) => c.type === 'mandatory')
        if (mandatory.length > 0) {
          await upsertStudentCoursesBulk(
            mandatory.map((c: CatalogCourse) => ({
              course_id: c.course_id,
              course_name: c.name,
              credits: c.credits,
              status: 'planned' as const,
              source: 'catalog' as const,
            }))
          )
        }
      } catch {}

      onComplete()
    } catch (err: any) {
      alert(err.message || 'שמירה נכשלה')
    } finally {
      setSaving(false)
    }
  }

  const dualTracks = tracks.filter(t => t.type === 'dual')
  const singleTracks = tracks.filter(t => t.type === 'single')
  const currentYearOptions = new Date().getFullYear()

  return (
    <div className="cream-page credits-v2">
      <div className="credits-v2-wizard" dir="rtl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <section className="credits-v2-card credits-v2-wizard-card">
          <div className="credits-v2-wizard-body">
            {/* Header */}
            <div className="credits-v2-wizard-head">
              <div className="credits-v2-wizard-icon">
                <GraduationCap size={32} />
              </div>
              <h1 className="credits-v2-wizard-title">
                בוא נתחיל!
              </h1>
              <p className="credits-v2-wizard-sub">
                ספר לנו מה אתה לומד כדי שנחשב את הנק"ז שלך
              </p>
            </div>

            {/* Step indicator */}
            <div className="credits-v2-steps">
              {[1, 2].map(s => (
                <div
                  key={s}
                  className={`credits-v2-step${s === step ? ' active' : ''}${s < step ? ' done' : ''}`}
                />
              ))}
            </div>

            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                >
                  <h2 className="credits-v2-wizard-h2">
                    מה אתה לומד?
                  </h2>

                  {dualTracks.length > 0 && (
                    <>
                      <p className="credits-v2-wizard-label">תוכניות דו-מחלקתיות (שילובים)</p>
                      <div className="credits-v2-track-list">
                        {dualTracks.map(t => (
                          <button
                            key={t.id}
                            onClick={() => setSelectedTrack(t.id)}
                            className={`credits-v2-track${selectedTrack === t.id ? ' active' : ''}`}
                          >
                            <div className="credits-v2-track-name">{t.name}</div>
                            <div className="credits-v2-track-meta">
                              {t.total_credits} נק"ז | {t.type === 'dual' ? 'דו-מחלקתי' : 'חד-מחלקתי'}
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {singleTracks.length > 0 && (
                    <>
                      <p className="credits-v2-wizard-label">מסלולים חד-מחלקתיים</p>
                      <div className="credits-v2-track-list">
                        {singleTracks.map(t => (
                          <button
                            key={t.id}
                            onClick={() => setSelectedTrack(t.id)}
                            className={`credits-v2-track${selectedTrack === t.id ? ' active' : ''}`}
                          >
                            <div className="credits-v2-track-name">{t.name}</div>
                            <div className="credits-v2-track-meta">
                              {t.total_credits} נק"ז
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {tracksLoading && tracks.length === 0 && !tracksError && (
                    <div className="credits-v2-loading">
                      <Loader2 size={24} className="spin" />
                      <p>טוען מסלולים...</p>
                      <small>
                        השרת האחורי עלול להיות ישן (Render free-tier) — זה עלול לקחת עד 30 שניות בפעם הראשונה
                      </small>
                    </div>
                  )}

                  {tracksError && (
                    <div className="credits-v2-error">
                      <AlertTriangle size={20} />
                      <div className="credits-v2-error-body">
                        <p className="title">
                          לא הצלחנו לטעון את המסלולים
                        </p>
                        <p className="msg">{tracksError}</p>
                        <button
                          onClick={loadTracks}
                          className="credits-v2-error-btn"
                        >
                          נסה שוב
                        </button>
                      </div>
                    </div>
                  )}

                  {!tracksLoading && !tracksError && tracks.length === 0 && (
                    <div className="credits-v2-empty">
                      אין מסלולים זמינים כרגע
                    </div>
                  )}

                  <button
                    disabled={!selectedTrack}
                    onClick={() => setStep(2)}
                    className="credits-v2-btn primary full"
                  >
                    המשך
                    <ChevronLeft size={16} />
                  </button>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                >
                  <h2 className="credits-v2-wizard-h2">
                    פרטים נוספים
                  </h2>

                  <div className="credits-v2-fields">
                    <div className="credits-v2-field">
                      <label>שנת התחלה</label>
                      <select
                        value={startYear}
                        onChange={e => setStartYear(Number(e.target.value))}
                        className="credits-v2-select"
                      >
                        {Array.from({ length: 8 }, (_, i) => currentYearOptions - i).map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>

                    <div className="credits-v2-field">
                      <label>באיזה שנה אתה עכשיו?</label>
                      <div className="credits-v2-year-grid">
                        {[1, 2, 3, 4].map(y => (
                          <button
                            key={y}
                            onClick={() => setCurrentYear(y)}
                            className={`credits-v2-year-btn${currentYear === y ? ' active' : ''}`}
                          >
                            שנה {y === 1 ? "א'" : y === 2 ? "ב'" : y === 3 ? "ג'" : "ד'"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="credits-v2-wizard-actions">
                    <button
                      onClick={() => setStep(1)}
                      className="credits-v2-btn"
                    >
                      <ChevronRight size={16} />
                      חזרה
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="credits-v2-btn primary grow"
                    >
                      {saving ? <Loader2 size={18} className="spin" /> : 'סיימתי — הציגו לי את הקורסים'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </motion.div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Credits Dashboard (after onboarding)
// ══════════════════════════════════════════════════════════════

function CreditsDashboard({ profile, track }: { profile: any; track: Track | null }) {
  const { db, setStudentProfile, upsertStudentCourse, removeStudentCourse } = useDB()
  const university = db.settings?.university
  // Memoize the array read so downstream useEffect/useMemo deps don't
  // refire every render (`?? []` returns a fresh array each call).
  const myCourses = useMemo(() => (db.student_courses || []) as StudentCourse[], [db.student_courses])
  const [credits, setCredits] = useState<CreditSummary | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<CatalogCourse[]>([])
  const [searching, setSearching] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Edit Profile modal state ────────────────────────────────
  const [editOpen, setEditOpen] = useState(false)
  const [editTracks, setEditTracks] = useState<Track[]>([])
  const [editTrackId, setEditTrackId] = useState(profile?.track_id ?? '')
  const [editStartYear, setEditStartYear] = useState<number>(profile?.start_year ?? new Date().getFullYear())
  const [editCurrentYear, setEditCurrentYear] = useState<number>(profile?.current_year ?? 1)
  const [editSaving, setEditSaving] = useState(false)

  // Recompute credit summary whenever profile, track or courses change
  useEffect(() => {
    if (!profile?.track_id) { setCredits(null); return }
    let cancelled = false
    computeCreditSummary(profile.track_id, myCourses as any, profile.current_year, university)
      .then(res => { if (!cancelled) setCredits(res as CreditSummary) })
      .catch(err => { if (!cancelled) setError(err?.message || 'שגיאה בחישוב נק"ז') })
    return () => { cancelled = true }
  }, [profile?.track_id, profile?.current_year, myCourses, university])

  // Open the edit-profile modal: fetch tracks and pre-fill values
  const openEditProfile = async () => {
    setEditTrackId(profile?.track_id ?? '')
    setEditStartYear(profile?.start_year ?? new Date().getFullYear())
    setEditCurrentYear(profile?.current_year ?? 1)
    setEditOpen(true)
    if (editTracks.length === 0) {
      try {
        const t = await api.catalog.tracks(university)
        setEditTracks(t)
      } catch { /* ignore */ }
    }
  }

  const saveEditProfile = async () => {
    if (!editTrackId) return
    setEditSaving(true)
    try {
      const t = editTracks.find(t => t.id === editTrackId)
      const totalSemesters = t?.type === 'dual' ? 6 : 6
      await setStudentProfile({
        track_id: editTrackId,
        start_year: editStartYear,
        current_year: editCurrentYear,
        expected_end: editStartYear + Math.ceil(totalSemesters / 2),
      })
      setEditOpen(false)
      // Reload to pick up the new track/profile
      window.location.reload()
    } catch (err: any) {
      alert(err.message || 'שמירה נכשלה')
    } finally {
      setEditSaving(false)
    }
  }

  const handleSearch = async (q: string) => {
    setSearchQuery(q)
    if (q.length < 2) { setSearchResults([]); return }
    setSearching(true)
    try {
      const results = await api.catalog.searchCourses(q, undefined, undefined, university)
      setSearchResults(results)
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  const addCourse = async (course: CatalogCourse, status: 'completed' | 'in_progress' | 'planned' = 'completed') => {
    try {
      await upsertStudentCourse({
        course_id: course.course_id,
        course_name: course.name,
        credits: course.credits,
        status,
        source: 'catalog',
      })
    } catch (err: any) {
      setError(err?.message || 'שגיאה בהוספת הקורס')
    }
  }

  const removeCourse = async (courseId: string) => {
    try {
      await removeStudentCourse(courseId)
    } catch (err: any) {
      setError(err?.message || 'שגיאה בהסרת הקורס')
    }
  }

  const toggleStatus = async (course: StudentCourse) => {
    const nextStatus: 'completed' | 'in_progress' | 'planned' = course.status === 'completed'
      ? 'planned'
      : course.status === 'planned'
        ? 'in_progress'
        : 'completed'
    const src: 'manual' | 'catalog' | 'moodle' =
      course.source === 'catalog' || course.source === 'moodle' ? course.source as any : 'manual'
    try {
      await upsertStudentCourse({
        course_id: course.course_id,
        course_name: course.course_name,
        credits: course.credits,
        status: nextStatus,
        source: src,
      })
    } catch (err: any) {
      setError(err?.message || 'שגיאה בעדכון סטטוס הקורס')
    }
  }

  const completedCredits = credits?.completed_credits ?? 0
  const totalRequired = credits?.total_required ?? (track?.total_credits ?? 0)
  const progressPercent = totalRequired > 0 ? Math.min(100, (completedCredits / totalRequired) * 100) : 0

  // ── Off-Track Warning calculation ────────────────────────────
  const currentAcademicYear: number = profile?.current_year ?? 1
  const recommendedPerSemester = credits?.recommended_per_semester ?? 0
  const recommendedPerYear = recommendedPerSemester * 2
  const expectedCredits = currentAcademicYear * recommendedPerYear
  const isBehind = expectedCredits > 0 && completedCredits < expectedCredits * 0.8
  const creditsBehind = Math.max(0, Math.round(expectedCredits - completedCredits))

  // ── Semester Progress Breakdown ──────────────────────────────
  const semesterBreakdown = useMemo(() => {
    const map = new Map<string, { completed: number; inProgress: number; planned: number }>()
    for (const c of myCourses) {
      const semKey = c.semester && c.academic_year
        ? `${c.academic_year} ${c.semester}`
        : c.semester || 'ללא סמסטר'
      if (!map.has(semKey)) map.set(semKey, { completed: 0, inProgress: 0, planned: 0 })
      const entry = map.get(semKey)!
      if (c.status === 'completed') entry.completed += c.credits
      else if (c.status === 'in_progress') entry.inProgress += c.credits
      else entry.planned += c.credits
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([semester, data]) => ({ semester, ...data }))
  }, [myCourses])

  const editYearOptions = new Date().getFullYear()

  return (
    <div className="cream-page credits-v2">
      <div className="credits-v2-main animate-fade-in" dir="rtl">
      {/* Header + Edit Profile */}
      <div className="credits-v2-page-head">
        <div className="credits-v2-page-head-info">
          <h1 className="credits-v2-h1">
            מעקב נק&quot;ז
          </h1>
          <div className="credits-v2-page-head-sub">
            <p>{track?.name || 'מסלול לא מוגדר'}</p>
            <button
              onClick={openEditProfile}
              className="credits-v2-edit-profile"
            >
              <Pencil size={12} />
              עריכת פרופיל
            </button>
          </div>
        </div>
        <button
          onClick={() => setShowSearch(!showSearch)}
          className="credits-v2-btn primary"
        >
          <Plus size={16} />
          הוסף קורס
        </button>
      </div>

      {/* Error Alert */}
      <ErrorAlert message={error} onDismiss={() => setError(null)} />

      {/* Credit Stats */}
      <div className="credits-v2-stat-grid">
        <StatCard
          icon={<Target size={18} />}
          label="הושלמו"
          value={`${completedCredits}`}
          sub={`מתוך ${totalRequired} נק"ז`}
          color="emerald"
        />
        <StatCard
          icon={<TrendingUp size={18} />}
          label="נותרו"
          value={`${credits?.remaining ?? 0}`}
          sub={'נק"ז להשלמה'}
          color="amber"
        />
        <StatCard
          icon={<Award size={18} />}
          label="ממוצע"
          value={credits?.average ? `${credits.average}` : '--'}
          sub="ממוצע משוקלל"
          color="indigo"
        />
        <StatCard
          icon={<Sparkles size={18} />}
          label="מומלץ"
          value={`${credits?.recommended_per_semester ?? 0}`}
          sub={'נק"ז לסמסטר'}
          color="violet"
        />
      </div>

      {/* Grades list with source badges + manual entry (task #17) */}
      <GradesList />

      {/* Off-Track Warning */}
      <AnimatePresence>
        {isBehind && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="credits-v2-warn"
          >
            <AlertTriangle size={20} />
            <div className="credits-v2-warn-body">
              <p className="title">
                שים לב! אתה מאחורי הקצב המומלץ
              </p>
              <p className="msg">
                לפי שנה {currentAcademicYear} היית אמור להשלים כ-{expectedCredits} נק&quot;ז,
                אבל השלמת {completedCredits} בלבד. אתה מאחור ב-{creditsBehind} נק&quot;ז.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress Bar */}
      <section className="credits-v2-card credits-v2-progress">
        <div className="credits-v2-progress-head">
          <span>התקדמות לתואר</span>
          <span className="credits-v2-progress-pct">{progressPercent.toFixed(0)}%</span>
        </div>
        <div className="credits-v2-progress-bar">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="credits-v2-progress-fill"
          />
        </div>
        <div className="credits-v2-progress-foot">
          <span>{completedCredits} נק&quot;ז</span>
          <span>{totalRequired} נק&quot;ז</span>
        </div>
      </section>

      {/* Semester Progress Breakdown */}
      {semesterBreakdown.length > 0 && (
        <section className="credits-v2-card credits-v2-semesters">
          <h2 className="credits-v2-card-title">פירוט לפי סמסטר</h2>
          <div className="credits-v2-semester-list">
            {semesterBreakdown.map(sem => {
              const total = sem.completed + sem.inProgress + sem.planned
              const completedPct = total > 0 ? (sem.completed / total) * 100 : 0
              const inProgressPct = total > 0 ? (sem.inProgress / total) * 100 : 0
              return (
                <div key={sem.semester} className="credits-v2-semester">
                  <div className="credits-v2-semester-head">
                    <span className="credits-v2-semester-name">{sem.semester}</span>
                    <div className="credits-v2-semester-tags">
                      {sem.completed > 0 && (
                        <span className="tag emerald">{sem.completed} הושלמו</span>
                      )}
                      {sem.inProgress > 0 && (
                        <span className="tag indigo">{sem.inProgress} בתהליך</span>
                      )}
                      {sem.planned > 0 && (
                        <span className="tag muted">{sem.planned} מתוכנן</span>
                      )}
                    </div>
                  </div>
                  <div className="credits-v2-semester-bar">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${completedPct}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className="credits-v2-semester-fill emerald"
                    />
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${inProgressPct}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
                      className="credits-v2-semester-fill indigo"
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Course Search */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="credits-v2-card credits-v2-search"
          >
            <div className="credits-v2-search-head">
              <Search size={18} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                placeholder="חפש קורס לפי שם או מספר..."
                className="credits-v2-search-input"
                autoFocus
              />
              <button
                onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]) }}
                aria-label="סגור חיפוש"
                className="credits-v2-search-close"
              >
                <X size={18} />
              </button>
            </div>
            {searching && (
              <div className="credits-v2-search-loading">
                <Loader2 size={18} className="spin" />
              </div>
            )}
            {searchResults.length > 0 && (
              <div className="credits-v2-search-results">
                {searchResults.map(c => {
                  const alreadyAdded = myCourses.some(mc => mc.course_id === c.course_id)
                  return (
                    <div key={c.course_id} className="credits-v2-search-result">
                      <div className="credits-v2-search-result-info">
                        <div className="name">{c.name}</div>
                        <div className="meta">
                          {c.course_id} | {c.credits} נק&quot;ז
                          {c.type === 'mandatory' && <span className="tag">חובה</span>}
                        </div>
                      </div>
                      {alreadyAdded ? (
                        <Check size={18} className="credits-v2-search-added" />
                      ) : (
                        <button
                          onClick={() => addCourse(c)}
                          aria-label="הוסף קורס"
                          className="credits-v2-search-add"
                        >
                          <Plus size={16} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {searchQuery.length >= 2 && searchResults.length === 0 && !searching && (
              <p className="credits-v2-search-empty">לא נמצאו קורסים</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* My Courses — with color-coded status badges */}
      <section className="credits-v2-card credits-v2-courses">
        <h2 className="credits-v2-card-title">הקורסים שלי</h2>
        {myCourses.length === 0 ? (
          <p className="credits-v2-courses-empty">
            עדיין לא נוספו קורסים. לחץ &quot;הוסף קורס&quot; למעלה
          </p>
        ) : (
          <div className="credits-v2-course-list">
            {myCourses.map(c => (
              <div key={c.id} className="credits-v2-course">
                <button
                  onClick={() => toggleStatus(c)}
                  aria-label={`שנה סטטוס ל${c.course_name}`}
                  className={`credits-v2-course-check status-${c.status}`}
                >
                  {c.status === 'completed' && <Check size={14} />}
                  {c.status === 'in_progress' && <span className="dot" />}
                </button>
                <div className="credits-v2-course-info">
                  <div className={`name${c.status === 'completed' ? ' done' : ''}`}>
                    {c.course_name}
                  </div>
                  <div className="meta">
                    {c.credits} נק&quot;ז
                    {c.grade && <span className="grade">ציון: {c.grade}</span>}
                  </div>
                </div>
                <motion.button
                  onClick={() => toggleStatus(c)}
                  layout
                  whileTap={{ scale: 0.92 }}
                  className={`credits-v2-course-badge status-${c.status}`}
                >
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={c.status}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                    >
                      {c.status === 'completed' ? 'הושלם' : c.status === 'in_progress' ? 'בתהליך' : 'מתוכנן'}
                    </motion.span>
                  </AnimatePresence>
                </motion.button>
                <button
                  onClick={() => removeCourse(c.course_id)}
                  aria-label="הסר קורס"
                  className="credits-v2-course-remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Edit Profile Modal ──────────────────────────────────── */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="עריכת פרופיל"
        subtitle="עדכן את המסלול ושנת הלימודים"
        size="md"
        footer={
          <div className="credits-v2-modal-actions">
            <button
              onClick={() => setEditOpen(false)}
              className="credits-v2-btn"
            >
              ביטול
            </button>
            <button
              onClick={saveEditProfile}
              disabled={editSaving || !editTrackId}
              className="credits-v2-btn primary"
            >
              {editSaving ? <Loader2 size={16} className="spin" /> : 'שמור'}
            </button>
          </div>
        }
      >
        <div className="credits-v2-modal-body" dir="rtl">
          {/* Track selection */}
          <div className="credits-v2-field">
            <label>מסלול לימודים</label>
            {editTracks.length === 0 ? (
              <div className="credits-v2-modal-loading">
                <Loader2 size={18} className="spin" />
              </div>
            ) : (
              <div className="credits-v2-modal-tracks">
                {editTracks.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setEditTrackId(t.id)}
                    className={`credits-v2-track${editTrackId === t.id ? ' active' : ''}`}
                  >
                    <span className="credits-v2-track-name">{t.name}</span>
                    <span className="credits-v2-track-meta">{t.total_credits} נק&quot;ז</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Start year */}
          <div className="credits-v2-field">
            <label>שנת התחלה</label>
            <select
              value={editStartYear}
              onChange={e => setEditStartYear(Number(e.target.value))}
              className="credits-v2-select"
            >
              {Array.from({ length: 8 }, (_, i) => editYearOptions - i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Current year */}
          <div className="credits-v2-field">
            <label>באיזה שנה אתה עכשיו?</label>
            <div className="credits-v2-year-grid">
              {[1, 2, 3, 4].map(y => (
                <button
                  key={y}
                  onClick={() => setEditCurrentYear(y)}
                  className={`credits-v2-year-btn${editCurrentYear === y ? ' active' : ''}`}
                >
                  שנה {y === 1 ? "א'" : y === 2 ? "ב'" : y === 3 ? "ג'" : "ד'"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>
      </div>
    </div>
  )
}

// ── Helper Components ──────────────────────────────────────────

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub: string; color: 'emerald' | 'amber' | 'indigo' | 'violet'
}) {
  return (
    <section className={`credits-v2-stat tone-${color}`}>
      <div className="credits-v2-stat-icon">
        {icon}
      </div>
      <div className="credits-v2-stat-value">{value}</div>
      <div className="credits-v2-stat-label">{label}</div>
      <div className="credits-v2-stat-sub">{sub}</div>
    </section>
  )
}
