'use client'

/**
 * Backup & Restore card for the Settings page.
 *
 * Lists snapshots from `TEEPO/.backups/`, lets the user create a new one,
 * and restore a chosen one. Restore writes a "pre-restore" snapshot first
 * (handled in lib/drive-db-backup.ts) so the user can undo.
 *
 * Reads the live Drive token + handle from the auth + DB contexts. When
 * either is missing (anonymous, dev-bypass mode) the card shows an
 * informative empty state instead of broken buttons.
 */

import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Database, Loader2, RefreshCw, Plus, RotateCcw, Check, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useDB } from '@/lib/db-context'
import { isDevAuthBypassEnabled } from '@/lib/dev-auth-bypass'
import {
  createSnapshot,
  listSnapshots,
  restoreSnapshot,
  type SnapshotMetadata,
  MAX_SNAPSHOTS,
} from '@/lib/drive-db-backup'
import GlowCard from '@/components/ui/GlowCard'
import Modal from '@/components/ui/Modal'

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('he-IL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatBytes(bytes?: number): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export default function BackupRestore() {
  const { googleToken, refreshGoogleToken } = useAuth()
  const { db, handle, ready, reload } = useDB()

  const [snapshots, setSnapshots] = useState<SnapshotMetadata[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [confirmRestore, setConfirmRestore] = useState<SnapshotMetadata | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const withFreshToken = useCallback(async <T,>(op: (t: string) => Promise<T>): Promise<T> => {
    let t = googleToken
    if (!t) t = await refreshGoogleToken()
    if (!t) throw new Error('לא מחובר ל-Google Drive')
    try {
      return await op(t)
    } catch (e: any) {
      if (typeof e?.message === 'string' && /401|403/.test(e.message)) {
        const fresh = await refreshGoogleToken()
        if (fresh) return await op(fresh)
      }
      throw e
    }
  }, [googleToken, refreshGoogleToken])

  const refresh = useCallback(async () => {
    if (!handle || !ready) return
    setLoading(true)
    setError(null)
    try {
      const list = await withFreshToken((t) => listSnapshots(t, handle))
      setSnapshots(list)
    } catch (e: any) {
      setError(e?.message || 'טעינת גיבויים נכשלה')
    } finally {
      setLoading(false)
    }
  }, [handle, ready, withFreshToken])

  useEffect(() => {
    if (handle && ready) refresh()
  }, [handle, ready, refresh])

  const handleCreate = async () => {
    if (!handle) return
    setCreating(true)
    setError(null)
    try {
      await withFreshToken((t) => createSnapshot(t, handle, db))
      setSuccessMsg('גיבוי נוצר')
      setTimeout(() => setSuccessMsg(null), 2500)
      await refresh()
    } catch (e: any) {
      setError(e?.message || 'יצירת גיבוי נכשלה')
    } finally {
      setCreating(false)
    }
  }

  const handleRestore = async () => {
    if (!handle || !confirmRestore) return
    const target = confirmRestore
    setRestoringId(target.fileId)
    setConfirmRestore(null)
    setError(null)
    try {
      await withFreshToken((t) => restoreSnapshot(t, handle, target.fileId))
      // Reload the DB context so the UI picks up the restored state.
      await reload()
      setSuccessMsg('גיבוי שוחזר. הדף יטען מחדש את הנתונים.')
      setTimeout(() => setSuccessMsg(null), 4000)
      await refresh()
    } catch (e: any) {
      setError(e?.message || 'שחזור נכשל')
    } finally {
      setRestoringId(null)
    }
  }

  // Gated states: dev bypass, no Drive connection, etc.
  if (isDevAuthBypassEnabled()) {
    return (
      <GlowCard glowColor="rgba(99,102,241,0.10)">
        <div className="p-5">
          <div className="flex items-center gap-2 mb-2">
            <Database size={16} style={{ color: '#818cf8' }} />
            <h2 className="font-semibold text-ink">גיבוי ושחזור</h2>
          </div>
          <p className="text-xs text-ink-subtle">
            לא זמין במצב פיתוח (dev bypass). כבה את הדגל כדי לראות גיבויים אמיתיים.
          </p>
        </div>
      </GlowCard>
    )
  }
  if (!handle || !ready) {
    return (
      <GlowCard glowColor="rgba(99,102,241,0.10)">
        <div className="p-5">
          <div className="flex items-center gap-2 mb-2">
            <Database size={16} style={{ color: '#818cf8' }} />
            <h2 className="font-semibold text-ink">גיבוי ושחזור</h2>
          </div>
          <p className="text-xs text-ink-subtle">
            יחובר אחרי שמסד הנתונים יטען. אם אתה רואה את ההודעה הזאת אחרי טעינה — ודא שאתה
            מחובר ל-Google Drive.
          </p>
        </div>
      </GlowCard>
    )
  }

  return (
    <>
      <GlowCard glowColor="rgba(99,102,241,0.10)">
        <div className="p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(99,102,241,0.15)' }}
              >
                <Database size={14} style={{ color: '#818cf8' }} />
              </div>
              <h2 className="font-semibold text-ink">גיבוי ושחזור</h2>
              {snapshots.length > 0 && (
                <span className="text-[10px] text-ink-subtle">
                  {snapshots.length}/{MAX_SNAPSHOTS}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={refresh}
                disabled={loading}
                className="p-1.5 rounded-lg text-ink-subtle hover:text-ink hover:bg-white/[0.04] transition-colors disabled:opacity-50"
                title="רענון"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-white disabled:opacity-50 transition-opacity hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
              >
                {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                {creating ? 'שומר...' : 'גבה עכשיו'}
              </button>
            </div>
          </div>

          {/* Body */}
          <p className="text-[11px] text-ink-subtle mb-3">
            תמונת מצב של מסד הנתונים שלך נשמרת ב-Drive. השתמש בשחזור אם משהו השתבש —
            למשל מחיקה בטעות. לפני שחזור נשמר אוטומטית גיבוי של המצב הנוכחי, כך שניתן
            לחזור אחורה.
          </p>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2 mb-3">
              {error}
            </div>
          )}
          <AnimatePresence>
            {successMsg && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2 mb-3 flex items-center gap-2"
              >
                <Check size={12} />
                {successMsg}
              </motion.div>
            )}
          </AnimatePresence>

          {/* List */}
          {loading && snapshots.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-ink-subtle">
              <Loader2 size={16} className="animate-spin" />
            </div>
          ) : snapshots.length === 0 ? (
            <p className="text-xs text-ink-muted text-center py-4">
              אין גיבויים עדיין. לחץ "גבה עכשיו" כדי ליצור אחד.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {snapshots.map((s, i) => {
                const isRestoring = restoringId === s.fileId
                return (
                  <div
                    key={s.fileId}
                    className="flex items-center gap-3 p-2.5 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.02)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink">{formatDateTime(s.created_at)}</p>
                      <p className="text-[10px] text-ink-subtle">
                        {i === 0 ? 'החדש ביותר' : s.size != null ? formatBytes(s.size) : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => setConfirmRestore(s)}
                      disabled={isRestoring}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-ink-muted hover:text-ink hover:bg-white/[0.04] transition-colors disabled:opacity-50"
                    >
                      {isRestoring ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                      {isRestoring ? 'משחזר...' : 'שחזר'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </GlowCard>

      {/* Restore confirmation */}
      <Modal
        open={!!confirmRestore}
        onClose={() => setConfirmRestore(null)}
        title="אישור שחזור גיבוי"
      >
        <div dir="rtl" className="space-y-4">
          <div className="flex items-start gap-2 text-sm text-ink-muted">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
            <div>
              <p className="text-ink font-medium mb-1">
                לדרוס את המצב הנוכחי בגיבוי מ-{confirmRestore && formatDateTime(confirmRestore.created_at)}?
              </p>
              <p className="text-xs">
                כל הקורסים, השיעורים והמטלות שלך יתחלפו בנתונים מאותו זמן. לפני השחזור,
                ייווצר אוטומטית גיבוי של המצב הנוכחי, כך שתוכל לחזור אחורה אם תתחרט.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setConfirmRestore(null)}
              className="px-4 py-2 rounded-xl text-sm text-ink-muted hover:text-ink hover:bg-white/[0.04] transition-colors"
            >
              ביטול
            </button>
            <button
              onClick={handleRestore}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #f97316)' }}
            >
              <RotateCcw size={14} />
              שחזר
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
