'use client'

/**
 * /settings — account + preferences page (cream design system).
 *
 * Migrated from the v1 dark-theme layout (text-white / bg-white/[0.02]
 * / <GlowCard> / input-dark) to the cream tokens used elsewhere. The
 * data layer is unchanged — every hook, handler, and write call is
 * the same as before. Only the visual shell + a few classNames moved.
 *
 * Sections (top → bottom):
 *   1. Page head
 *   2. פרטים אישיים — display name + email
 *   3. האוניברסיטה שלי — picks catalog + scrapers
 *   4. מצב תצוגה — light/dark theme switcher
 *   5. תחילת התואר — degrees list + year/month + summer toggle
 *   6. גיבוי ושחזור — <BackupRestore /> shared component
 *   7. אחסון ב-Google Drive — size breakdown
 *   8. מידע על החשבון — readonly identity fields
 *   9. איפוס נתונים — destructive, requires typed confirmation
 */

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings, User as UserIcon, Save, Check, AlertCircle, CalendarDays,
  Database, Building2, Sun, Moon, Trash2, Plus,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { useDB } from '@/lib/db-context'
import { useTheme } from '@/lib/theme-context'
import BackupRestore from '@/components/settings/BackupRestore'
import type { Degree, UniversityCode, UserSettings } from '@/types'
import { resolveDegrees, newDegreeId } from '@/lib/degrees'

