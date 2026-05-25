/**
 * Generic page scanner — injected on demand via chrome.scripting.executeScript
 * from the popup when the user is on a non-Moodle/portal page and asks
 * "scan this page".
 *
 * Strategy: walk every <a href> and keep anything that:
 *   - ends in a known file extension (pdf/pptx/docx/...) OR
 *   - has a content-disposition: attachment hint (download attribute set), OR
 *   - is an iframe-embedded PDF (some lecturers host slides this way).
 *
 * The result is stashed on the page as window.__teepoScan and the popup
 * reads it back with a follow-up chrome.scripting.executeScript that
 * returns the value.
 */

(() => {
  const KNOWN_EXTS = new Set([
    'pdf', 'pptx', 'ppt', 'docx', 'doc',
    'xlsx', 'xls', 'csv',
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg',
    'mp4', 'mov', 'webm',
    'mp3', 'wav', 'm4a',
    'zip', 'rar', '7z',
    'txt', 'rtf',
  ])

  const EXT_TO_MIME = {
    pdf:  'application/pdf',
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

  function ext(href) {
    const m = String(href).toLowerCase().match(/\.([a-z0-9]{1,5})(?:[?#].*)?$/i)
    return m ? m[1].toLowerCase() : ''
  }

  function kindFor(e) {
    if (e === 'pdf') return 'pdf'
    if (['pptx', 'ppt'].includes(e)) return 'slide'
    if (['docx', 'doc', 'txt', 'rtf'].includes(e)) return 'doc'
    if (['xlsx', 'xls', 'csv'].includes(e)) return 'sheet'
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(e)) return 'image'
    if (['mp4', 'mov', 'webm'].includes(e)) return 'video'
    if (['mp3', 'wav', 'm4a'].includes(e)) return 'audio'
    if (['zip', 'rar', '7z'].includes(e)) return 'archive'
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

  const seen = new Set()
  const files = []

  // 1) Anchors with known file extensions or an explicit `download` attr.
  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.href
    if (!href || seen.has(href)) continue
    const e = ext(href)
    const isFile = (e && KNOWN_EXTS.has(e)) || a.hasAttribute('download')
    if (!isFile) continue
    seen.add(href)
    const fname = filenameFromHref(href)
    files.push({
      filename: fname.length > 120 ? fname.slice(0, 120) + '…' : fname,
      sourceUrl: href,
      mimeType: EXT_TO_MIME[e] || 'application/octet-stream',
      kind: kindFor(e),
    })
  }

  // 2) Iframe-embedded PDFs (common for slide hosters).
  for (const f of document.querySelectorAll('iframe[src]')) {
    const src = f.src || ''
    if (!src || seen.has(src)) continue
    const e = ext(src)
    if (e !== 'pdf') continue
    seen.add(src)
    files.push({
      filename: filenameFromHref(src),
      sourceUrl: src,
      mimeType: 'application/pdf',
      kind: 'pdf',
    })
  }

  window.__teepoScan = {
    source: location.hostname,
    courseId: null,
    courseName: document.title.slice(0, 80),
    files,
  }
})()
