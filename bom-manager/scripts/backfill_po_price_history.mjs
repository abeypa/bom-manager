import { createClient } from '@supabase/supabase-js'

const PART_TYPES = [
  'electrical_bought_out',
  'electrical_manufacture',
  'mechanical_bought_out',
  'mechanical_manufacture',
  'pneumatic_bought_out',
]

const CHARGE_LINE_RE =
  /\b(packing|forwarding|freight|insurance|transport|loading|unloading|cd applicable|cash discount|commercial adjustment|discount|round ?off)\b/i

function parseArgs(argv) {
  const options = {
    dryRun: false,
    poNumber: null,
    limit: null,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--po-number') options.poNumber = argv[i + 1] || null, i += 1
    else if (arg === '--limit') options.limit = Number(argv[i + 1] || 0) || null, i += 1
    else if (arg === '--help') options.help = true
  }

  return options
}

function printHelp() {
  console.log(`Usage:
  node scripts/backfill_po_price_history.mjs [--dry-run] [--po-number PO/P/25-26/100077] [--limit 50]

Environment:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Behavior:
  - Reads parsed PO ingestion documents and lines already stored in the database
  - Resolves each material line to a master part
  - Writes part_price_history snapshots using the PDF PO date and price
  - Skips misc/commercial charge lines
  - Is idempotent for the same part / PO / date / price / currency / discount combination`)
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeCode(value) {
  return normalizeText(value).toUpperCase()
}

function normalizeDate(value) {
  const raw = normalizeText(value)
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return raw
  return parsed.toISOString().slice(0, 10)
}

function money(value) {
  return Number(value || 0).toFixed(2)
}

function shouldSkipLine(line) {
  const haystack = `${line.item_code || ''} ${line.description || ''} ${line.raw_line || ''}`
  return CHARGE_LINE_RE.test(haystack)
}

async function fetchDocuments(supabase, options) {
  let query = supabase
    .from('po_ingestion_documents')
    .select('id, po_number, po_date, currency, parse_status, file_name')
    .eq('parse_status', 'parsed')
    .order('po_date', { ascending: true, nullsFirst: false })

  if (options.poNumber) query = query.eq('po_number', options.poNumber)
  if (options.limit) query = query.limit(options.limit)

  const { data, error } = await query
  if (error) throw error
  return data || []
}

async function fetchLinesForDocuments(supabase, documentIds) {
  if (!documentIds.length) return []

  const { data, error } = await supabase
    .from('po_ingestion_lines')
    .select([
      'id',
      'document_id',
      'line_no',
      'item_code',
      'description',
      'unit_price',
      'discount_percent',
      'currency',
      'raw_line',
      'matched_part_type',
      'matched_part_id',
      'selected_part_type',
    ].join(', '))
    .in('document_id', documentIds)
    .order('document_id', { ascending: true })
    .order('line_no', { ascending: true })

  if (error) throw error
  return data || []
}

async function resolvePartByCode(supabase, caches, preferredType, itemCode) {
  const code = normalizeCode(itemCode)
  if (!code) return null

  const lookupTypes = preferredType
    ? [preferredType, ...PART_TYPES.filter((type) => type !== preferredType)]
    : PART_TYPES

  for (const partType of lookupTypes) {
    const cacheKey = `${partType}:${code}`
    if (caches.masterLookup.has(cacheKey)) {
      const cached = caches.masterLookup.get(cacheKey)
      if (cached) return { ...cached, part_type: partType }
      continue
    }

    const { data, error } = await supabase
      .from(partType)
      .select('id, part_number, beperp_part_no, base_price, currency, discount_percent')
      .eq('beperp_part_no', code)
      .limit(2)

    if (error) throw error

    if (data && data.length === 1) {
      const row = data[0]
      caches.masterLookup.set(cacheKey, row)
      return { ...row, part_type: partType }
    }

    caches.masterLookup.set(cacheKey, null)
  }

  return null
}

async function historyEntryExists(supabase, entry, caches) {
  const key = [
    entry.part_table_name,
    entry.part_id,
    entry.change_reason,
    normalizeDate(entry.changed_at),
    money(entry.new_price),
    entry.new_currency,
    Number(entry.new_discount_percent || 0).toFixed(2),
  ].join('|')

  if (caches.historyExists.has(key)) return caches.historyExists.get(key)

  const { data, error } = await supabase
    .from('part_price_history')
    .select('id')
    .eq('part_table_name', entry.part_table_name)
    .eq('part_id', entry.part_id)
    .eq('change_reason', entry.change_reason)
    .eq('changed_at', entry.changed_at)
    .eq('new_price', entry.new_price)
    .eq('new_currency', entry.new_currency)
    .eq('new_discount_percent', entry.new_discount_percent)
    .limit(1)

  if (error) throw error

  const exists = Boolean(data && data.length)
  caches.historyExists.set(key, exists)
  return exists
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const docs = await fetchDocuments(supabase, options)
  const lines = await fetchLinesForDocuments(supabase, docs.map((doc) => doc.id))
  const linesByDocumentId = new Map()
  const caches = {
    masterLookup: new Map(),
    historyExists: new Map(),
  }

  for (const line of lines) {
    const bucket = linesByDocumentId.get(line.document_id) || []
    bucket.push(line)
    linesByDocumentId.set(line.document_id, bucket)
  }

  let totalLines = 0
  let skippedChargeLines = 0
  let unresolvedLines = 0
  let existingSnapshots = 0
  let insertedSnapshots = 0
  const unresolved = []

  for (const doc of docs) {
    const docLines = linesByDocumentId.get(doc.id) || []

    for (const line of docLines) {
      totalLines += 1
      if (!line.item_code || line.unit_price == null) continue

      if (shouldSkipLine(line)) {
        skippedChargeLines += 1
        continue
      }

      let resolved = null

      if (line.matched_part_type && line.matched_part_id) {
        const { data, error } = await supabase
          .from(line.matched_part_type)
          .select('id, part_number, base_price, currency, discount_percent')
          .eq('id', line.matched_part_id)
          .maybeSingle()
        if (error) throw error
        if (data) {
          resolved = { ...data, part_type: line.matched_part_type }
        }
      }

      if (!resolved) {
        resolved = await resolvePartByCode(
          supabase,
          caches,
          line.selected_part_type || line.matched_part_type || null,
          line.item_code,
        )
      }

      if (!resolved) {
        unresolvedLines += 1
        unresolved.push({
          po_number: doc.po_number,
          po_date: doc.po_date,
          item_code: line.item_code,
          description: line.description,
          selected_part_type: line.selected_part_type || null,
        })
        continue
      }

      const entry = {
        part_table_name: resolved.part_type,
        part_id: resolved.id,
        part_number: resolved.part_number,
        old_price: resolved.base_price ?? null,
        new_price: Number(line.unit_price || 0),
        old_currency: resolved.currency || 'INR',
        new_currency: line.currency || doc.currency || 'INR',
        old_discount_percent: resolved.discount_percent ?? null,
        new_discount_percent: Number(line.discount_percent || 0),
        change_reason: doc.po_number
          ? `po_ingestion_snapshot:${doc.po_number}`
          : 'po_ingestion_snapshot',
        changed_at: normalizeDate(doc.po_date) || new Date().toISOString().slice(0, 10),
        changed_by: 'backfill_po_price_history',
      }

      if (await historyEntryExists(supabase, entry, caches)) {
        existingSnapshots += 1
        continue
      }

      if (!options.dryRun) {
        const { error } = await supabase.from('part_price_history').insert(entry)
        if (error) throw error
      }

      insertedSnapshots += 1
      caches.historyExists.set([
        entry.part_table_name,
        entry.part_id,
        entry.change_reason,
        normalizeDate(entry.changed_at),
        money(entry.new_price),
        entry.new_currency,
        Number(entry.new_discount_percent || 0).toFixed(2),
      ].join('|'), true)
    }
  }

  console.log(JSON.stringify({
    mode: options.dryRun ? 'dry-run' : 'write',
    documents_scanned: docs.length,
    lines_scanned: totalLines,
    charge_lines_skipped: skippedChargeLines,
    unresolved_lines: unresolvedLines,
    existing_snapshots: existingSnapshots,
    inserted_snapshots: insertedSnapshots,
    unresolved_preview: unresolved.slice(0, 20),
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
