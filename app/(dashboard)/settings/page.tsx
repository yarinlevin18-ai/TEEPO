'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings, User, GraduationCap, Save, Check, AlertCircle, ArrowRight } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import GlowCard from '@/components/ui/GlowCard'

export default function SettingsPage() {
  const { user } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [originalName, setOriginalName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

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
    <div className="p-6 md:p-10 max-w-2xl mx-auto">
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
