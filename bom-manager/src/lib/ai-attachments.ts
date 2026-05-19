/**
 * Attachment helpers for the AI chat.
 *
 *   - Images:  read as base64 data URL → sent to the model as an
 *              `image_url` content part. Vision-capable models receive
 *              the picture directly.
 *
 *   - PDFs:    text-extracted in the browser via pdf.js (loaded lazily
 *              from a CDN so we don't bulk up the bundle). Extracted
 *              text is appended to the user message as plain text.
 *
 * Hard limits to keep payloads sane:
 *   - max image size: 8 MB before encoding (configurable).
 *   - max PDF text:   200 000 chars.
 */

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024
export const MAX_PDF_TEXT_CHARS = 200_000
// v3.x ships UMD that loads via a classic <script> tag. v4+ is ESM-only.
export const PDFJS_VERSION = '3.11.174'
const PDFJS_SOURCES = [
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`,
  `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build`,
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build`,
]

export interface ImageAttachment {
  kind: 'image'
  name: string
  size: number
  dataUrl: string  // base64 data URL e.g. "data:image/png;base64,..."
}

export interface PDFAttachment {
  kind: 'pdf'
  name: string
  size: number
  pageCount: number
  text: string
  truncated: boolean
}

export type Attachment = ImageAttachment | PDFAttachment

export function isImageFile(f: File) {
  return f.type.startsWith('image/')
}
export function isPDFFile(f: File) {
  return f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
}

export async function fileToImageAttachment(f: File): Promise<ImageAttachment> {
  if (f.size > MAX_IMAGE_BYTES) {
    throw new Error(`Image is ${(f.size / 1024 / 1024).toFixed(1)} MB — limit is ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`)
  }
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(f)
  })
  return { kind: 'image', name: f.name, size: f.size, dataUrl }
}

let pdfjsLoadingPromise: Promise<any> | null = null

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })
}

async function loadPdfJs(): Promise<any> {
  if ((window as any).pdfjsLib) return (window as any).pdfjsLib
  if (pdfjsLoadingPromise) return pdfjsLoadingPromise

  pdfjsLoadingPromise = (async () => {
    let lastErr: any = null
    for (const base of PDFJS_SOURCES) {
      try {
        await loadScript(`${base}/pdf.min.js`)
        const lib = (window as any).pdfjsLib
        if (!lib) throw new Error('pdf.min.js loaded but window.pdfjsLib is missing')
        lib.GlobalWorkerOptions.workerSrc = `${base}/pdf.worker.min.js`
        return lib
      } catch (e) {
        lastErr = e
        // try next CDN
      }
    }
    throw new Error(
      `Could not load pdf.js from any CDN. Last error: ${lastErr?.message || lastErr}. ` +
      `Check the browser console for blocked requests (CSP, ad-blocker, offline).`,
    )
  })()

  pdfjsLoadingPromise.catch(() => { pdfjsLoadingPromise = null })  // allow retry next time
  return pdfjsLoadingPromise
}

function textContentToLines(items: any[]) {
  const rows: Array<{ y: number; items: Array<{ x: number; text: string }> }> = []
  const yTolerance = 3

  for (const item of items) {
    const text = String(item?.str || '').trim()
    if (!text) continue
    const transform = item?.transform || []
    const x = Number(transform[4] || 0)
    const y = Number(transform[5] || 0)
    let row = rows.find(r => Math.abs(r.y - y) <= yTolerance)
    if (!row) {
      row = { y, items: [] }
      rows.push(row)
    }
    row.items.push({ x, text })
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map(row => row.items.sort((a, b) => a.x - b.x).map(item => item.text).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

export async function fileToPDFAttachment(f: File): Promise<PDFAttachment> {
  const pdfjs = await loadPdfJs()
  const buf = await f.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: buf }).promise
  const pageCount = doc.numPages
  const parts: string[] = []
  let truncated = false
  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i)
    const tc = await page.getTextContent()
    const txt = textContentToLines(tc.items || [])
    parts.push(`\n\n----- Page ${i} -----\n${txt}`)
    if (parts.join('').length > MAX_PDF_TEXT_CHARS) {
      truncated = true
      break
    }
  }
  let text = parts.join('')
  if (text.length > MAX_PDF_TEXT_CHARS) {
    text = text.slice(0, MAX_PDF_TEXT_CHARS)
    truncated = true
  }
  return { kind: 'pdf', name: f.name, size: f.size, pageCount, text, truncated }
}

export async function fileToAttachment(f: File): Promise<Attachment> {
  if (isImageFile(f)) return fileToImageAttachment(f)
  if (isPDFFile(f)) return fileToPDFAttachment(f)
  throw new Error(`Unsupported file type: ${f.type || f.name}`)
}
