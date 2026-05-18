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

  // ── Gated states (dev bypass / no Drive connection) ────────────────
  if (isDevAuthBypassEnabled()) {
    return (
      <section className="settings-v2-card">
        <header className="settings-v2-card-head">
          <span className="settings-v2-card-icon tone-accent"><Database size={16} /></span>
          <h2>גיבוי ושחזור</h2>
        </header>
        <p className="settings-v2-card-hint">
          לא זמין במצב פיתוח (dev bypass). כבה את הדגל כדי לראות גיבויים אמיתיים.
        </p>
      </section>
    )
  }
  if (!handle || !ready) {
    return (
      <section className="settings-v2-card">
        <header className="settings-v2-card-head">
          <span className="settings-v2-card-icon tone-accent"><Database size={16} /></span>
          <h2>גיבוי ושחזור</h2>
        </header>
        <p className="settings-v2-card-hint">
          יחובר אחרי שמסד הנתונים יטען. אם אתה רואה את ההודעה הזאת אחרי טעינה — ודא שאתה
          מחובר ל-Google Drive.
        </p>
      </section>
    )
  }

  return (
    <>
      <section className="settings-v2-card">
        <header className="settings-v2-card-head">
          <span className="settings-v2-card-icon tone-accent"><Database size={16} /></span>
          <h2>גיבוי ושחזור</h2>
          {snapshots.length > 0 && (
            <span className="settings-v2-backup-count">
              {snapshots.length}/{MAX_SNAPSHOTS}
            </span>
          )}
          <div className="settings-v2-backup-actions">
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="settings-v2-backup-refresh"
              title="רענון"
              aria-label="רענן רשימת גיבויים"
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="settings-v2-btn primary small"
            >
              {creating ? <Loader2 size={12} className="spin" /> : <Plus size={12} />}
              {creating ? 'שומר...' : 'גבה עכשיו'}
            </button>
          </div>
        </header>

        <p className="settings-v2-card-hint">
          תמונת מצב של מסד הנתונים שלך נשמרת ב-Drive. השתמש בשחזור אם משהו השתבש —
          למשל מחיקה בטעות. לפני שחזור נשמר אוטומטית גיבוי של המצב הנוכחי, כך שניתן
          לחזור אחורה.
        </p>

        <div className="settings-v2-card-body">
          {error && (
            <div className="settings-v2-backup-error">
              {error}
            </div>
          )}
          <AnimatePresence>
            {successMsg && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="settings-v2-backup-success"
              >
                <Check size={12} />
                {successMsg}
              </motion.div>
            )}
          </AnimatePresence>

          {loading && snapshots.length === 0 ? (
            <div className="settings-v2-backup-loading">
              <Loader2 size={16} className="spin" />
            </div>
          ) : snapshots.length === 0 ? (
            <p className="settings-v2-backup-empty">
              אין גיבויים עדיין. לחץ "גבה עכשיו" כדי ליצור אחד.
            </p>
          ) : (
            <ul className="settings-v2-backup-list">
              {snapshots.map((s, i) => {
                const isRestoring = restoringId === s.fileId
                return (
                  <li key={s.fileId} className="settings-v2-backup-item">
                    <div className="settings-v2-backup-meta">
                      <p>{formatDateTime(s.created_at)}</p>
                      <small>
                        {i === 0 ? 'החדש ביותר' : s.size != null ? formatBytes(s.size) : ''}
                      </small>
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirmRestore(s)}
                      disabled={isRestoring}
                      className="settings-v2-backup-restore"
                    >
                      {isRestoring ? <Loader2 size={11} className="spin" /> : <RotateCcw size={11} />}
                      {isRestoring ? 'משחזר...' : 'שחזר'}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      <Modal
        open={!!confirmRestore}
        onClose={() => setConfirmRestore(null)}
        title="אישור שחזור גיבוי"
      >
        <div dir="rtl" className="settings-v2-restore-modal">
          <div className="settings-v2-restore-warn">
            <AlertTriangle size={16} />
            <div>
              <p className="title">
                לדרוס את המצב הנוכחי בגיבוי מ-{confirmRestore && formatDateTime(confirmRestore.created_at)}?
              </p>
              <p className="body">
                כל הקורסים, השיעורים והמטלות שלך יתחלפו בנתונים מאותו זמן. לפני השחזור,
                ייווצר אוטומטית גיבוי של המצב הנוכחי, כך שתוכל לחזור אחורה אם תתחרט.
              </p>
            </div>
          </div>
          <div className="settings-v2-restore-actions">
            <button
              type="button"
              onClick={() => setConfirmRestore(null)}
              className="settings-v2-btn"
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={handleRestore}
              className="settings-v2-btn warn"
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
