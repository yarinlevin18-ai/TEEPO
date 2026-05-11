/**
 * Moodle content script — scans a Moodle course page for downloadable files
 * and reports them to the popup on TEEPO_SCAN.
 *
 * Targets:
 *   - BGU:  https://moodle.bgu.ac.il/moodle/course/view.php?id=NNNN
 *   - TAU:  https://moodle.tau.ac.il/course/view.php?id=NNNN
 *
 * Strategy:
 *   1. Parse course ID from the URL (`?id=`) or fall back to a body class.
 *   2. Walk every <a href> in the course content area; classify by URL
 *      shape (resource vs folder vs URL-mod) and file extension.
 *   3. Drop duplicates (Moodle sometimes renders the same file twice via
 *      a thumbnail + a label).
 *
 * Returns one shape regardless of source:
 *   { source, courseId, courseName, files: [{ filename, sourceUrl, mimeType, kind, courseId }] }
 */

const KNOWN_EXTS = new Set([
  'pdf', 'pptx', 'ppt', 'docx', 'doc',
  'xlsx', 'xls', 'csv',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg',
  'mp4', 'mov', 'webm', 'mkv',
  'mp3', 'wav', 'm4a', 'ogg',
  'zip', 'rar', '7z', 'tar', 'gz',
  'txt', 'rtf', 'odt', 'odp', 'ods',
])

const EXT_TO_MIME = {
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt:  'application/vnd.ms-powerpoint',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc:  'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls:  'application/vnd.ms-excel',
  csv:  'text/csv',
  png:  'image/png',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  gif:  'image/gif',
  webp: 'image/webp',
  svg:  'image/svg+xml',
  mp4:  'video/mp4',
  mov:  'video/quicktime',
  webm: 'video/webm',
  mkv:  'video/x-matroska',
  mp3:  'audio/mpeg',
  wav:  'audio/wav',
  m4a:  'audio/mp4',
  ogg:  'audio/ogg',
  zip:  'application/zip',
  rar:  'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  tar:  'application/x-tar',
  gz:   'application/gzip',
  txt:  'text/plain',
  rtf:  'application/rtf',
}

function fileExtension(name) {
  const m = name.toLowerCase().match(/\.([a-z0-9]{1,5})(?:[?#].*)?$/i)
  return m ? m[1].toLowerCase() : ''
}

function kindFor(ext) {
  if (['pdf'].includes(ext)) return 'pdf'
  if (['pptx', 'ppt', 'odp'].includes(ext)) return 'slide'
  if (['docx', 'doc', 'rtf', 'odt', 'txt'].includes(ext)) return 'doc'
  if (['xlsx', 'xls', 'csv', 'ods'].includes(ext)) return 'sheet'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image'
  if (['mp4', 'mov', 'webm', 'mkv'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'm4a', 'ogg'].includes(ext)) return 'audio'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive'
  return 'other'
}

/** Course ID — try the URL query first, then fall back to a body class. */
function getCourseId() {
  try {
    const u = new URL(location.href)
    const id = u.searchParams.get('id')
    if (id) return id
  } catch {}
  const bodyClass = document.body.className || ''
  const m = bodyClass.match(/course-(\d+)/)
  return m ? m[1] : null
}

function getCourseName() {
  // Moodle's standard page header is .page-header-headings h1 or .coursename.
  const candidates = ['.page-header-headings h1', '.coursename', 'h1.course-name', 'h1']
  for (const sel of candidates) {
    const el = document.querySelector(sel)
    if (el && el.textContent && el.textContent.trim().length > 1) {
      return el.textContent.trim()
    }
  }
  return null
}

/** Pretty filename — `decodeURIComponent` the last path segment and strip ?query/#hash. */
function filenameFromHref(href, fallback) {
  try {
    const u = new URL(href, location.href)
    const last = u.pathname.split('/').filter(Boolean).pop()
    if (!last) return fallback || 'קובץ'
    const decoded = decodeURIComponent(last)
    if (KNOWN_EXTS.has(fileExtension(decoded))) return decoded
    return fallback || decoded
  } catch {
    return fallback || 'קובץ'
  }
}

/**
 * Pull file candidates from the course page. Looks at every <a href> in
 * the main course content area. Moodle wraps resources in `<a class="aalink">`
 * inside `.activity` blocks; we also look outside that to catch labels.
 */
function scanLinks() {
  const out = []
  const seen = new Set()
  // Restrict to course content if we can — falls back to whole document.
  const root =
    document.querySelector('#region-main, .course-content, [role="main"]') || document
  const anchors = root.querySelectorAll('a[href]')

  for (const a of anchors) {
    const href = a.href
    if (!href || seen.has(href)) continue

    const looksLikeFile = isModResource(href) || hasFileExtension(href) || isPluginFile(href)
    if (!looksLikeFile) continue

    seen.add(href)
    const label = (a.textContent || '').trim() || a.getAttribute('aria-label') || ''
    const filename = filenameFromHref(href, label || undefined)
    const ext = fileExtension(filename)
    out.push({
      filename: filename.length > 120 ? filename.slice(0, 120) + '…' : filename,
      sourceUrl: href,
      mimeType: EXT_TO_MIME[ext] || 'application/octet-stream',
      kind: kindFor(ext),
    })
  }
  return out
}

function isModResource(href) {
  // Moodle's "resource" mod renders an /mod/resource/view.php?id=NNN URL.
  return /\/mod\/(resource|folder|url)\/view\.php/i.test(href)
}

function isPluginFile(href) {
  // Direct pluginfile.php URLs — Moodle's authenticated file delivery.
  return /\/pluginfile\.php\//i.test(href)
}

function hasFileExtension(href) {
  const ext = fileExtension(href.split('?')[0])
  return ext && KNOWN_EXTS.has(ext)
}

// ── Message handler ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'TEEPO_SCAN') return
  const courseId = getCourseId()
  const courseName = getCourseName()
  const files = scanLinks().map(f => ({ ...f, courseId }))
  sendResponse({
    source: hostnameLabel(),
    courseId,
    courseName,
    files,
  })
  // Returning true keeps the channel open if we want to do async work later.
  return true
})

function hostnameLabel() {
  const h = location.hostname.toLowerCase()
  if (h.endsWith('bgu.ac.il')) return 'Moodle · BGU'
  if (h.endsWith('tau.ac.il')) return 'Moodle · TAU'
  return `Moodle · ${h}`
}
