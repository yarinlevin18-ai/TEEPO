/**
 * Client-side PDF text extraction using pdfjs-dist, with OCR fallback
 * for scanned PDFs via tesseract.js.
 *
 * Runs entirely in the browser — the PDF never leaves the user's device.
 * Returns the concatenated plaintext plus page count.
 *
 * Two-pass strategy:
 *   1. Try pdfjs getTextContent() — fast (~1s) and works for born-digital PDFs.
 *   2. If the extracted text is empty OR suspiciously sparse (< MIN_CHARS_PER_PAGE
 *      on average), fall back to OCR: render each page to a canvas and run
 *      tesseract.js with Hebrew + English training data.
 *
 * OCR is SLOW (~5-15s per page on a laptop), so we:
 *   - Cap OCR'd files at MAX_OCR_PAGES pages
 *   - Expose a progress callback so the UI can show live status
 *   - Reuse a single worker across pages (init is the expensive bit)
 *
 * Worker strategy for pdfjs: we load the worker from jsDelivr with a pinned
 * version. jsDelivr is globally cached and survives rate limits better than
 * unpkg. Tesseract.js ships its own worker — we let it self-host.
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

// If the text pass returns fewer than this many chars per page on average,
// assume the PDF is scanned/image-only and try OCR. A normal slide has
// hundreds of chars; anything under 30 is basically "just a page number".
const MIN_CHARS_PER_PAGE = 30

// Cap OCR at a sane number of pages — each page takes 5-15s. Beyond this the
// user is better off uploading a smaller excerpt or doing OCR offline.
const MAX_OCR_PAGES = 30

// Render scale for OCR. 2.0 = 144dpi which is the sweet spot for tesseract:
// lower scale loses glyph detail, higher scale slows OCR down quadratically.
const OCR_RENDER_SCALE = 2.0

export interface ExtractedPdf {
  text: string
  pages: number
  truncated: boolean
  /** Set when the text came from OCR rather than embedded text layer. */
  usedOcr: boolean
}

export type ExtractProgress =
  | { phase: 'reading'; page?: number; total?: number }
  | { phase: 'ocr_init' }
  | { phase: 'ocr_page'; page: number; total: number }
  | { phase: 'done' }

export interface ExtractOptions {
  /** Called as the extractor moves through phases. Optional. */
  onProgress?: (p: ExtractProgress) => void
  /**
   * Disable the OCR fallback entirely. Useful if the caller wants a fast
   * text-only path and will handle the `empty` error itself.
   */
  disableOcr?: boolean
}

export class PdfExtractionError extends Error {
  kind: 'too_large' | 'password' | 'empty' | 'corrupt' | 'ocr_too_many_pages' | 'unknown'
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

export async function extractPdfText(
  file: File,
  opts: ExtractOptions = {},
): Promise<ExtractedPdf> {
  const { onProgress, disableOcr } = opts

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

  // ── Pass 1: embedded text layer ────────────────────────────────
  onProgress?.({ phase: 'reading', total: pdf.numPages })
  const chunks: string[] = []
  let totalChars = 0
  let truncated = false

  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.({ phase: 'reading', page: i, total: pdf.numPages })
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
  const plainChars = text.replace(/\s+/g, '').length
  const avgCharsPerPage = pdf.numPages > 0 ? plainChars / pdf.numPages : 0
  const looksScanned = !text.trim() || avgCharsPerPage < MIN_CHARS_PER_PAGE

  if (!looksScanned) {
    onProgress?.({ phase: 'done' })
    return { text, pages: pdf.numPages, truncated, usedOcr: false }
  }

  // ── Pass 2: OCR fallback ───────────────────────────────────────
  if (disableOcr) {
    throw new PdfExtractionError(
      'empty',
      'לא נמצא טקסט בקובץ. ייתכן שהוא סרוק (תמונות בלבד) — יש להפעיל OCR קודם.',
    )
  }

  if (pdf.numPages > MAX_OCR_PAGES) {
    throw new PdfExtractionError(
      'ocr_too_many_pages',
      `הקובץ נראה סרוק (${pdf.numPages} עמודים). OCR תומך עד ${MAX_OCR_PAGES} עמודים — ` +
      `פצל לקטעים קטנים יותר והעלה כמקורות נפרדים.`,
    )
  }

  const ocrText = await runOcrOnPdf(pdf, onProgress)
  if (!ocrText.trim()) {
    throw new PdfExtractionError(
      'empty',
      'OCR רץ אך לא זוהה טקסט בקובץ. ייתכן שהאיכות נמוכה מדי או שהקובץ ריק.',
    )
  }

  onProgress?.({ phase: 'done' })
  // OCR text is already per-page formatted inside runOcrOnPdf
  const trimmed = ocrText.length > MAX_CHARS ? ocrText.slice(0, MAX_CHARS) : ocrText
  return {
    text: trimmed,
    pages: pdf.numPages,
    truncated: ocrText.length > MAX_CHARS,
    usedOcr: true,
  }
}

/**
 * Render each page to a canvas and feed the canvas into tesseract.js.
 * Reuses a single worker — creating one is the expensive bit (~3s).
 */
async function runOcrOnPdf(
  pdf: any,
  onProgress?: (p: ExtractProgress) => void,
): Promise<string> {
  onProgress?.({ phase: 'ocr_init' })
  const { createWorker } = await import('tesseract.js')

  // Hebrew + English traineddata. These come from the tessdata CDN bundled
  // with tesseract.js — no extra config needed. First call downloads ~15MB
  // (cached by the browser afterwards).
  const worker = await createWorker(['heb', 'eng'])

  try {
    const pieces: string[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      onProgress?.({ phase: 'ocr_page', page: i, total: pdf.numPages })
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale: OCR_RENDER_SCALE })

      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('לא ניתן ליצור canvas לעיבוד OCR')

      await page.render({ canvasContext: ctx, viewport }).promise

      const { data } = await worker.recognize(canvas)
      const pageText = (data.text || '').replace(/\s+/g, ' ').trim()
      pieces.push(`\n\n--- עמוד ${i} (OCR) ---\n${pageText}`)

      // Release the canvas memory between pages.
      canvas.width = 0
      canvas.height = 0
    }
    return pieces.join('')
  } finally {
    await worker.terminate().catch(() => {})
  }
}
