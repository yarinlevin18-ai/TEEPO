'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GraduationCap, Search, Plus, Trash2, Check,
  ChevronRight, ChevronLeft, BookOpen, Target,
  TrendingUp, Award, Sparkles, X, Loader2,
} from 'lucide-react'
import { api } from '@/lib/api-client'
import { useAuth } from '@/lib/auth-context'
import GlowCard from '@/components/ui/GlowCard'

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
  const [loading, setLoading] = useState(true)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [profile, setProfile] = useState<any>(null)
  const [track, setTrack] = useState<Track | null>(null)

  const checkProfile = useCallback(async () => {
    try {
      const res = await api.catalog.profile()
      if (res.needs_onboarding) {
        setNeedsOnboarding(true)
      } else {
        setProfile(res.profile)
        setTrack(res.track)
        setNeedsOnboarding(false)
      }
    } catch {
      setNeedsOnboarding(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { checkProfile() }, [checkProfile])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
      </div>
    )
  }

  if (needsOnboarding) {
    return <OnboardingWizard onComplete={() => { setNeedsOnboarding(false); checkProfile() }} />
  }

  return <CreditsDashboard profile={profile} track={track} />
}

// ══════════════════════════════════════════════════════════════
// Onboarding Wizard
// ══════════════════════════════════════════════════════════════

function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(1)
  const [tracks, setTracks] = useState<Track[]>([])
  const [selectedTrack, setSelectedTrack] = useState<string>('')
  const [startYear, setStartYear] = useState(new Date().getFullYear())
  const [currentYear, setCurrentYear] = useState(1)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.catalog.tracks().then(setTracks).catch(() => {})
  }, [])

  const handleSave = async () => {
    if (!selectedTrack) return
    setSaving(true)
    try {
      const t = tracks.find(t => t.id === selectedTrack)
      const totalSemesters = t?.type === 'dual' ? 6 : 6
      await api.catalog.saveProfile({
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
          await api.catalog.addCoursesBulk(
            mandatory.map((c: CatalogCourse) => ({
              course_id: c.course_id,
              course_name: c.name,
              credits: c.credits,
              status: 'planned',
              source: 'catalog',
            }))
          )
        }
      } catch {}

      onComplete()
    } catch (err: any) {
      alert(err.message)
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

                  {tracks.length === 0 && (
                    <div className="text-center py-8 text-slate-500">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                      טוען מסלולים...
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
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-slate-200 focus:border-indigo-500 focus:outline-none"
                      >
                        {Array.from({ length: 8 }, (_, i) => currentYearOptions - i).map(y => (
                          <option key={y} value={y}>{y}</option>
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
  const [credits, setCredits] = useState<CreditSummary | null>(null)
  const [myCourses, setMyCourses] = useState<StudentCourse[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<CatalogCourse[]>([])
  const [searching, setSearching] = useState(false)
  const [showSearch, setShowSearch] = useState(false)

  const loadData = useCallback(async () => {
    const [creditsRes, coursesRes] = await Promise.all([
      api.catalog.credits().catch(() => null),
      api.catalog.myCourses().catch(() => []),
    ])
    if (creditsRes?.status === 'success') setCredits(creditsRes)
    setMyCourses(coursesRes)
  }, [])

  useEffect(() => { loadData() }, [loadData])

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

  const addCourse = async (course: CatalogCourse, status = 'completed') => {
    try {
      await api.catalog.addCourse({
        course_id: course.course_id,
        course_name: course.name,
        credits: course.credits,
        status,
        source: 'catalog',
      })
      loadData()
    } catch {}
  }

  const removeCourse = async (courseId: string) => {
    try {
      await api.catalog.removeCourse(courseId)
      loadData()
    } catch {}
  }

  const toggleStatus = async (course: StudentCourse) => {
    const nextStatus = course.status === 'completed' ? 'planned' : course.status === 'planned' ? 'in_progress' : 'completed'
    try {
      await api.catalog.addCourse({
        course_id: course.course_id,
        course_name: course.course_name,
        credits: course.credits,
        status: nextStatus,
        source: course.source,
      })
      loadData()
    } catch {}
  }

  const completedCredits = credits?.completed_credits ?? 0
  const totalRequired = credits?.total_required ?? (track?.total_credits ?? 0)
  const progressPercent = totalRequired > 0 ? Math.min(100, (completedCredits / totalRequired) * 100) : 0

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">
            מעקב נק"ז
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {track?.name || 'מסלול לא מוגדר'}
          </p>
        </div>
        <button
          onClick={() => setShowSearch(!showSearch)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition-all"
        >
          <Plus className="w-4 h-4" />
          הוסף קורס
        </button>
      </div>

      {/* Credit Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
            <span>{completedCredits} נק"ז</span>
            <span>{totalRequired} נק"ז</span>
          </div>
        </div>
      </GlowCard>

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
                className="flex-1 bg-transparent border-none outline-none text-slate-200 placeholder:text-slate-600"
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
                          {c.course_id} | {c.credits} נק"ז
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

      {/* My Courses */}
      <GlowCard>
        <div className="p-4">
          <h2 className="text-lg font-semibold text-slate-200 mb-4">הקורסים שלי</h2>
          {myCourses.length === 0 ? (
            <p className="text-center text-slate-500 py-8">
              עדיין לא נוספו קורסים. לחץ "הוסף קורס" למעלה
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
                      {c.credits} נק"ז
                      {c.grade && <span className="text-emerald-400 mr-2">ציון: {c.grade}</span>}
                    </div>
                  </div>
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
