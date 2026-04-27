'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings, User, GraduationCap, Save, Check, AlertCircle, ArrowRight, CalendarDays, Database, Building2, Sun, Moon } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { useDB } from '@/lib/db-context'
import { useTheme } from '@/lib/theme-context'
import Link from 'next/link'
import GlowCard from '@/components/ui/GlowCard'
import type { UniversityCode } from '@/types'

export default function SettingsPage() {
  const { user } = useAuth()
  const { db, ready, updateSettings } = useDB()
  const { theme, setTheme } = useTheme()
  const [displayName, setDisplayName] = useState('')
  const [originalName, setOriginalName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  // Degree-start state (local; persisted to Drive settings on change)
  const [degreeYear, setDegreeYear] = useState<string>('')
  const [degreeMonth, setDegreeMonth] = useState<string>('10')
  const [takesSummer, setTakesSummer] = useState<boolean>(false)
  const [degreeSaved, setDegreeSaved] = useState(false)
  // v2.1 — university + theme persistence to Drive
  const [universitySaved, setUniversitySaved] = useState(false)
  const [themeSaved, setThemeSaved] = useState(false)

  // Track info
  const [trackName, setTrackName] = useState<string | null>(null)
  const [profileYear, setProfileYear] = useState<number | null>(null)

  useEffect(() => {
    if (user) {
      const name = user.user_metadata?.display_name || user.user_metadata?.full_name || ''
      setDisplayName(name)
      setOriginalName(name)
    }
  }, [user])

  // Hydrate degree-start fields from Drive DB once it's ready
  useEffect(() => {
    if (!ready) return
    const s = db.settings || {}
    if (s.degree_start_year) setDegreeYear(String(s.degree_start_year))
    if (s.degree_start_month) setDegreeMonth(String(s.degree_start_month))
    setTakesSummer(!!s.takes_summer)
  }, [ready, db.settings])

  // v2.1 — change which university the user belongs to. Writes to
  // settings.university (consumed by use-university hook + scrapers + catalog).
  const handleUniversityChange = async (code: UniversityCode | '') => {
    if (!code) return
    try {
      await updateSettings({ university: code })
      setUniversitySaved(true)
      setError('')
      setTimeout(() => setUniversitySaved(false), 3000)
    } catch (e: any) {
      setError(e.message || 'שמירת בחירת האוניברסיטה נכשלה')
    }
  }

  // v2.1 — theme toggle. Local state (theme-context + localStorage) is the
  // source of truth on this device; settings.theme persists the preference
  // to Drive so future devices can default to it (db-context can pick this
  // up on load — separate scope).
  const handleThemeChange = async (next: 'light' | 'dark') => {
    if (next === theme) return
    setTheme(next)
    try {
      await updateSettings({ theme: next })
      setThemeSaved(true)
      setTimeout(() => setThemeSaved(false), 2000)
    } catch {
      // Don't surface — theme already applied locally; Drive sync is best-effort.
    }
  }

  const handleDegreeSave = async () => {
    const y = parseInt(degreeYear, 10)
    const m = parseInt(degreeMonth, 10)
    if (!y || y < 2000 || y > 2100) {
      setError('שנה לא תקינה')
      return
    }
    if (!m || m < 1 || m > 12) {
      setError('חודש לא תקין')
      return
    }
    try {
      await updateSettings({
        degree_start_year: y,
        degree_start_month: m,
        takes_summer: takesSummer,
      })
      setDegreeSaved(true)
      setError('')
      setTimeout(() => setDegreeSaved(false), 3000)
    } catch (e: any) {
      setError(e.message || 'שמירה נכשלה')
    }
  }

  // Load academic profile info
  useEffect(() => {
    async function loadProfile() {
      if (!user) return
      try {
        const { data } = await supabase
          .from('student_profile')
          .select('track_id, current_year')
          .eq('user_id', user.id)
          .single()

        if (data) {
          setProfileYear(data.current_year)
          if (data.track_id) {
            const { data: track } = await supabase
              .from('bgu_tracks')
              .select('name')
              .eq('id', data.track_id)
              .single()
            if (track) setTrackName(track.name)
          }
        }
      } catch {
        // No profile yet
      }
    }
    loadProfile()
  }, [user])

  const hasChanges = displayName.trim() !== originalName

  const handleSave = async () => {
    if (!hasChanges || saving) return
    setSaving(true)
    setError('')
    setSaved(false)

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        data: { display_name: displayName.trim() }
      })

      if (updateError) throw updateError

      setOriginalName(displayName.trim())
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: any) {
      setError(e.message || 'שגיאה בשמירה')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto animate-fade-in">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-8"
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(99,102,241,0.15)' }}
        >
          <Settings size={20} style={{ color: '#818cf8' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">הגדרות</h1>
          <p className="text-sm text-ink-muted">ניהול החשבון וההעדפות שלך</p>
        </div>
      </motion.div>

      <div className="space-y-5">
        {/* Profile Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
        <GlowCard glowColor="rgba(99,102,241,0.10)">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-5">
            <User size={18} style={{ color: '#818cf8' }} />
            <h2 className="font-semibold text-white">פרטים אישיים</h2>
          </div>

          {/* Display Name */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-ink-muted mb-1.5">שם תצוגה</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="הזן את השם שלך"
                className="input-dark"
                dir="rtl"
              />
              <p className="text-xs text-ink-subtle mt-1">השם שיוצג בדשבורד ובהודעות</p>
            </div>

            {/* Email (read only) */}
            <div>
              <label className="block text-sm text-ink-muted mb-1.5">אימייל</label>
              <div
                className="px-4 py-2.5 rounded-xl text-sm text-ink-muted"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
                dir="ltr"
              >
                {user?.email || '—'}
              </div>
              <p className="text-xs text-ink-subtle mt-1">לא ניתן לשנות את האימייל</p>
            </div>

            {/* Save button */}
            <AnimatePresence mode="wait">
              {hasChanges && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold btn-gradient shadow-glow-sm disabled:opacity-50"
                  >
                    {saving ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Save size={16} />
                    )}
                    <span>{saving ? 'שומר...' : 'שמור שינויים'}</span>
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Success / Error messages */}
            <AnimatePresence>
              {saved && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-sm"
                  style={{ color: '#10b981' }}
                >
                  <Check size={16} />
                  <span>השם עודכן בהצלחה!</span>
                </motion.div>
              )}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-sm"
                  style={{ color: '#ef4444' }}
                >
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        </GlowCard>
        </motion.div>

        {/* Academic Profile Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
        <GlowCard glowColor="rgba(99,102,241,0.10)">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-5">
            <GraduationCap size={18} style={{ color: '#818cf8' }} />
            <h2 className="font-semibold text-white">פרופיל אקדמי</h2>
          </div>

          {trackName ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-muted">מסלול לימודים</span>
                <span className="text-sm text-white font-medium">{trackName}</span>
              </div>
              {profileYear && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink-muted">שנה נוכחית</span>
                  <span className="text-sm text-white font-medium">שנה {profileYear}</span>
                </div>
              )}
              <div
                className="mt-3 pt-3"
                style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
              >
                <Link href="/credits">
                  <motion.button
                    whileHover={{ x: -3 }}
                    className="flex items-center gap-2 text-sm font-medium transition-colors"
                    style={{ color: '#818cf8' }}
                  >
                    <ArrowRight size={16} />
                    <span>עבור למעקב נקודות זכות</span>
                  </motion.button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-ink-muted mb-3">
                עדיין לא הגדרת פרופיל אקדמי
              </p>
              <Link href="/credits">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold btn-gradient"
                >
                  <GraduationCap size={16} />
                  <span>הגדר עכשיו</span>
                </motion.button>
              </Link>
            </div>
          )}
        </div>
        </GlowCard>
        </motion.div>

        {/* University (v2.1) — drives catalog, scrapers, branding */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.11 }}
        >
        <GlowCard glowColor="rgba(99,102,241,0.10)">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <Building2 size={18} style={{ color: '#818cf8' }} />
            <h2 className="font-semibold text-white">האוניברסיטה שלי</h2>
          </div>
          <p className="text-xs text-ink-subtle mb-5">
            קובע איזה קטלוג קורסים נטען, מאיזה Moodle/פורטל מסונכרנים נתונים, ולאיזה מאגר ידע פונה היועץ האקדמי.
          </p>

          <div>
            <label className="block text-sm text-ink-muted mb-1.5">אוניברסיטה</label>
            <select
              value={db.settings?.university || ''}
              onChange={(e) => handleUniversityChange(e.target.value as UniversityCode | '')}
              className="input-dark"
              dir="rtl"
              disabled={!ready}
            >
              <option value="" disabled>בחר אוניברסיטה...</option>
              <option value="bgu">אוניברסיטת בן-גוריון בנגב</option>
              <option value="tau">אוניברסיטת תל אביב</option>
            </select>
            <p className="text-[11px] text-ink-subtle mt-2">
              אוניברסיטאות נוספות (טכניון, עברית, רייכמן ועוד) יתווספו בשלב 3.
            </p>
          </div>

          <AnimatePresence>
            {universitySaved && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 text-sm mt-4"
                style={{ color: '#10b981' }}
              >
                <Check size={16} />
                <span>נשמר — הקטלוג והסנכרון יתעדכנו בהתאם</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        </GlowCard>
        </motion.div>

        {/* Theme (v2.1) — light / dark, persisted to settings.theme */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.115 }}
        >
        <GlowCard glowColor="rgba(245,158,11,0.10)">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-2">
            {theme === 'dark' ? (
              <Moon size={18} style={{ color: '#fbbf24' }} />
            ) : (
              <Sun size={18} style={{ color: '#fbbf24' }} />
            )}
            <h2 className="font-semibold text-white">מצב תצוגה</h2>
          </div>
          <p className="text-xs text-ink-subtle mb-5">
            כהה או בהיר. נשמר במכשיר ובחשבון, כך שמכשירים חדשים יתחילו עם ההעדפה שלך.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleThemeChange('dark')}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                theme === 'dark'
                  ? 'btn-gradient text-white shadow-glow-sm'
                  : 'border border-white/10 text-ink-muted hover:border-white/20 hover:text-ink'
              }`}
            >
              <Moon size={15} />
              <span>כהה</span>
            </button>
            <button
              onClick={() => handleThemeChange('light')}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                theme === 'light'
                  ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                  : 'border border-white/10 text-ink-muted hover:border-white/20 hover:text-ink'
              }`}
            >
              <Sun size={15} />
              <span>בהיר</span>
            </button>
          </div>

          <AnimatePresence>
            {themeSaved && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 text-xs mt-3"
                style={{ color: '#10b981' }}
              >
                <Check size={14} />
                <span>נשמר</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        </GlowCard>
        </motion.div>

        {/* Degree Start Date — powers year-of-study classification */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
        >
        <GlowCard glowColor="rgba(99,102,241,0.10)">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <CalendarDays size={18} style={{ color: '#818cf8' }} />
            <h2 className="font-semibold text-white">תחילת התואר</h2>
          </div>
          <p className="text-xs text-ink-subtle mb-5">
            משמש לחישוב לאיזו שנה (א/ב/ג/ד) וסמסטר (א/ב/קיץ) שייך כל קורס שמושך מ-Moodle.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-ink-muted mb-1.5">חודש</label>
              <select
                value={degreeMonth}
                onChange={(e) => setDegreeMonth(e.target.value)}
                className="input-dark"
                dir="rtl"
              >
                <option value="10">אוקטובר (רגיל)</option>
                <option value="3">מרץ</option>
                <option value="1">ינואר</option>
                <option value="4">אפריל</option>
                <option value="7">יולי</option>
                <option value="11">נובמבר</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-ink-muted mb-1.5">שנה</label>
              <input
                type="number"
                value={degreeYear}
                onChange={(e) => setDegreeYear(e.target.value)}
                placeholder="2023"
                min={2000}
                max={2100}
                className="input-dark"
                dir="ltr"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 mt-4 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={takesSummer}
              onChange={(e) => setTakesSummer(e.target.checked)}
              className="w-4 h-4 accent-indigo-500"
            />
            <span className="text-sm text-ink-muted">
              אני לומד גם בסמסטר קיץ (אופציונלי — מציג חריץ "קיץ" גם אם ריק)
            </span>
          </label>

          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleDegreeSave}
            className="mt-5 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold btn-gradient shadow-glow-sm"
          >
            <Save size={16} />
            <span>שמור</span>
          </motion.button>

          <AnimatePresence>
            {degreeSaved && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 text-sm mt-3"
                style={{ color: '#10b981' }}
              >
                <Check size={16} />
                <span>נשמר — קורסים חדשים יסווגו אוטומטית</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        </GlowCard>
        </motion.div>

        {/* Drive Storage — how big is the user's db.json and where is the weight? */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.13 }}
        >
        <GlowCard glowColor="rgba(99,102,241,0.10)">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <Database size={18} style={{ color: '#818cf8' }} />
            <h2 className="font-semibold text-white">אחסון ב-Google Drive</h2>
          </div>
          <p className="text-xs text-ink-subtle mb-5">
            כל הנתונים שלך (קורסים, סיכומים, מחברות) שמורים בקובץ אחד ב-Drive שלך.
            ברגע שהקובץ מתקרב ל-10MB השמירות הופכות לאיטיות — מומלץ למחוק מקורות ישנים.
          </p>
          {(() => {
            // Compute sizes client-side (free) — no extra Drive calls needed.
            const bytes = (obj: unknown) => new Blob([JSON.stringify(obj ?? [])]).size
            const fmt = (b: number) =>
              b < 1024 ? `${b} B`
              : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB`
              : `${(b / 1024 / 1024).toFixed(2)} MB`
            const totalDb = bytes(db)
            const sizeCourses = bytes(db.courses)
            const sizeLessons = bytes(db.lessons)
            const sizeNotes = bytes(db.notes)
            const sizeSources = bytes(db.notebook_sources)
            const sizeNotebooks = bytes(db.notebooks)
            const warnLevel = totalDb > 10 * 1024 * 1024 ? 'danger'
              : totalDb > 5 * 1024 * 1024 ? 'warn'
              : 'ok'
            const warnColor = warnLevel === 'danger' ? '#ef4444'
              : warnLevel === 'warn' ? '#f59e0b'
              : '#10b981'
            const pct = Math.min((totalDb / (10 * 1024 * 1024)) * 100, 100)
            const rows = [
              { label: 'מקורות מחברות (PDF/טקסט)', size: sizeSources },
              { label: 'שיעורים', size: sizeLessons },
              { label: 'סיכומים', size: sizeNotes },
              { label: 'קורסים', size: sizeCourses },
              { label: 'מטא של מחברות + שיחות', size: sizeNotebooks },
            ].sort((a, b) => b.size - a.size)
            return (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-ink-muted">סה״כ</span>
                    <span className="text-sm font-medium" style={{ color: warnColor }}>
                      {fmt(totalDb)} / 10 MB
                    </span>
                  </div>
                  <div
                    className="h-2 rounded-full overflow-hidden"
                    style={{ background: 'rgba(255,255,255,0.06)' }}
                  >
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6 }}
                      className="h-full rounded-full"
                      style={{ background: warnColor }}
                    />
                  </div>
                  {warnLevel === 'danger' && (
                    <p className="text-xs mt-2" style={{ color: '#ef4444' }}>
                      הקובץ גדול מאוד — השמירות ל-Drive יהיו איטיות. מומלץ למחוק מקורות
                      ישנים מתוך "מחברות AI".
                    </p>
                  )}
                  {warnLevel === 'warn' && (
                    <p className="text-xs mt-2" style={{ color: '#f59e0b' }}>
                      הקובץ מתחיל להיות גדול. שים לב כמה מקורות כבדים אתה מוסיף.
                    </p>
                  )}
                </div>
                <div
                  className="pt-3 space-y-1.5"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
                >
                  {rows.map((r) => (
                    <div key={r.label} className="flex items-center justify-between text-xs">
                      <span className="text-ink-muted">{r.label}</span>
                      <span className="text-ink-subtle font-mono" dir="ltr">{fmt(r.size)}</span>
                    </div>
                  ))}
                </div>
                <div className="pt-3 grid grid-cols-3 gap-3 text-center"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div>
                    <div className="text-lg font-semibold text-white">{db.courses.length}</div>
                    <div className="text-[11px] text-ink-muted">קורסים</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-white">
                      {(db.notebooks || []).length}
                    </div>
                    <div className="text-[11px] text-ink-muted">מחברות</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-white">
                      {(db.notebook_sources || []).length}
                    </div>
                    <div className="text-[11px] text-ink-muted">מקורות</div>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
        </GlowCard>
        </motion.div>

        {/* Account Info */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
        <GlowCard glowColor="rgba(99,102,241,0.10)">
        <div className="p-6">
          <h2 className="font-semibold text-white mb-4">מידע על החשבון</h2>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-muted">מזהה משתמש</span>
              <span className="text-xs text-ink-subtle font-mono" dir="ltr">
                {user?.id ? `${user.id.slice(0, 8)}...` : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-muted">ספק אימות</span>
              <span className="text-sm text-ink-muted">
                {user?.app_metadata?.provider === 'google' ? 'Google' : 'אימייל + סיסמה'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-muted">נוצר בתאריך</span>
              <span className="text-sm text-ink-muted" dir="ltr">
                {user?.created_at
                  ? new Date(user.created_at).toLocaleDateString('he-IL')
                  : '—'}
              </span>
            </div>
          </div>
        </div>
        </GlowCard>
        </motion.div>
      </div>
    </div>
  )
}