export default function SettingsPage() {
  const { user } = useAuth()
  const { db, ready, updateSettings, resetAccountData, flushSave } = useDB()
  const { theme, setTheme } = useTheme()

  // ── Local form state ───────────────────────────────────────────────
  const [displayName, setDisplayName] = useState('')
  const [originalName, setOriginalName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Degree-start state (local; persisted to Drive settings on change)
  const [degreesList, setDegreesList] = useState<Degree[]>([])
  const [degreeYear, setDegreeYear] = useState<string>('')
  const [degreeMonth, setDegreeMonth] = useState<string>('10')
  const [takesSummer, setTakesSummer] = useState<boolean>(false)
  const [degreeSaved, setDegreeSaved] = useState(false)

  // v2.1 — university + theme persistence to Drive
  const [universitySaved, setUniversitySaved] = useState(false)
  const [themeSaved, setThemeSaved] = useState(false)

  // ── Hydration effects ──────────────────────────────────────────────
  // Hydrate the display-name input from Drive DB first, falling back to
  // Google OAuth profile name. Email prefix is NOT used as a seed — the
  // input should stay blank so the user can see they haven't saved
  // anything yet, instead of seeing "yarinlevin18" pre-filled.
  useEffect(() => {
    if (!ready && !user) return
    const driveName = (db?.settings?.display_name as string | undefined)?.trim() || ''
    const meta = (user?.user_metadata as Record<string, unknown> | undefined) ?? {}
    const googleName =
      (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
      (typeof meta.name === 'string' && meta.name.trim()) ||
      (typeof meta.display_name === 'string' && meta.display_name.trim()) ||
      ''
    const initial = driveName || googleName
    setDisplayName(initial)
    setOriginalName(initial)
  }, [user, ready, db?.settings?.display_name])

  // Hydrate degree-start fields from Drive DB. Prefer degrees[]; if
  // missing, migrate from the legacy single-string degree_name
  // (resolveDegrees handles both).
  useEffect(() => {
    if (!ready) return
    const s = db.settings || {}
    setDegreesList(resolveDegrees(s).filter(d => d.name.length > 0))
    if (s.degree_start_year) setDegreeYear(String(s.degree_start_year))
    if (s.degree_start_month) setDegreeMonth(String(s.degree_start_month))
    setTakesSummer(!!s.takes_summer)
  }, [ready, db.settings])

  // ── Save handlers ──────────────────────────────────────────────────
  const handleUniversityChange = async (code: UniversityCode | '') => {
    if (!code) return
    try {
      await updateSettings({ university: code })
      await flushSave()
      setUniversitySaved(true)
      setError('')
      setTimeout(() => setUniversitySaved(false), 3000)
    } catch (e: any) {
      setError(e.message || 'שמירת בחירת האוניברסיטה נכשלה')
    }
  }

  const handleThemeChange = async (next: 'light' | 'dark') => {
    if (next === theme) return
    setTheme(next)
    try {
      await updateSettings({ theme: next })
      await flushSave()
      setThemeSaved(true)
      setTimeout(() => setThemeSaved(false), 2000)
    } catch {
      // Don't surface — theme already applied locally; Drive sync best-effort.
    }
  }

  const handleDegreeSave = async () => {
    const patch: Partial<UserSettings> = { takes_summer: takesSummer }
    const cleanedDegrees = degreesList.map(d => ({ id: d.id, name: d.name.trim() }))
    // Drop fully-empty trailing rows so the user doesn't accumulate orphan
    // ids forever — but keep at least one row even if blank.
    while (cleanedDegrees.length > 1 && cleanedDegrees[cleanedDegrees.length - 1].name === '') {
      cleanedDegrees.pop()
    }
    patch.degrees = cleanedDegrees
    patch.degree_name = cleanedDegrees.find(d => d.name)?.name || undefined
    if (degreeYear.trim()) {
      const y = parseInt(degreeYear, 10)
      if (!y || y < 2000 || y > 2100) { setError('שנה לא תקינה'); return }
      patch.degree_start_year = y
    }
    if (degreeMonth.trim()) {
      const m = parseInt(degreeMonth, 10)
      if (!m || m < 1 || m > 12) { setError('חודש לא תקין'); return }
      patch.degree_start_month = m
    }
    try {
      await updateSettings(patch)
      await flushSave()
      setDegreeSaved(true)
      setError('')
      setTimeout(() => setDegreeSaved(false), 3000)
    } catch (e: any) {
      setError(e.message || 'שמירה נכשלה')
    }
  }

  const hasChanges = displayName.trim() !== originalName

  const handleSave = async () => {
    if (!hasChanges || saving) return
    setSaving(true)
    setError('')
    setSaved(false)
    const next = displayName.trim()
    try {
      // Drive DB is the source of truth — write there first + flush so
      // the dashboard picks up the new name on the next render. Supabase
      // metadata write is best-effort for legacy consumers.
      await updateSettings({ display_name: next })
      await flushSave()
      try {
        await supabase.auth.updateUser({ data: { display_name: next } })
      } catch (e) {
        console.warn('[settings] supabase metadata mirror failed', e)
      }
      setOriginalName(next)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: any) {
      setError(e.message || 'שגיאה בשמירה')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="cream-page settings-v2">
      <main className="settings-v2-main">
        {/* ===== HEADER ===== */}
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="settings-v2-head"
        >
          <div className="settings-v2-head-icon">
            <Settings size={20} />
          </div>
          <div>
            <h1>הגדרות</h1>
            <p>ניהול החשבון וההעדפות שלך</p>
          </div>
        </motion.header>

        <div className="settings-v2-sections">

          {/* ===== 1. פרטים אישיים ===== */}
          <SectionCard delay={0.05} icon={<UserIcon size={18} />} title="פרטים אישיים">
            <Field label="שם תצוגה" hint="השם שיוצג בדשבורד ובהודעות">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="הזן את השם שלך"
                className="settings-v2-input"
                dir="rtl"
              />
            </Field>

            <Field label="אימייל" hint="לא ניתן לשנות את האימייל">
              <div className="settings-v2-readonly" dir="ltr">
                {user?.email || '—'}
              </div>
            </Field>

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
                    className="settings-v2-btn primary"
                  >
                    {saving
                      ? <div className="settings-v2-spinner" aria-hidden />
                      : <Save size={16} />}
                    <span>{saving ? 'שומר...' : 'שמור שינויים'}</span>
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>

            <SavedMsg show={saved} text="השם עודכן בהצלחה!" />
            <ErrorMsg show={!!error} text={error} />
          </SectionCard>

          {/* ===== 2. האוניברסיטה שלי ===== */}
          <SectionCard
            delay={0.10}
            icon={<Building2 size={18} />}
            title="האוניברסיטה שלי"
            hint="קובע איזה קטלוג קורסים נטען, מאיזה Moodle/פורטל מסונכרנים נתונים, ולאיזה מאגר ידע פונה היועץ האקדמי."
          >
            <Field label="אוניברסיטה">
              <select
                value={db.settings?.university || ''}
                onChange={(e) => handleUniversityChange(e.target.value as UniversityCode | '')}
                className="settings-v2-input"
                dir="rtl"
                disabled={!ready}
              >
                <option value="" disabled>בחר אוניברסיטה...</option>
                <option value="bgu">אוניברסיטת בן-גוריון בנגב</option>
                <option value="tau">אוניברסיטת תל אביב</option>
              </select>
            </Field>
            <p className="settings-v2-hint">
              אוניברסיטאות נוספות (טכניון, עברית, רייכמן ועוד) יתווספו בשלב 3.
            </p>
            <SavedMsg show={universitySaved} text="נשמר — הקטלוג והסנכרון יתעדכנו בהתאם" />
          </SectionCard>

          {/* ===== 3. מצב תצוגה ===== */}
          <SectionCard
            delay={0.115}
            icon={theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
            title="מצב תצוגה"
            hint="כהה או בהיר. נשמר במכשיר ובחשבון, כך שמכשירים חדשים יתחילו עם ההעדפה שלך."
            iconTone="amber"
          >
            <div className="settings-v2-theme-grid">
              <button
                type="button"
                onClick={() => handleThemeChange('dark')}
                className={`settings-v2-theme-btn ${theme === 'dark' ? 'active' : ''}`}
              >
                <Moon size={15} />
                <span>כהה</span>
              </button>
              <button
                type="button"
                onClick={() => handleThemeChange('light')}
                className={`settings-v2-theme-btn ${theme === 'light' ? 'active' : ''}`}
              >
                <Sun size={15} />
                <span>בהיר</span>
              </button>
            </div>
            <SavedMsg show={themeSaved} text="נשמר" small />
          </SectionCard>

          {/* ===== 4. תחילת התואר ===== */}
          <SectionCard
            delay={0.12}
            icon={<CalendarDays size={18} />}
            title="תחילת התואר"
            hint="משמש לחישוב לאיזו שנה (א/ב/ג/ד) וסמסטר (א/ב/קיץ) שייך כל קורס שמושך מ-Moodle."
          >
            <Field label={degreesList.length > 1 ? 'התארים שלי (דו-חוגי)' : 'שם התואר'}>
              <div className="settings-v2-degrees">
                {degreesList.map((d, i) => (
                  <div key={d.id} className="settings-v2-degree-row">
                    <input
                      type="text"
                      value={d.name}
                      onChange={(e) => {
                        const v = e.target.value
                        setDegreesList(prev => prev.map((x, j) => j === i ? { ...x, name: v } : x))
                      }}
                      placeholder={i === 0 ? 'מדעי המחשב' : 'מנהל עסקים'}
                      maxLength={80}
                      autoFocus={i > 0 && d.name === ''}
                      className="settings-v2-input"
                      dir="rtl"
                    />
                    {degreesList.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setDegreesList(prev => prev.filter((_, j) => j !== i))}
                        className="settings-v2-degree-remove"
                        title="מחק תואר"
                      >
                        הסר
                      </button>
                    )}
                  </div>
                ))}
                {degreesList.length === 0 && (
                  <input
                    type="text"
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return
                      setDegreesList([{ id: newDegreeId(), name: e.target.value }])
                    }}
                    placeholder="תואר ראשון - מדעי המחשב"
                    maxLength={80}
                    className="settings-v2-input"
                    dir="rtl"
                  />
                )}
              </div>
              {degreesList.length < 3 && (
                <button
                  type="button"
                  onClick={() => setDegreesList(prev => [
                    ...(prev.length === 0 ? [{ id: newDegreeId(), name: '' }] : prev),
                    { id: newDegreeId(), name: '' },
                  ])}
                  className="settings-v2-add-degree"
                >
                  <Plus size={13} />
                  {degreesList.length === 0
                    ? 'הוסף תואר'
                    : degreesList.length === 1
                      ? 'הוסף תואר שני (דו-חוגי)'
                      : 'הוסף תואר נוסף'}
                </button>
              )}
              <p className="settings-v2-hint">
                {degreesList.length > 1
                  ? 'בעמוד המוח כל תואר יקבל עמודה משלו עם הסמסטרים שלו. צריך לתת לכל תואר שם בשביל שיופיע.'
                  : 'מופיע בעץ של המוח אחרי TEEPO. אם אתה לומד דו-חוגי — לחץ "הוסף תואר שני" ותן שם לכל אחד מהם.'}
              </p>
            </Field>

            <div className="settings-v2-degree-grid">
              <Field label="חודש">
                <select
                  value={degreeMonth}
                  onChange={(e) => setDegreeMonth(e.target.value)}
                  className="settings-v2-input"
                  dir="rtl"
                >
                  <option value="10">אוקטובר (רגיל)</option>
                  <option value="3">מרץ</option>
                  <option value="1">ינואר</option>
                  <option value="4">אפריל</option>
                  <option value="7">יולי</option>
                  <option value="11">נובמבר</option>
                </select>
              </Field>
              <Field label="שנה">
                <input
                  type="number"
                  value={degreeYear}
                  onChange={(e) => setDegreeYear(e.target.value)}
                  placeholder="2023"
                  min={2000}
                  max={2100}
                  className="settings-v2-input"
                  dir="ltr"
                />
              </Field>
            </div>

            <label className="settings-v2-checkbox">
              <input
                type="checkbox"
                checked={takesSummer}
                onChange={(e) => setTakesSummer(e.target.checked)}
              />
              <span>
                אני לומד גם בסמסטר קיץ (אופציונלי — מציג חריץ "קיץ" גם אם ריק)
              </span>
            </label>

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleDegreeSave}
              className="settings-v2-btn primary"
            >
              <Save size={16} />
              <span>שמור</span>
            </motion.button>

            <SavedMsg show={degreeSaved} text="נשמר — קורסים חדשים יסווגו אוטומטית" />
          </SectionCard>

          {/* ===== 5. גיבוי ושחזור ===== */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.13 }}
          >
            <BackupRestore />
          </motion.div>

          {/* ===== 6. אחסון ב-Google Drive ===== */}
          <SectionCard
            delay={0.135}
            icon={<Database size={18} />}
            title="אחסון ב-Google Drive"
            hint="כל הנתונים שלך (קורסים, סיכומים, מחברות) שמורים בקובץ אחד ב-Drive שלך. ברגע שהקובץ מתקרב ל-10MB השמירות הופכות לאיטיות — מומלץ למחוק מקורות ישנים."
          >
            <DriveStorageBlock db={db} />
          </SectionCard>

          {/* ===== 7. מידע על החשבון ===== */}
          <SectionCard delay={0.14} icon={<UserIcon size={18} />} title="מידע על החשבון">
            <dl className="settings-v2-info">
              <InfoRow label="מזהה משתמש">
                <code dir="ltr">{user?.id ? `${user.id.slice(0, 8)}...` : '—'}</code>
              </InfoRow>
              <InfoRow label="ספק אימות">
                {user?.app_metadata?.provider === 'google' ? 'Google' : 'אימייל + סיסמה'}
              </InfoRow>
              <InfoRow label="נוצר בתאריך">
                <span dir="ltr">
                  {user?.created_at
                    ? new Date(user.created_at).toLocaleDateString('he-IL')
                    : '—'}
                </span>
              </InfoRow>
            </dl>
          </SectionCard>

          {/* ===== 8. איפוס נתונים ===== */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <ResetSection resetAccountData={resetAccountData} ready={ready} />
          </motion.div>
        </div>
      </main>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Reusable cream-styled building blocks
// ────────────────────────────────────────────────────────────────────────

function SectionCard({
  delay = 0,
  icon,
  title,
  hint,
  iconTone = 'accent',
  children,
}: {
  delay?: number
  icon: React.ReactNode
  title: string
  hint?: string
  iconTone?: 'accent' | 'amber' | 'rose'
  children: React.ReactNode
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="settings-v2-card"
    >
      <header className="settings-v2-card-head">
        <span className={`settings-v2-card-icon tone-${iconTone}`}>{icon}</span>
        <h2>{title}</h2>
      </header>
      {hint && <p className="settings-v2-card-hint">{hint}</p>}
      <div className="settings-v2-card-body">{children}</div>
    </motion.section>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="settings-v2-field">
      <label>{label}</label>
      {children}
      {hint && <p className="settings-v2-field-hint">{hint}</p>}
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="settings-v2-info-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function SavedMsg({ show, text, small = false }: { show: boolean; text: string; small?: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className={`settings-v2-saved ${small ? 'small' : ''}`}
        >
          <Check size={small ? 14 : 16} />
          <span>{text}</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ErrorMsg({ show, text }: { show: boolean; text: string }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="settings-v2-error"
        >
          <AlertCircle size={16} />
          <span>{text}</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Drive storage block — extracted from the inline IIFE on the v1 page
// for readability. Same computation, just cream-themed.
// ────────────────────────────────────────────────────────────────────────

function DriveStorageBlock({ db }: { db: import('@/lib/drive-db').DriveDB }) {
  const bytes = (obj: unknown) => new Blob([JSON.stringify(obj ?? [])]).size
  const fmt = (b: number) =>
    b < 1024 ? `${b} B`
    : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB`
    : `${(b / 1024 / 1024).toFixed(2)} MB`
  const totalDb = bytes(db)
  const sizeCourses = bytes(db.courses)
  const sizeLessons = bytes(db.lessons)
  const sizeNotes = bytes(db.notes)
  const warnLevel: 'ok' | 'warn' | 'danger' =
    totalDb > 10 * 1024 * 1024 ? 'danger'
    : totalDb > 5 * 1024 * 1024 ? 'warn'
    : 'ok'
  const pct = Math.min((totalDb / (10 * 1024 * 1024)) * 100, 100)
  const rows = [
    { label: 'שיעורים', size: sizeLessons },
    { label: 'סיכומים', size: sizeNotes },
    { label: 'קורסים', size: sizeCourses },
  ].sort((a, b) => b.size - a.size)

  return (
    <div className="settings-v2-storage">
      <div className="settings-v2-storage-bar-head">
        <span>סה״כ</span>
        <span className={`settings-v2-storage-total tone-${warnLevel}`}>
          {fmt(totalDb)} / 10 MB
        </span>
      </div>
      <div className="settings-v2-storage-bar">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6 }}
          className={`settings-v2-storage-fill tone-${warnLevel}`}
        />
      </div>
      {warnLevel === 'danger' && (
        <p className="settings-v2-storage-msg danger">
          הקובץ גדול מאוד — השמירות ל-Drive יהיו איטיות. מומלץ למחוק שיעורים
          או סיכומים ישנים שלא בשימוש.
        </p>
      )}
      {warnLevel === 'warn' && (
        <p className="settings-v2-storage-msg warn">
          הקובץ מתחיל להיות גדול. שים לב כמה מקורות כבדים אתה מוסיף.
        </p>
      )}

      <ul className="settings-v2-storage-breakdown">
        {rows.map(r => (
          <li key={r.label}>
            <span>{r.label}</span>
            <span dir="ltr">{fmt(r.size)}</span>
          </li>
        ))}
      </ul>

      <div className="settings-v2-storage-counts">
        <div>
          <div className="num">{db.courses.length}</div>
          <div className="label">קורסים</div>
        </div>
        <div>
          <div className="num">{db.lessons.length}</div>
          <div className="label">שיעורים</div>
        </div>
        <div>
          <div className="num">{db.notes.length}</div>
          <div className="label">סיכומים</div>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Reset section — destructive, requires typed confirmation
// ────────────────────────────────────────────────────────────────────────

function ResetSection({
  resetAccountData,
  ready,
}: {
  resetAccountData: (opts?: { wipeDriveFolders?: boolean }) => Promise<{ trashedFolders: number }>
  ready: boolean
}) {
  const REQUIRED_PHRASE = 'אפס'
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [wipeFolders, setWipeFolders] = useState(true)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const canReset = ready && !busy && confirmText.trim() === REQUIRED_PHRASE

  const onReset = async () => {
    if (!canReset) return
    setBusy(true)
    setResult(null)
    setErrorMsg(null)
    try {
      const r = await resetAccountData({ wipeDriveFolders: wipeFolders })
      setResult(
        wipeFolders
          ? `המידע נמחק. ${r.trashedFolders} תיקיות הועברו לסל ב-Drive — אפשר לשחזר משם ב-30 ימים הקרובים.`
          : 'הנתונים אופסו. תיקיות ה-Drive נשארו כפי שהן.',
      )
      setConfirmText('')
      setOpen(false)
    } catch (e: any) {
      setErrorMsg(e?.message || 'איפוס נכשל')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="settings-v2-card danger-card">
      <header className="settings-v2-card-head">
        <span className="settings-v2-card-icon tone-rose"><Trash2 size={18} /></span>
        <h2>איפוס נתונים</h2>
      </header>
      <p className="settings-v2-card-hint">
        מוחק את כל הקורסים, השיעורים, המטלות והסיכומים מ-TEEPO/db.json,
        וברירת המחדל גם מעביר את כל תיקיות ה-Drive שמתחת ל-TEEPO/ לסל
        (ניתן לשחזור 30 ימים). השימושי כשרוצים להתחיל מחדש את הסריקה מ-Moodle.
      </p>
      <div className="settings-v2-card-body">
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={!ready}
            className="settings-v2-btn danger"
          >
            איפוס המידע שלי…
          </button>
        )}

        {open && (
          <div className="settings-v2-reset">
            <div className="settings-v2-reset-warn">
              <AlertCircle size={14} />
              <div>
                פעולה זו מאפסת את כל המידע ב-TEEPO/db.json. אם תסמן גם
                <strong> מחק תיקיות Drive</strong>, כל התיקיות מתחת ל-TEEPO/
                (תואר ראשון/, לא מסווגים/ וכו') יועברו לסל. ה-db.json עצמו
                לא נמחק — רק תוכנו מתאפס.
              </div>
            </div>

            <label className="settings-v2-checkbox">
              <input
                type="checkbox"
                checked={wipeFolders}
                onChange={(e) => setWipeFolders(e.target.checked)}
                disabled={busy}
              />
              <span>מחק גם את תיקיות ה-Drive (תואר ראשון/, לא מסווגים/, …)</span>
            </label>

            <Field label={`כדי לאשר, הקלד "${REQUIRED_PHRASE}"`}>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                disabled={busy}
                placeholder={REQUIRED_PHRASE}
                className="settings-v2-input"
              />
            </Field>

            <div className="settings-v2-reset-actions">
              <button
                type="button"
                onClick={onReset}
                disabled={!canReset}
                className="settings-v2-btn danger"
              >
                {busy ? 'מאפס…' : 'אפס עכשיו'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setConfirmText('')
                  setErrorMsg(null)
                }}
                disabled={busy}
                className="settings-v2-btn"
              >
                ביטול
              </button>
            </div>

            {errorMsg && <ErrorMsg show text={errorMsg} />}
          </div>
        )}

        {result && (
          <div className="settings-v2-reset-result">
            {result}
          </div>
        )}
      </div>
    </section>
  )
}
