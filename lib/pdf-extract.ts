/**
 * Client-side PDF text extraction using pdfjs-dist.
 *
 * Runs entirely in the browser — the PDF never leaves the user's device.
 * Returns the concatenated plaintext plus page count.
 */

// Cap extracted text per PDF so a giant textbook doesn't blow out the Drive DB.
// 200KB is ~50 pages of dense text — plenty for a lecture deck.
const MAX_CHARS = 200_000

export interface ExtractedPdf {
  text: string
  pages: number
  truncated: boolean
}

let workerConfigured = false

async function configureWorker() {
  if (workerConfigured) return
  const pdfjs = await import('pdfjs-dist')
  // Point pdfjs at the worker file bundled with the package. Using a blob URL
  // ensures the worker loads over the current origin and respects CSP.
  try {
    // @ts-expect-error — pdfjs ships a worker entry without types
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  } catch {
    // Fallback: use the unpkg CDN — works but requires internet
    pdfjs.GlobalWorkerOptions.workerSrc =
      `https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs`
  }
  workerConfigured = true
}

export async function extractPdfText(file: File): Promise<ExtractedPdf> {
  await configureWorker()
  const pdfjs = await import('pdfjs-dist')

  const buf = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: buf }).promise

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

  return {
    text: chunks.join(''),
    pages: pdf.numPages,
    truncated,
  }
}
