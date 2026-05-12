'use client'

/**
 * <CourseDrivePanel /> — expanded view inside a course card on /summaries.
 *
 * Shows the three Drive subfolders of a course (שיעורים / מטלות / סיכומים)
 * with the files inside each. Polls Drive every 30s via useDriveFiles.
 *
 * Each section gets its own upload button (file picker → upload to that
 * folder) and per-file delete with a confirmation. Files are clickable
 * links that open in Drive in a new tab.
 *
 * If the course doesn't have folder IDs yet, the panel renders a primer
 * inviting the user to provision them. The provisioning itself lives in
 * the existing `useCourse` action that calls `ensureCourseFolders`.
 */

import { useRef, useState } from 'react'
import {
  Upload, Trash2, FileText, Image as ImageIcon, FileVideo, FileAudio,
  Presentation, Sheet, FileArchive, Link as LinkIcon, File as FileIcon,
  Loader2, ExternalLink, RefreshCw,
} from 'lucide-react'
import { useDriveFiles } from '@/lib/use-drive-files'
import { fileKind, formatSize, type DriveFile } from '@/lib/drive-files'

interface PanelProps {
  /** Drive folder IDs for this course — set after ensureCourseFolders ran. */
  folderIds?: {
    course?: string | null
    lessons?: string | null
    assignments?: string | null
    notes?: string | null
  } | null
}

const SECTIONS: Array<{ key: 'lessons' | 'assignments' | 'notes'; label: string; hint: string }> = [
  { key: 'lessons',     label: 'שיעורים',  hint: 'הרצאות, תרגולים, מצגות' },
  { key: 'assignments', label: 'מטלות',   hint: 'תרגילים, פרויקטים, בחנים' },
  { key: 'notes',       label: 'סיכומים', hint: 'הסיכומים האישיים שלך' },
]

export default function CourseDrivePanel({ folderIds }: PanelProps) {
  if (!folderIds?.course) {
    return (
      <div className="drive-panel drive-panel--empty">
        <p>
          התיקייה של הקורס עדיין לא מוכנה ב-Drive.
          לחצו על "סנכרון Drive" בעמוד הקורסים כדי שניצור אותה.
        </p>
      </div>
    )
  }

  return (
    <div className="drive-panel">
      {SECTIONS.map(s => (
        <FolderSection
          key={s.key}
          label={s.label}
          hint={s.hint}
          folderId={folderIds[s.key] ?? null}
        />
      ))}
    </div>
  )
}

export function FolderSection({
  label,
  hint,
  folderId,
}: {
  label: string
  hint: string
  folderId: string | null
}) {
  const { files, loading, error, refresh, upload, remove, uploading } = useDriveFiles(folderId)
  const fileInput = useRef<HTMLInputElement>(null)
  const [pendingDelete, setPendingDelete] = useState<DriveFile | null>(null)

  const onPickFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return
    for (const f of Array.from(list)) {
      try { await upload(f) } catch (e) { console.error('[drive-panel] upload failed', e) }
    }
    if (fileInput.current) fileInput.current.value = '' // allow re-picking same file
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    try { await remove(pendingDelete.id) } catch (e) { console.error('[drive-panel] delete failed', e) }
    setPendingDelete(null)
  }

  return (
    <section className="drive-section" aria-label={label}>
      <header className="drive-section-head">
        <div className="drive-section-title">
          <h4>{label}</h4>
          <small>{hint}</small>
        </div>
        <div className="drive-section-actions">
          <span className="drive-count">{files.length}</span>
          <button
            type="button"
            className="drive-icon-btn"
            onClick={() => refresh()}
            title="רענן"
            aria-label="רענן רשימה"
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
          <button
            type="button"
            className="drive-upload-btn"
            onClick={() => fileInput.current?.click()}
            disabled={!folderId || uploading}
          >
            <Upload size={14} /> העלאה
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => onPickFiles(e.target.files)}
          />
        </div>
      </header>

      {error && <div className="drive-error">{error}</div>}

      {files.length === 0 && !loading ? (
        <div className="drive-empty">אין קבצים כאן עדיין.</div>
      ) : (
        <ul className="drive-file-list">
          {files.map(f => (
            <li key={f.id} className="drive-file">
              <FileTypeIcon mime={f.mimeType} />
              <div className="drive-file-body">
                <a
                  href={f.webViewLink || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="drive-file-name"
                >
                  {f.name}
                </a>
                <small>
                  {formatSize(f.size)}
                  {f.size && f.modifiedTime ? ' · ' : ''}
                  {f.modifiedTime && new Date(f.modifiedTime).toLocaleDateString('he-IL')}
                </small>
              </div>
              {f.id.startsWith('tmp-') ? (
                <Loader2 size={14} className="spin drive-file-spinner" aria-label="מעלה..." />
              ) : (
                <>
                  <a
                    href={f.webViewLink || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="drive-icon-btn"
                    title="פתח ב-Drive"
                    aria-label="פתח ב-Drive"
                  >
                    <ExternalLink size={13} />
                  </a>
                  <button
                    type="button"
                    className="drive-icon-btn drive-icon-btn--danger"
                    onClick={() => setPendingDelete(f)}
                    title="העבר לסל"
                    aria-label={`מחק ${f.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {pendingDelete && (
        <div className="drive-confirm" role="dialog" aria-label="אישור מחיקה">
          <p>
            למחוק את <strong>{pendingDelete.name}</strong>? הקובץ יעבור לסל
            ב-Drive ויהיה ניתן לשחזור משם תוך 30 ימים.
          </p>
          <div className="drive-confirm-actions">
            <button type="button" onClick={() => setPendingDelete(null)}>ביטול</button>
            <button type="button" className="danger" onClick={confirmDelete}>מחק</button>
          </div>
        </div>
      )}
    </section>
  )
}

function FileTypeIcon({ mime }: { mime: string }) {
  const kind = fileKind(mime)
  const Icon =
    kind === 'pdf'     ? FileText :
    kind === 'image'   ? ImageIcon :
    kind === 'video'   ? FileVideo :
    kind === 'audio'   ? FileAudio :
    kind === 'slide'   ? Presentation :
    kind === 'sheet'   ? Sheet :
    kind === 'doc'     ? FileText :
    kind === 'archive' ? FileArchive :
    kind === 'link'    ? LinkIcon :
                         FileIcon
  return <Icon className={`drive-file-icon kind-${kind}`} size={18} />
}
