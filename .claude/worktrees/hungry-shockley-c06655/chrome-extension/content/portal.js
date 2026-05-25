/**
 * University portal content script — BGU portal + TAU portal.
 *
 * The portal pages are less file-heavy than Moodle (they're mostly grades,
 * registration, schedule) but they do host course syllabi PDFs and the
 * occasional exam booklet. We scan less aggressively than the Moodle
 * scraper — only following anchors that already look like file URLs.
 *
 * Source patterns:
 *   - BGU: https://portal.bgu.ac.il/ + https://www.bgu.ac.il/...
 *   - TAU: https://www.tau.ac.il/...
 *
 * Course ID is harder to extract here because the portal embeds courses
 * inside iframes or AJAX-loaded panels. We fall back to a best-effort
 * lookup against common URL parameters; when no course ID is found we
 * report files with `courseId: null` and let the popup ask the user to
 * choose a course.
 */

const KNOWN_EXTS = new Set([
  'pdf', 'pptx', 'ppt', 'docx', 'doc',
  'xlsx', 'xls', 'csv', 'png', 'jpg', 'jpeg', 'gif', 'svg',
  'mp4', 'mp3', 'm4a', 'zip',
])

const EXT_TO_MIME = {
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt:  'application/vnd.ms-powerpoint',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc:  'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv:  'text/csv',
  png:  'image/png',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  zip:  'application/zip',
}

function fileExtension(s) {
  const m = String(s).toLowerCase().match(/\.([a-z0-9]{1,5})(?:[?#].*)?$/i)
  return m ? m[1].toLowerCase() : ''
}

function kindFor(ext) {
  if (['pdf'].includes(ext)) return 'pdf'
  if (['pptx', 'ppt'].includes(ext)) return 'slide'
  if (['docx', 'doc'].includes(ext)) return 'doc'
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'sheet'
  if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) return 'image'
  if (['zip'].includes(ext)) return 'archive'
  return 'other'
}

function filenameFromHref(href) {
  try {
    const u = new URL(href, location.href)
    const last = u.pathname.split('/').filter(Boolean).pop()
    return last ? decodeURIComponent(last) : 'קובץ'
  } catch {
    return 'קובץ'
  }
}

/**
 * Course ID — portal URLs are inconsistent. Try a handful of common params.
 * Returns null if we can't find one — the popup will then ask the user.
 */
function getCourseId() {
  try {
    const u = new URL(location.href)
    for (const k of ['courseId', 'course_id', 'courseno', 'cid', 'id']) {
      const v = u.searchParams.get(k)
      if (v && /^\d{2,12}$/.test(v)) return v
    }
  } catch {}
  return null
}

function scanLinks() {
  const out = []
  const seen = new Set()
  const anchors = document.querySelectorAll('a[href]')
  for (const a of anchors) {
    const href = a.href
    if (!href || seen.has(href)) continue
    const ext = fileExtension(href)
    if (!ext || !KNOWN_EXTS.has(ext)) continue
    seen.add(href)
    const filename = filenameFromHref(href)
    out.push({
      filename: filename.length > 120 ? filename.slice(0, 120) + '…' : filename,
      sourceUrl: href,
      mimeType: EXT_TO_MIME[ext] || 'application/octet-stream',
      kind: kindFor(ext),
    })
  }
  return out
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'TEEPO_SCAN') return
  const courseId = getCourseId()
  const files = scanLinks().map(f => ({ ...f, courseId }))
  sendResponse({
    source: hostnameLabel(),
    courseId,
    courseName: document.title.split('·')[0].trim() || null,
    files,
  })
  return true
})

function hostnameLabel() {
  const h = location.hostname.toLowerCase()
  if (h.includes('bgu')) return 'פורטל · BGU'
  if (h.includes('tau')) return 'פורטל · TAU'
  return `פורטל · ${h}`
}
