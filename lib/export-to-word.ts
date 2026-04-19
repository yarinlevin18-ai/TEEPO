/**
 * Export HTML notes to a Word-compatible document.
 *
 * Strategy: we wrap the HTML in a minimal "Word HTML" envelope and save it
 * with a `.doc` extension. Microsoft Word and Google Docs open this
 * natively as a proper document (preserving headings, lists, bold, italic,
 * alignment, RTL, etc.). No server round-trip, no extra dependency.
 *
 * If you later want true .docx (OOXML ZIP), swap this for the `docx` npm
 * package — the API is unchanged (still `exportToWord(html, title)`).
 */

interface WordExportOptions {
  /** Document title (used both in the file <title> and default filename). */
  title: string
  /** HTML body content (what the user wrote). */
  html: string
  /** RTL by default since this app is Hebrew-first. */
  rtl?: boolean
  /** Optional filename (without extension). Defaults to sanitized title. */
  filename?: string
}

/**
 * Trigger a browser download of an HTML-as-Word document.
 * Opens perfectly in MS Word, Google Docs, and LibreOffice Writer.
 */
export function exportNoteToWord(opts: WordExportOptions): void {
  const { title, html, rtl = true, filename } = opts

  const direction = rtl ? 'rtl' : 'ltr'
  const fontFamily = rtl
    ? "'David', 'Arial Hebrew', Arial, sans-serif"
    : "Arial, Helvetica, sans-serif"

  // Word HTML envelope — includes the xmlns declarations Word expects
  // so it opens the file as a native document rather than as raw HTML.
  const wordDoc = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<title>${escapeHtml(title)}</title>
<!--[if gte mso 9]>
<xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:Zoom>100</w:Zoom>
    <w:DoNotOptimizeForBrowser/>
  </w:WordDocument>
</xml>
<![endif]-->
<style>
  @page { size: A4; margin: 2.5cm; }
  body {
    font-family: ${fontFamily};
    font-size: 12pt;
    line-height: 1.6;
    color: #111;
    direction: ${direction};
    text-align: ${rtl ? 'right' : 'left'};
  }
  h1 { font-size: 22pt; color: #4c3db8; margin: 0 0 12pt; }
  h2 { font-size: 16pt; color: #6b5be5; margin: 18pt 0 8pt; }
  h3 { font-size: 13pt; color: #6b5be5; margin: 14pt 0 6pt; }
  p  { margin: 0 0 8pt; }
  ul, ol { margin: 0 0 8pt 0; padding-inline-start: 24pt; }
  li { margin-bottom: 4pt; }
  strong, b { font-weight: bold; }
  em, i { font-style: italic; }
  u { text-decoration: underline; }
  s, strike { text-decoration: line-through; }
  mark { background: #fff59d; padding: 0 2pt; }
  hr { border: 0; border-top: 1pt solid #999; margin: 12pt 0; }
  blockquote {
    border-inline-start: 3pt solid #8b7ff0;
    padding-inline-start: 10pt;
    margin: 8pt 0;
    color: #444;
  }
  .doc-meta {
    font-size: 9pt;
    color: #666;
    margin: 4pt 0 18pt;
    border-bottom: 1pt solid #ddd;
    padding-bottom: 6pt;
  }
</style>
</head>
<body dir="${direction}">
  <h1>${escapeHtml(title)}</h1>
  <p class="doc-meta">
    נוצר ב-${new Date().toLocaleDateString('he-IL')} · TEEPO
  </p>
  ${html}
</body>
</html>`

  const blob = new Blob([wordDoc], {
    type: 'application/msword;charset=utf-8',
  })

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${sanitizeFilename(filename || title) || 'סיכום'}.doc`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)

  // Release the blob on the next tick so older browsers get a chance to
  // start the download before the URL is revoked.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Escape text that goes directly into HTML (not the rich body). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Replace characters illegal in filenames across OSes. */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}
