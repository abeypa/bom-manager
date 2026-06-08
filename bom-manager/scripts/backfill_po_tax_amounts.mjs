import { createClient } from '@supabase/supabase-js'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

function parseArgs(argv) {
  const options = {
    dryRun: false,
    poNumber: null,
    limit: 50,
    onlyMissing: true,
    help: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--po-number') options.poNumber = argv[i + 1] || null, i += 1
    else if (arg === '--limit') options.limit = Number(argv[i + 1] || 50) || 50, i += 1
    else if (arg === '--include-filled') options.onlyMissing = false
    else if (arg === '--help') options.help = true
  }

  return options
}

function printHelp() {
  console.log(`Usage:
  node scripts/backfill_po_tax_amounts.mjs [--dry-run] [--po-number "PO/P/25-26/100077"] [--limit 50] [--include-filled]

Environment:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Behavior:
  - Finds purchase_orders that have an attached BEP PO PDF
  - Extracts text from each PDF via scripts/extract_pdf_text.py
  - Parses GST/CGST/SGST/IGST tax amount from the PDF, or derives it from total - subtotal/basic
  - Updates purchase_orders.tax_amount
  - Skips rows where tax cannot be determined and reports them for review`)
}

function parseNumber(value) {
  if (!value) return null
  const cleaned = String(value).replace(/[, ]/g, '').replace(/[^\d.-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return null
}

function extractExplicitTaxAmount(lines) {
  let total = 0
  let found = false

  for (const raw of lines) {
    const line = String(raw || '').trim()
    if (!line) continue
    if (/\btaxable\s+value\b/i.test(line) || /\btax description\b/i.test(line)) continue
    if (!/^(?:cgst|sgst|igst|gst|tax(?:\s+amount)?)(?:\b|[\s:()@-])/i.test(line)) continue

    const matches = [...line.matchAll(/[-+]?\d[\d,]*(?:\.\d+)?/g)]
    if (!matches.length) continue
    const amount = parseNumber(matches[matches.length - 1]?.[0] || null)
    if (amount == null) continue

    total += amount
    found = true
  }

  return found ? roundMoney(total) : null
}

function detectTaxAmount(text) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const totalAmount = parseNumber(firstMatch(text, [
    /\bgrand\s+total\s*[:\-]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i,
    /\btotal\s+amount\s*[:\-]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i,
    /\bnet\s+amount\s*[:\-]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i,
  ]))
  const basicAmount = parseNumber(firstMatch(text, [
    /\bbasic\s+amount\s*[:\-]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i,
    /\bbasic\s+value\s*[:\-]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i,
    /\bbasic\s+total\s*[:\-]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i,
  ]))
  const subtotal = parseNumber(firstMatch(text, [
    /\bsubtotal\s*[:\-]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i,
    /\btaxable\s+value\s*[:\-]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i,
  ]))

  const explicit = extractExplicitTaxAmount(lines)
  if (explicit != null) return explicit

  const basis = subtotal ?? basicAmount
  if (basis == null || totalAmount == null) return null

  const derived = roundMoney(totalAmount - basis)
  return derived > 0 ? derived : null
}

async function resolvePdfUrl(supabase, stored) {
  if (!stored) return ''
  if (!stored.startsWith('http')) {
    const { data, error } = await supabase.storage.from('drawings').createSignedUrl(stored, 3600)
    if (error) throw error
    return data.signedUrl
  }
  if (stored.includes('/storage/v1/object/sign/drawings/')) {
    const match = stored.match(/\/drawings\/(.+?)(?:\?|$)/)
    if (match) {
      const { data, error } = await supabase.storage.from('drawings').createSignedUrl(match[1], 3600)
      if (error) throw error
      return data.signedUrl
    }
  }
  return stored
}

function extractTextFromPdfBuffer(buffer) {
  const tempDir = mkdtempSync(join(tmpdir(), 'po-tax-backfill-'))
  const pdfPath = join(tempDir, 'source.pdf')

  try {
    writeFileSync(pdfPath, buffer)
    const stdout = execFileSync('python', ['scripts/extract_pdf_text.py', pdfPath], {
      encoding: 'utf8',
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const match = stdout.match(/-----BEGIN TEXT-----([\s\S]*?)-----END TEXT-----/)
    return match?.[1]?.trim() || ''
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

async function fetchTargetPOs(supabase, options) {
  let query = supabase
    .from('purchase_orders')
    .select('id, po_number, tax_amount, bep_po_pdf_url')
    .not('bep_po_pdf_url', 'is', null)
    .order('po_date', { ascending: false })
    .limit(options.limit)

  if (options.onlyMissing) query = query.is('tax_amount', null)
  if (options.poNumber) query = query.eq('po_number', options.poNumber)

  const { data, error } = await query
  if (error) throw error
  return data || []
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const targetPOs = await fetchTargetPOs(supabase, options)
  const results = []

  for (const po of targetPOs) {
    try {
      const pdfUrl = await resolvePdfUrl(supabase, po.bep_po_pdf_url)
      const response = await fetch(pdfUrl)
      if (!response.ok) throw new Error(`Failed to fetch PDF (${response.status})`)

      const text = extractTextFromPdfBuffer(Buffer.from(await response.arrayBuffer()))
      const taxAmount = detectTaxAmount(text)

      if (taxAmount == null) {
        results.push({
          po_id: po.id,
          po_number: po.po_number,
          status: 'skipped',
          previous_tax_amount: po.tax_amount,
          new_tax_amount: null,
          reason: 'Tax amount could not be parsed from PDF text.',
        })
        continue
      }

      if (!options.dryRun) {
        const { error } = await supabase
          .from('purchase_orders')
          .update({ tax_amount: taxAmount, updated_date: new Date().toISOString() })
          .eq('id', po.id)
        if (error) throw error
      }

      results.push({
        po_id: po.id,
        po_number: po.po_number,
        status: 'updated',
        previous_tax_amount: po.tax_amount,
        new_tax_amount: taxAmount,
        reason: options.dryRun ? 'Dry run only; DB not updated.' : undefined,
      })
    } catch (error) {
      results.push({
        po_id: po.id,
        po_number: po.po_number,
        status: 'failed',
        previous_tax_amount: po.tax_amount,
        new_tax_amount: null,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  console.log(JSON.stringify({
    mode: options.dryRun ? 'dry-run' : 'write',
    scanned: results.length,
    updated: results.filter((row) => row.status === 'updated').length,
    skipped: results.filter((row) => row.status === 'skipped').length,
    failed: results.filter((row) => row.status === 'failed').length,
    rows: results,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
