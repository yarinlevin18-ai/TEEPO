'use client'

/**
 * <LessonActionBar /> — top banner shown inside CourseFolderOverviewPanel
 * when the user lands on /summaries from a dashboard calendar row.
 *
 * Surfaces the matched lesson title and two one-click actions:
 *   • כתוב סיכום — creates a fresh Google Doc inside the course's סיכומים
 *     folder, names it after the lesson, and opens it in a new tab so the
 *     user can start typing immediately.
 *   • העלה סיכום — opens a file picker and uploads the chosen file(s) into
 *     the same סיכומים folder.
 *
 * Self-contained: owns its own Drive token fetch, error display, and busy
 * state. Doesn't poll the folder — the parent FolderSection already
 * refetches its file list on a 30s interval.
 */

import { useRef, useState } from 'react'
import { Pencil, Upload, Loader2, ExternalLink, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { createGoogleDoc, uploadFile } from '@/lib/drive-files'
import type { Course } from '@/types'

interface Props {
  course: Course
  /** Title from the calendar event that brought us here. Used in the
   *  generated summary file name + as the banner subtitle. */
  lessonTitle: string
}

function todayStamp(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Build a friendly file name for the new summary. Trims overly long
 *  lesson titles so the Drive list stays readable. */
function summaryName(lessonTitle: string): string {
  const cleaned = lessonTitle.trim().replace(/[/\\]/g, '-').slice(0, 80)
  const stamp = todayStamp()
  return cleaned ? `${stamp} — סיכום — ${cleaned}` : `${stamp} — סיכום`
}

export default function LessonActionBar({ course, lessonTitle }: Props) {
  const { googleToken, refreshGoogleToken } = useAuth()
  const folderIds = (course as any).drive_folder_ids as {
    notes?: string
    lessons?: string
  } | null
  const notesId = folderIds?.notes ?? null

  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'write' | 'upload' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ name: string; href: string } | null>(null)

  const getToken = async (): Promise<string | null> => {
    if (googleToken) return googleToken
    return refreshGoogleToken()
  }

  const handleWrite = async () => {
    if (!notesId) {
      setError('התיקייה "סיכומים" עוד לא נוצרה לקורס הזה — צור תיקיות תחילה.')
      return
    }
    setBusy('write')
    setError(null)
    setCreated(null)
    try {
      const tok = await getToken()
      if (!tok) throw new Error('לא ניתן להתחבר ל-Drive')
      const name = summaryName(lessonTitle)
      const doc = await createGoogleDoc(tok, notesId, name)
      const href = doc.webViewLink ?? `https://docs.google.com/document/d/${doc.id}/edit`
      setCreated({ name: doc.name, href })
      // Open immediately. The popup blocker usually allows this since
      // it's a direct response to a click.
      window.open(href, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setError((e as Error)?.message ?? 'שגיאה')
    } finally {
      setBusy(null)
    }
  }

  const handleUpload = async (list: FileList | null) => {
    if (!list || list.length === 0) return
    if (!notesId) {
      setError('התיקייה "סיכומים" עוד לא נוצרה לקורס הזה — צור תיקיות תחילה.')
      return
    }
    setBusy('upload')
    setError(null)
    setCreated(null)
    try {
      const tok = await getToken()
      if (!tok) throw new Error('לא ניתן להתחבר ל-Drive')
      const files = Array.from(list)
      const uploaded: string[] = []
      for (const f of files) {
        try {
          const meta = await uploadFile(tok, notesId, f, f.name)
          uploaded.push(meta.name)
        } catch (e) {
          console.warn('[lesson-action-bar] upload failed', f.name, e)
        }
      }
      if (uploaded.length === 0) {
        setError('העלאה נכשלה.')
      } else {
        setCreated({
          name: uploaded.length === 1 ? uploaded[0] : `${uploaded.length} קבצים`,
          href: '#uploaded',
        })
      }
    } catch (e) {
      setError((e as Error)?.message ?? 'שגיאה')
    } finally {
      setBusy(null)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <div className="lesson-action-bar" dir="rtl">
      <div className="lesson-action-bar-head">
        <div className="lesson-action-bar-eyebrow">השיעור שבחרת ביומן</div>
        <strong className="lesson-action-bar-title">{lessonTitle}</strong>
      </div>

      <div className="lesson-action-bar-actions">
        <button
          type="button"
          className="lesson-action-btn primary"
          onClick={handleWrite}
          disabled={busy !== null || !notesId}
          title="פתח קובץ Google Doc חדש בתיקיית הסיכומים"
        >
          {busy === 'write' ? <Loader2 size={16} className="spin" /> : <Pencil size={16} />}
          {busy === 'write' ? 'מכין…' : 'כתוב סיכום'}
        </button>

        <button
          type="button"
          className="lesson-action-btn"
          onClick={() => fileInput.current?.click()}
          disabled={busy !== null || !notesId}
          title="העלה קובץ סיכום מהמחשב לתיקיית הסיכומים"
        >
          {busy === 'upload' ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
          {busy === 'upload' ? 'מעלה…' : 'העלה סיכום'}
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>

      {error && <div className="lesson-action-bar-error">{error}</div>}

      {created && (
        <div className="lesson-action-bar-success">
          <CheckCircle2 size={14} />
          <span>נוצר: <strong>{created.name}</strong></span>
          {created.href !== '#uploaded' && (
            <a href={created.href} target="_blank" rel="noopener noreferrer">
              פתח <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}
    </div>
  )
}
