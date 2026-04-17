'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GraduationCap, Search, Plus, Trash2, Check,
  ChevronRight, ChevronLeft, BookOpen, Target,
  TrendingUp, Award, Sparkles, X, Loader2,
  AlertTriangle, Pencil,
} from 'lucide-react'
import { api } from '@/lib/api-client'
import { useAuth } from '@/lib/auth-context'
import { useDB } from '@/lib/db-context'
import { computeCreditSummary } from '@/lib/bgu-catalog'
import GlowCard from '@/components/ui/GlowCard'
import Modal from '@/components/ui/Modal'
import ErrorAlert from '@/components/ui/ErrorAlert'

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

  // Resolve track details from the bundled catalog whenever profile changes.
  useEffect(() => {
    if (!profile?.track_id) { setTrack(null); return }
    let cancelled = false
    setTrackLoading(true)
    api.catalog.track(profile.track_id)
      .then((res: any) => { if (!cancelled) setTrack(res.track as Track) })
      .catch((err: any) => { if (!cancelled) setError(err?.message || 'שגיאה בטעינת המסלול') })
      .finally(() => { if (!cancelled) setTrackLoading(false) })
    return () => { cancelled = true }
  }, [profile?.track_id])

  if (!ready || dbLoading || trackLoading) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-in" dir="rtl">
        <div className="h-8 w-48 shimmer rounded-lg" />
        <div className="h-4 w-64 shimmer rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 shimmer rounded-2xl" />
          ))}
        </div>
        <div className="h-48 shimmer rounded-2xl" />
        <div className="h-64 shimmer rounded-2xl" />
      </div>
    )
  }

  if (needsOnboarding) {
    return (
      <div dir="rtl">
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <ErrorAlert message={error} onDismiss={() => setError(null)} />
        </div>
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
  const { setStudentProfile, upsertStudentCoursesBulk } = useDB()
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
      const result = await Promise.race([api.catalog.tracks(), timeout])
      setTracks(result as Track[])
    } catch (err: any) {
      setTracksError(err?.message || 'לא הצלחנו לטעון את רשימת המסלולים')
    } finally {
      setTracksLoading(false)
    }
  }, [])

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
        const trackData = await api.catalog.track(selectedTrack)
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
    <div className="max-w-2xl mx-auto py-8 px-4" dir="rtl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <GlowCard>
          <div className="p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mb-4">
                <GraduationCap className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-slate-100 mb-2">
                בוא נתחיל!
              </h1>
              <p className="text-slate-400">
                ספר לנו מה אתה לומד כדי שנחשב את הנק"ז שלך
              </p>
            </div>

            {/* Step indicator */}
            <div className="flex items-center justify-center gap-2 mb-8">
              {[1, 2].map(s => (
                <div
                  key={s}
                  className={`w-3 h-3 rounded-full transition-all ${
                    s === step ? 'bg-indigo-500 w-8' : s < step ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
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
                  <h2 className="text-lg font-semibold text-slate-200 mb-4">
                    מה אתה לומד?
                  </h2>

                  {dualTracks.length > 0 && (
                    <>
                      <p className="text-sm text-slate-400 mb-3">תוכניות דו-מחלקתיות (שילובים)</p>
                      <div className="space-y-2 mb-6">
                        {dualTracks.map(t => (
                          <button
                            key={t.id}
                            onClick={() => setSelectedTrack(t.id)}
                            className={`w-full text-right p-4 rounded-xl border transition-all ${
                              selectedTrack === t.id
                                ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                                : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'
                            }`}
                          >
                            <div className="font-medium">{t.name}</div>
                            <div className="text-sm text-slate-500 mt-1">
                              {t.total_credits} נק"ז | {t.type === 'dual' ? 'דו-מחלקתי' : 'חד-מחלקתי'}
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {singleTracks.length > 0 && (
                    <>
                      <p className="text-sm text-slate-400 mb-3">מסלולים חד-מחלקתיים</p>
                      <div className="space-y-2 mb-6">
                        {singleTracks.map(t => (
                          <button
                            key={t.id}
                            onClick={() => setSelectedTrack(t.id)}
                            className={`w-full text-right p-4 rounded-xl border transition-all ${
                              selectedTrack === t.id
                                ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                                : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'
                            }`}
                          >
                            <div className="font-medium">{t.name}</div>
                            <div className="text-sm text-slate-500 mt-1">
                              {t.total_credits} נק"ז
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {tracksLoading && tracks.length === 0 && !tracksError && (
                    <div className="text-center py-8 text-slate-500">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                      טוען מסלולים...
                      <p className="text-xs text-slate-600 mt-2">
                        השרת האחורי עלול להיות ישן (Render free-tier) — זה עלול לקחת עד 30 שניות בפעם הראשונה
                      </p>
                    </div>
                  )}

                  {tracksError && (
                    <div
                      className="rounded-xl p-4 mb-4 flex items-start gap-3"
                      style={{
                        background: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.25)',
                      }}
                    >
                      <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-red-300 mb-1">
                          לא הצלחנו לטעון את המסלולים
                        </p>
                        <p className="text-xs text-red-400/80 mb-3">{tracksError}</p>
                        <button
                          onClick={loadTracks}
                          className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors"
                        >
                          נסה שוב
                        </button>
                      </div>
                    </div>
                  )}

                  {!tracksLoading && !tracksError && tracks.length === 0 && (
                    <div className="text-center py-8 text-slate-500 text-sm">
                      אין מסלולים זמינים כרגע
                    </div>
                  )}

                  <button
                    disabled={!selectedTrack}
                    onClick={() => setStep(2)}
                    className="w-full mt-4 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold disabled:opacity-40 hover:shadow-lg hover:shadow-indigo-500/25 transition-all"
                  >
                    המשך
                    <ChevronLeft className="inline w-4 h-4 mr-1" />
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
                  <h2 className="text-lg font-semibold text-slate-200 mb-4">
                    פרטים נוספים
                  </h2>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">שנת התחלה</label>
                      <select
                        value={startYear}
                        onChange={e => setStartYear(Number(e.target.value))}
                        style={{ colorScheme: 'dark' }}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-slate-200 focus:border-indigo-500 focus:outline-none"
                      >
                        {Array.from({ length: 8 }, (_, i) => currentYearOptions - i).map(y => (
                          <option key={y} value={y} className="bg-slate-900 text-slate-100">{y}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm text-slate-400 mb-1">באיזה שנה אתה עכשיו?</label>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4].map(y => (
                          <button
                            key={y}
                            onClick={() => setCurrentYear(y)}
                            className={`flex-1 py-3 rounded-xl border font-medium transition-all ${
                              currentYear === y
                                ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                                : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20'
                            }`}
                          >
                            שנה {y === 1 ? "א'" : y === 2 ? "ב'" : y === 3 ? "ג'" : "ד'"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 mt-8">
                    <button
                      onClick={() => setStep(1)}
                      className="flex-1 py-3 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 transition-all"
                    >
                      <ChevronRight className="inline w-4 h-4 ml-1" />
                      חזרה
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold disabled:opacity-60 hover:shadow-lg hover:shadow-indigo-500/25 transition-all"
                    >
                      {saving ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'סיימתי — הציגו לי את הקורסים'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </GlowCard>
      </motion.div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Credits Dashboard (after onboarding)
// ══════════════════════════════════════════════════════════════

function CreditsDashboard({ profile, track }: { profile: any; track: Track | null }) {
  const { db, setStudentProfile, upsertStudentCourse, removeStudentCourse } = useDB()
  const myCourses = (db.student_courses || []) as StudentCourse[]
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
    computeCreditSummary(profile.track_id, myCourses as any, profile.current_year)
      .then(res => { if (!cancelled) setCredits(res as CreditSummary) })
      .catch(err => { if (!cancelled) setError(err?.message || 'שגיאה בחישוב נק"ז') })
    return () => { cancelled = true }
  }, [profile?.track_id, profile?.current_year, myCourses])

  // Open the edit-profile modal: fetch tracks and pre-fill values
  const openEditProfile = async () => {
    setEditTrackId(profile?.track_id ?? '')
    setEditStartYear(profile?.start_year ?? new Date().getFullYear())
    setEditCurrentYear(profile?.current_year ?? 1)
    setEditOpen(true)
    if (editTracks.length === 0) {
      try {
        const t = await api.catalog.tracks()
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
      const results = await api.catalog.searchCourses(q)
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
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-in" dir="rtl">
      {/* Header + Edit Profile */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">
              מעקב נק&quot;ז
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-sm text-slate-400">
                {track?.name || 'מסלול לא מוגדר'}
              </p>
              <button
                onClick={openEditProfile}
                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                <Pencil className="w-3 h-3" />
                עריכת פרופיל
              </button>
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowSearch(!showSearch)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition-all"
        >
          <Plus className="w-4 h-4" />
          הוסף קורס
        </button>
      </div>

      {/* Error Alert */}
      <ErrorAlert message={error} onDismiss={() => setError(null)} />

      {/* Credit Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Target className="w-5 h-5" />}
          label="הושלמו"
          value={`${completedCredits}`}
          sub={`מתוך ${totalRequired} נק"ז`}
          color="emerald"
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="נותרו"
          value={`${credits?.remaining ?? 0}`}
          sub={'נק"ז להשלמה'}
          color="amber"
        />
        <StatCard
          icon={<Award className="w-5 h-5" />}
          label="ממוצע"
          value={credits?.average ? `${credits.average}` : '--'}
          sub="ממוצע משוקלל"
          color="indigo"
        />
        <StatCard
          icon={<Sparkles className="w-5 h-5" />}
          label="מומלץ"
          value={`${credits?.recommended_per_semester ?? 0}`}
          sub={'נק"ז לסמסטר'}
          color="violet"
        />
      </div>

      {/* Off-Track Warning */}
      <AnimatePresence>
        {isBehind && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-xl p-4 flex items-start gap-3"
            style={{
              background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.2)',
            }}
          >
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-300">
                שים לב! אתה מאחורי הקצב המומלץ
              </p>
              <p className="text-xs text-amber-400/80 mt-1">
                לפי שנה {currentAcademicYear} היית אמור להשלים כ-{expectedCredits} נק&quot;ז,
                אבל השלמת {completedCredits} בלבד. אתה מאחור ב-{creditsBehind} נק&quot;ז.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress Bar */}
      <GlowCard>
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-400">התקדמות לתואר</span>
            <span className="text-sm font-medium text-indigo-400">{progressPercent.toFixed(0)}%</span>
          </div>
          <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
            />
          </div>
          <div className="flex justify-between mt-1 text-xs text-slate-500">
            <span>{completedCredits} נק&quot;ז</span>
            <span>{totalRequired} נק&quot;ז</span>
          </div>
        </div>
      </GlowCard>

      {/* Semester Progress Breakdown */}
      {semesterBreakdown.length > 0 && (
        <GlowCard>
          <div className="p-4">
            <h2 className="text-lg font-semibold text-slate-200 mb-4">פירוט לפי סמסטר</h2>
            <div className="space-y-3">
              {semesterBreakdown.map(sem => {
                const total = sem.completed + sem.inProgress + sem.planned
                const completedPct = total > 0 ? (sem.completed / total) * 100 : 0
                const inProgressPct = total > 0 ? (sem.inProgress / total) * 100 : 0
                return (
                  <div key={sem.semester} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-300 font-medium">{sem.semester}</span>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        {sem.completed > 0 && (
                          <span className="text-emerald-400">{sem.completed} הושלמו</span>
                        )}
                        {sem.inProgress > 0 && (
                          <span className="text-indigo-400">{sem.inProgress} בתהליך</span>
                        )}
                        {sem.planned > 0 && (
                          <span className="text-slate-400">{sem.planned} מתוכנן</span>
                        )}
                      </div>
                    </div>
                    <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden flex">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${completedPct}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                        className="h-full bg-emerald-500 rounded-r-full"
                      />
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${inProgressPct}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
                        className="h-full bg-indigo-500"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </GlowCard>
      )}

      {/* Course Search */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="glass rounded-xl p-4 overflow-hidden"
          >
            <div className="flex items-center gap-2 mb-3">
              <Search className="w-5 h-5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                placeholder="חפש קורס לפי שם או מספר..."
                className="input-dark flex-1 text-sm"
                autoFocus
              />
              <button onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]) }}>
                <X className="w-5 h-5 text-slate-500 hover:text-slate-300" />
              </button>
            </div>
            {searching && <Loader2 className="w-5 h-5 animate-spin text-indigo-400 mx-auto" />}
            {searchResults.length > 0 && (
              <div className="max-h-60 overflow-y-auto space-y-1">
                {searchResults.map(c => {
                  const alreadyAdded = myCourses.some(mc => mc.course_id === c.course_id)
                  return (
                    <div
                      key={c.course_id}
                      className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/8 transition-all"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-200 truncate">{c.name}</div>
                        <div className="text-xs text-slate-500">
                          {c.course_id} | {c.credits} נק&quot;ז
                          {c.type === 'mandatory' && <span className="text-indigo-400 mr-2">חובה</span>}
                        </div>
                      </div>
                      {alreadyAdded ? (
                        <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <button
                          onClick={() => addCourse(c)}
                          className="flex-shrink-0 p-1.5 rounded-lg bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/40 transition-all"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {searchQuery.length >= 2 && searchResults.length === 0 && !searching && (
              <p className="text-center text-sm text-slate-500 py-4">לא נמצאו קורסים</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* My Courses — with color-coded status badges */}
      <GlowCard>
        <div className="p-4">
          <h2 className="text-lg font-semibold text-slate-200 mb-4">הקורסים שלי</h2>
          {myCourses.length === 0 ? (
            <p className="text-center text-slate-500 py-8">
              עדיין לא נוספו קורסים. לחץ &quot;הוסף קורס&quot; למעלה
            </p>
          ) : (
            <div className="space-y-1">
              {myCourses.map(c => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-all group"
                >
                  <button
                    onClick={() => toggleStatus(c)}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      c.status === 'completed'
                        ? 'bg-emerald-500 border-emerald-500'
                        : c.status === 'in_progress'
                        ? 'bg-amber-500/20 border-amber-500'
                        : 'border-slate-600 hover:border-slate-400'
                    }`}
                  >
                    {c.status === 'completed' && <Check className="w-3.5 h-3.5 text-white" />}
                    {c.status === 'in_progress' && <div className="w-2 h-2 rounded-full bg-amber-400" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm truncate ${
                      c.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-200'
                    }`}>
                      {c.course_name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {c.credits} נק&quot;ז
                      {c.grade && <span className="text-emerald-400 mr-2">ציון: {c.grade}</span>}
                    </div>
                  </div>
                  {/* Color-coded status badge */}
                  <motion.button
                    onClick={() => toggleStatus(c)}
                    layout
                    className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                      c.status === 'completed'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : c.status === 'in_progress'
                        ? 'bg-indigo-500/15 text-indigo-300'
                        : 'bg-white/[0.08] text-slate-400'
                    }`}
                    whileTap={{ scale: 0.92 }}
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
                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-500 hover:text-red-400 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </GlowCard>

      {/* ── Edit Profile Modal ──────────────────────────────────── */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="עריכת פרופיל"
        subtitle="עדכן את המסלול ושנת הלימודים"
        size="md"
        footer={
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setEditOpen(false)}
              className="px-4 py-2 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 text-sm transition-all"
            >
              ביטול
            </button>
            <button
              onClick={saveEditProfile}
              disabled={editSaving || !editTrackId}
              className="px-6 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold disabled:opacity-40 hover:shadow-lg hover:shadow-indigo-500/25 transition-all"
            >
              {editSaving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'שמור'}
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Track selection */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">מסלול לימודים</label>
            {editTracks.length === 0 ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {editTracks.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setEditTrackId(t.id)}
                    className={`w-full text-right p-3 rounded-xl border transition-all text-sm ${
                      editTrackId === t.id
                        ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                        : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'
                    }`}
                  >
                    <span className="font-medium">{t.name}</span>
                    <span className="text-slate-500 mr-2">{t.total_credits} נק&quot;ז</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Start year */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">שנת התחלה</label>
            <select
              value={editStartYear}
              onChange={e => setEditStartYear(Number(e.target.value))}
              style={{ colorScheme: 'dark' }}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-slate-200 focus:border-indigo-500 focus:outline-none"
            >
              {Array.from({ length: 8 }, (_, i) => editYearOptions - i).map(y => (
                <option key={y} value={y} className="bg-slate-900 text-slate-100">{y}</option>
              ))}
            </select>
          </div>

          {/* Current year */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">באיזה שנה אתה עכשיו?</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map(y => (
                <button
                  key={y}
                  onClick={() => setEditCurrentYear(y)}
                  className={`flex-1 py-3 rounded-xl border font-medium transition-all text-sm ${
                    editCurrentYear === y
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                      : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20'
                  }`}
                >
                  שנה {y === 1 ? "א'" : y === 2 ? "ב'" : y === 3 ? "ג'" : "ד'"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── Helper Components ──────────────────────────────────────────

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub: string; color: string
}) {
  const colors: Record<string, string> = {
    emerald: 'from-emerald-500/20 to-emerald-500/5 text-emerald-400',
    amber: 'from-amber-500/20 to-amber-500/5 text-amber-400',
    indigo: 'from-indigo-500/20 to-indigo-500/5 text-indigo-400',
    violet: 'from-violet-500/20 to-violet-500/5 text-violet-400',
  }
  return (
    <GlowCard>
      <div className="p-4">
        <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${colors[color]} flex items-center justify-center mb-2`}>
          {icon}
        </div>
        <div className="text-xl font-bold text-slate-100">{value}</div>
        <div className="text-xs text-slate-500">{sub}</div>
      </div>
    </GlowCard>
  )
}
