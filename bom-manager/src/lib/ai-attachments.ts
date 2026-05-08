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
export const PDFJS_VERSION = '4.7.76'
export const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`

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

async function loadPdfJs(): Promise<any> {
  if ((window as any).pdfjsLib) return (window as any).pdfjsLib
  if (pdfjsLoadingPromise) return pdfjsLoadingPromise
  pdfjsLoadingPromise = new Promise<any>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = `${PDFJS_CDN}/pdf.min.js`
    s.onload = () => {
      const lib = (window as any).pdfjsLib
      if (!lib) {
        reject(new Error('pdf.js failed to load'))
        return
      }
      lib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.js`
      resolve(lib)
    }
    s.onerror = () => reject(new Error('Could not fetch pdf.js from CDN'))
    document.head.appendChild(s)
  })
  return pdfjsLoadingPromise
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
    const txt = tc.items.map((it: any) => it.str).join(' ')
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
