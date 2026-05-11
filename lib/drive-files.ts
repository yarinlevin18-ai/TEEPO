/**
 * Drive Files — list / upload / delete operations inside a known folder.
 *
 * Sister of drive-folders.ts. That one manages the directory hierarchy
 * (TEEPO/{degree}/{year}/{sem}/{course}/...); this one manages the leaf
 * file objects inside any of those folders.
 *
 * Scope: still drive.file — operates only on items TEEPO created. Listing a
 * folder returns only the user's TEEPO-owned files; uploads inherit the
 * scope automatically.
 *
 * Used from the browser directly (no backend hop) — pulls the user's
 * Google access token from auth-context.
 */

const DRIVE_API   = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  /** Bytes, as a string per Drive API. */
  size?: string
  modifiedTime?: string
  /** Best-effort thumbnail URL — may 404 right after upload until Drive renders one. */
  thumbnailLink?: string
  /** Direct webViewLink to open in Drive. */
  webViewLink?: string
  /** Direct webContentLink to download. Requires the user to be signed in. */
  webContentLink?: string
}

async function driveFetch(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  })
}

async function bodyOrEmpty(res: Response): Promise<string> {
  try { return await res.clone().text() } catch { return '' }
}

/**
 * List non-folder files inside `folderId`. Returns at most 100 by default —
 * enough for a single semester's worth of materials. For deeper folders
 * pass a custom `pageSize` up to 1000.
 */
export async function listFolderFiles(
  token: string,
  folderId: string,
  opts: { pageSize?: number } = {},
): Promise<DriveFile[]> {
  const q = [
    `'${folderId}' in parents`,
    "mimeType != 'application/vnd.google-apps.folder'",
    'trashed = false',
  ].join(' and ')
  const fields = 'files(id,name,mimeType,size,modifiedTime,thumbnailLink,webViewLink,webContentLink)'
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&orderBy=modifiedTime desc&pageSize=${opts.pageSize ?? 100}&spaces=drive`
  const res = await driveFetch(token, url)
  if (!res.ok) {
    const body = await bodyOrEmpty(res)
    throw new Error(`Drive list ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  return data.files ?? []
}

/**
 * Upload a single file blob into `folderId`. Uses multipart so name + content
 * go in one request. Returns the new file's metadata.
 *
 * @param onProgress  Optional progress callback (0..1). Drive's multipart
 *                    upload doesn't stream progress events through fetch, so
 *                    we report 0 → 1 on success. For real progress bars use
 *                    resumable uploads (future).
 */
export async function uploadFile(
  token: string,
  folderId: string,
  file: File | Blob,
  filename: string,
  onProgress?: (fraction: number) => void,
): Promise<DriveFile> {
  onProgress?.(0)
  const metadata = {
    name: filename,
    parents: [folderId],
  }
  // Drive expects a specific multipart/related boundary structure.
  const boundary = `teepo-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const closing = `\r\n--${boundary}--`
  const meta =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`

  const body = new Blob([meta, file, closing], { type: `multipart/related; boundary=${boundary}` })

  const fields = 'id,name,mimeType,size,modifiedTime,thumbnailLink,webViewLink,webContentLink'
  const res = await driveFetch(
    token,
    `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=${encodeURIComponent(fields)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  )
  if (!res.ok) {
    const errBody = await bodyOrEmpty(res)
    throw new Error(`Drive upload ${res.status}: ${errBody.slice(0, 200)}`)
  }
  onProgress?.(1)
  return res.json()
}

/**
 * Move a file to Drive's trash. We don't permanently delete — the user can
 * still recover from the Drive UI for ~30 days, which matches Google's
 * native expectation and gives us a safety net.
 */
export async function trashFile(token: string, fileId: string): Promise<void> {
  const res = await driveFetch(token, `${DRIVE_API}/files/${fileId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  })
  if (!res.ok) {
    const body = await bodyOrEmpty(res)
    throw new Error(`Drive trash ${res.status}: ${body.slice(0, 200)}`)
  }
}

/**
 * Human-readable file size from the Drive size string. Drive returns bytes
 * as a string (so it can carry numbers >2³¹); we collapse to KB/MB/GB.
 */
export function formatSize(bytes?: string | number): string {
  if (bytes == null) return ''
  const n = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n < 1024)             return `${n} B`
  if (n < 1024 * 1024)      return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/**
 * Map a Drive mimeType → a generic kind for icon selection / sorting.
 */
export function fileKind(mime: string): 'pdf' | 'doc' | 'slide' | 'sheet' | 'image' | 'video' | 'audio' | 'archive' | 'link' | 'other' {
  if (!mime) return 'other'
  if (mime === 'application/pdf')                                                return 'pdf'
  if (mime.startsWith('image/'))                                                 return 'image'
  if (mime.startsWith('video/'))                                                 return 'video'
  if (mime.startsWith('audio/'))                                                 return 'audio'
  if (mime.includes('presentation') || mime.includes('powerpoint'))              return 'slide'
  if (mime.includes('spreadsheet') || mime.includes('excel'))                    return 'sheet'
  if (mime.includes('document') || mime.includes('word') || mime === 'text/plain') return 'doc'
  if (mime === 'application/zip' || mime.includes('compressed') || mime.includes('rar'))
    return 'archive'
  if (mime === 'application/internet-shortcut' || mime === 'text/uri-list')      return 'link'
  return 'other'
}
