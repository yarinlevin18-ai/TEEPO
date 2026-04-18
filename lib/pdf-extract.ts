/**
 * Client-side PDF text extraction using pdfjs-dist.
 *
 * Runs entirely in the browser — the PDF never leaves the user's device.
 * Returns the concatenated plaintext plus page count.
 *
 * Worker strategy: we load the worker from jsDelivr with a pinned version.
 * We considered self-hosting it under /public but the pdfjs build ships as an
 * ES module (`.mjs`) and Next.js static hosting handles it fine either way.
 * jsDelivr is globally cached and survives rate limits better than unpkg.
 */

// Keep this in sync with package.json. Mismatch → worker/main version error.
const PDFJS_VERSION = '4.0.379'
const WORKER_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`

// Reject files over 50MB up front. A 50MB PDF is already ~1000 pages — way
// beyond what Claude can reason over anyway, and the browser memory spike is
// severe.
const MAX_FILE_BYTES = 50 * 1024 * 1024

// Cap extracted text per PDF so a giant textbook doesn't blow out the Drive DB.
// 200KB is ~50 pages of dense text — plenty for a lecture deck.
const MAX_CHARS = 200_000

export interface ExtractedPdf {
  text: string
  pages: number
  truncated: boolean
}

export class PdfExtractionError extends Error {
  kind: 'too_large' | 'password' | 'empty' | 'corrupt' | 'unknown'
  constructor(kind: PdfExtractionError['kind'], message: string) {
    super(message)
    this.kind = kind
    this.name = 'PdfExtractionError'
  }
}

let workerConfigured = false

async function configureWorker() {
  if (workerConfigured) return
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = WORKER_URL
  workerConfigured = true
}

export async function extractPdfText(file: File): Promise<ExtractedPdf> {
  if (file.size > MAX_FILE_BYTES) {
    throw new PdfExtractionError(
      'too_large',
      `הקובץ גדול מדי (${(file.size / 1024 / 1024).toFixed(1)}MB). ` +
      `הגבלה: 50MB. לפיצול קובץ גדול — פצל לפרקים והעלה כמקורות נפרדים.`,
    )
  }

  await configureWorker()
  const pdfjs = await import('pdfjs-dist')

  const buf = await file.arrayBuffer()
  let pdf
  try {
    pdf = await pdfjs.getDocument({
      data: buf,
      // Disable per-page rendering helpers we don't need — extraction only.
      disableFontFace: true,
      isEvalSupported: false,
    }).promise
  } catch (e: any) {
    const name = e?.name || ''
    if (name === 'PasswordException') {
      throw new PdfExtractionError('password', 'הקובץ מוגן בסיסמה. אי אפשר לחלץ ממנו טקסט.')
    }
    if (name === 'InvalidPDFException') {
      throw new PdfExtractionError('corrupt', 'הקובץ פגום או לא PDF תקין.')
    }
    throw new PdfExtractionError('unknown', e?.message || 'נכשל בקריאת ה-PDF')
  }

  const chunks: string[] = []
  let totalChars = 0
  let truncated = false

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((it: any) => ('str' in it ? it.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    const prefix = `\n\n--- עמוד ${i} ---\n`
    if (totalChars + prefix.length + pageText.length > MAX_CHARS) {
      const remaining = MAX_CHARS - totalChars - prefix.length
      if (remaining > 0) {
        chunks.push(prefix + pageText.slice(0, remaining))
      }
      truncated = true
      break
    }
    chunks.push(prefix + pageText)
    totalChars += prefix.length + pageText.length
  }

  const text = chunks.join('')
  if (!text.trim()) {
    throw new PdfExtractionError(
      'empty',
      'לא נמצא טקסט בקובץ. ייתכן שהוא סרוק (תמונות בלבד) — יש להפעיל OCR קודם.',
    )
  }

  return { text, pages: pdf.numPages, truncated }
}
