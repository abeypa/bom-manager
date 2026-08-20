import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')
const MASTER_PART_TABLES = [
  'mechanical_manufacture',
  'mechanical_bought_out',
  'electrical_manufacture',
  'electrical_bought_out',
  'pneumatic_bought_out',
]

const TABLE_CONFIG = {
  suppliers: {
    updatedField: 'updated_date',
    columns: ['id', 'name', 'contact_person', 'email', 'phone', 'address', 'payment_terms', 'notes'],
    rules: [
      { field: 'name', kind: 'text', required: true },
      { field: 'contact_person', kind: 'text' },
      { field: 'email', kind: 'email' },
      { field: 'phone', kind: 'text' },
      { field: 'address', kind: 'text' },
      { field: 'payment_terms', kind: 'text' },
      { field: 'notes', kind: 'text' },
    ],
    duplicate: { field: 'name' },
  },
  profiles: {
    updatedField: 'updated_at',
    columns: ['id', 'full_name', 'email', 'role'],
    rules: [
      { field: 'full_name', kind: 'text' },
      { field: 'email', kind: 'email' },
      { field: 'role', kind: 'code', required: true },
    ],
    duplicate: { field: 'email' },
  },
  projects: {
    updatedField: 'updated_date',
    columns: ['id', 'project_name', 'project_number', 'customer', 'description', 'status'],
    rules: [
      { field: 'project_name', kind: 'text', required: true },
      { field: 'project_number', kind: 'code', required: true },
      { field: 'customer', kind: 'text' },
      { field: 'description', kind: 'text' },
      { field: 'status', kind: 'code', required: true },
    ],
    duplicate: { field: 'project_number' },
  },
  project_sections: {
    columns: ['id', 'project_id', 'name', 'order_index'],
    rules: [
      { field: 'name', kind: 'text', required: true },
    ],
    duplicate: { field: 'name', scope: ['project_id'] },
  },
  project_subsections: {
    updatedField: 'updated_date',
    columns: ['id', 'project_id', 'section_id', 'section_name', 'description', 'status'],
    rules: [
      { field: 'section_name', kind: 'text', required: true },
      { field: 'description', kind: 'text' },
      { field: 'status', kind: 'code', required: true },
    ],
    duplicate: { field: 'section_name', scope: ['section_id'] },
  },
  purchase_orders: {
    updatedField: 'updated_date',
    columns: ['id', 'po_number', 'currency', 'status', 'notes', 'terms', 'project_id', 'supplier_id'],
    rules: [
      { field: 'po_number', kind: 'code', required: true },
      { field: 'currency', kind: 'currency', required: true },
      { field: 'status', kind: 'code', required: true },
      { field: 'notes', kind: 'text' },
      { field: 'terms', kind: 'text' },
    ],
    duplicate: { field: 'po_number' },
  },
  mechanical_manufacture: partTableConfig(),
  mechanical_bought_out: partTableConfig(),
  electrical_manufacture: partTableConfig(),
  electrical_bought_out: partTableConfig(),
  pneumatic_bought_out: partTableConfig(),
}

function partTableConfig() {
  return {
    updatedField: 'updated_date',
    columns: [
      'id',
      'part_number',
      'beperp_part_no',
      'description',
      'currency',
      'manufacturer',
      'manufacturer_part_number',
      'vendor_part_number',
      'lead_time',
    ],
    rules: [
      { field: 'part_number', kind: 'code', required: true },
      { field: 'beperp_part_no', kind: 'code' },
      { field: 'description', kind: 'text' },
      { field: 'currency', kind: 'currency', required: true },
      { field: 'manufacturer', kind: 'text' },
      { field: 'manufacturer_part_number', kind: 'code' },
      { field: 'vendor_part_number', kind: 'code' },
      { field: 'lead_time', kind: 'text' },
    ],
    duplicate: { field: 'part_number' },
  }
}

function parseArgs(argv) {
  const [command = 'audit', ...rest] = argv
  const options = {
    command,
    apply: false,
    help: false,
    tables: null,
  }

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i]
    if (arg === '--apply') options.apply = true
    else if (arg === '--help') options.help = true
    else if (arg === '--table') {
      options.tables = (rest[i + 1] || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
      i += 1
    }
  }

  return options
}

function printHelp() {
  console.log(`Usage:
  node scripts/supabase_data_admin.mjs audit [--table suppliers,projects]
  node scripts/supabase_data_admin.mjs normalize [--table suppliers,projects] [--apply]

Environment:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Behavior:
  - audit: read-only report on duplicates, hierarchy issues, and safe cleanup opportunities
  - normalize: previews safe normalization candidates, or applies them with --apply

Examples:
  npm run db:audit
  npm run db:audit -- --table suppliers,projects
  npm run db:normalize
  npm run db:normalize -- --apply`)
}

function loadEnvFile(filename) {
  const path = resolve(PROJECT_ROOT, filename)
  if (!existsSync(path)) return

  const content = readFileSync(path, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) continue

    const key = line.slice(0, separatorIndex).trim()
    if (process.env[key] != null) continue

    let value = line.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    process.env[key] = value
  }
}

function loadLocalEnv() {
  loadEnvFile('.env')
  loadEnvFile('.env.local')
  loadEnvFile('.env.production')
}

function collapseWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeFieldValue(value, rule) {
  if (value == null) return { value: null, blankRequired: Boolean(rule.required) }

  const raw = String(value)
  let normalized = raw

  if (rule.kind === 'text') normalized = collapseWhitespace(raw)
  else if (rule.kind === 'code') normalized = raw.trim()
  else if (rule.kind === 'email') normalized = collapseWhitespace(raw).toLowerCase()
  else if (rule.kind === 'currency') normalized = raw.trim().toUpperCase()

  if (!normalized) {
    if (rule.required) {
      return { value, blankRequired: true }
    }
    return { value: null, blankRequired: false }
  }

  return { value: normalized, blankRequired: false }
}

function normalizeDuplicateKey(value, rule) {
  const normalized = normalizeFieldValue(value, rule).value
  if (normalized == null) return ''
  if (rule.kind === 'code' || rule.kind === 'currency' || rule.kind === 'email') {
    return String(normalized).toUpperCase()
  }
  return collapseWhitespace(String(normalized)).toLowerCase()
}

function valuesEqual(left, right) {
  return left === right || (left == null && right == null)
}

async function fetchAllRows(supabase, table, columns) {
  const rows = []
  const pageSize = 1000

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns.join(', '))
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error) throw error
    const batch = data || []
    rows.push(...batch)
    if (batch.length < pageSize) break
  }

  return rows
}

function createDuplicateIndex(rows, config) {
  if (!config.duplicate) return { groups: [], conflictedRowIds: new Set() }

  const rule = config.rules.find((item) => item.field === config.duplicate.field)
  const groups = new Map()

  for (const row of rows) {
    const scope = (config.duplicate.scope || []).map((field) => String(row[field] ?? ''))
    const normalized = normalizeDuplicateKey(row[config.duplicate.field], rule)
    const key = [...scope, normalized].join('|')
    if (!normalized) continue

    const bucket = groups.get(key) || []
    bucket.push(row)
    groups.set(key, bucket)
  }

  const duplicateGroups = []
  const conflictedRowIds = new Set()

  for (const rowsInGroup of groups.values()) {
    if (rowsInGroup.length < 2) continue
    rowsInGroup.forEach((row) => conflictedRowIds.add(row.id))
    duplicateGroups.push({
      normalized_key: normalizeDuplicateKey(rowsInGroup[0][config.duplicate.field], rule),
      row_count: rowsInGroup.length,
      ids: rowsInGroup.map((row) => row.id),
      values: rowsInGroup.map((row) => row[config.duplicate.field]),
      scope: Object.fromEntries((config.duplicate.scope || []).map((field) => [field, rowsInGroup[0][field]])),
    })
  }

  return { groups: duplicateGroups, conflictedRowIds }
}

function buildNormalizationPlan(rows, config, duplicateIndex) {
  const updates = []
  const sampleUpdates = []
  const blankRequired = []
  let blockedKeyFieldUpdates = 0

  for (const row of rows) {
    const patch = {}
    const changedFields = []

    for (const rule of config.rules) {
      const normalized = normalizeFieldValue(row[rule.field], rule)
      if (normalized.blankRequired) {
        blankRequired.push({ id: row.id, field: rule.field, value: row[rule.field] })
        continue
      }

      if (valuesEqual(row[rule.field], normalized.value)) continue

      const isDuplicateKeyField = config.duplicate?.field === rule.field
      if (isDuplicateKeyField && duplicateIndex.conflictedRowIds.has(row.id)) {
        blockedKeyFieldUpdates += 1
        continue
      }

      patch[rule.field] = normalized.value
      changedFields.push({
        field: rule.field,
        before: row[rule.field],
        after: normalized.value,
      })
    }

    if (!changedFields.length) continue
    if (config.updatedField) patch[config.updatedField] = new Date().toISOString()

    updates.push({ id: row.id, patch, changedFields })
    if (sampleUpdates.length < 10) {
      sampleUpdates.push({ id: row.id, changed_fields: changedFields })
    }
  }

  return {
    updates,
    sampleUpdates,
    blankRequired,
    blockedKeyFieldUpdates,
  }
}

async function runTableAudit(supabase, table, config, apply) {
  try {
    const rows = await fetchAllRows(supabase, table, config.columns)
    const duplicateIndex = createDuplicateIndex(rows, config)
    const plan = buildNormalizationPlan(rows, config, duplicateIndex)

    let applied = 0
    const errors = []

    if (apply) {
      for (const update of plan.updates) {
        const { error } = await supabase.from(table).update(update.patch).eq('id', update.id)
        if (error) {
          errors.push({ id: update.id, message: error.message })
          continue
        }
        applied += 1
      }
    }

    return {
      ok: true,
      rows_scanned: rows.length,
      normalization: {
        safe_update_candidates: plan.updates.length,
        applied_updates: applied,
        blocked_duplicate_key_updates: plan.blockedKeyFieldUpdates,
        blank_required_values: plan.blankRequired.slice(0, 20),
        duplicate_groups: duplicateIndex.groups.slice(0, 20),
        sample_updates: plan.sampleUpdates,
      },
      errors,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function fetchIdSet(supabase, table, idColumn = 'id') {
  const rows = await fetchAllRows(supabase, table, [idColumn])
  return new Set(rows.map((row) => row[idColumn]))
}

async function runIntegrityAudit(supabase) {
  try {
    const [projects, sections, subsections, projectParts, purchaseOrders, suppliers] = await Promise.all([
      fetchAllRows(supabase, 'projects', ['id']),
      fetchAllRows(supabase, 'project_sections', ['id', 'project_id', 'name']),
      fetchAllRows(supabase, 'project_subsections', ['id', 'project_id', 'section_id', 'section_name']),
      fetchAllRows(supabase, 'project_parts', ['id', 'project_section_id', 'part_type', 'part_id']),
      fetchAllRows(supabase, 'purchase_orders', ['id', 'project_id', 'supplier_id', 'po_number']),
      fetchAllRows(supabase, 'suppliers', ['id']),
    ])

    const projectIds = new Set(projects.map((row) => row.id))
    const supplierIds = new Set(suppliers.map((row) => row.id))
    const sectionMap = new Map(sections.map((row) => [row.id, row]))
    const subsectionMap = new Map(subsections.map((row) => [row.id, row]))

    const masterPartIds = {}
    for (const table of MASTER_PART_TABLES) {
      masterPartIds[table] = await fetchIdSet(supabase, table)
    }

    const sectionsMissingProject = sections
      .filter((row) => !projectIds.has(row.project_id))
      .slice(0, 20)

    const subsectionsMissingProject = subsections
      .filter((row) => !projectIds.has(row.project_id))
      .slice(0, 20)

    const subsectionsMissingSection = subsections
      .filter((row) => row.section_id == null || !sectionMap.has(row.section_id))
      .slice(0, 20)

    const subsectionsProjectMismatch = subsections
      .filter((row) => row.section_id != null && sectionMap.has(row.section_id) && sectionMap.get(row.section_id).project_id !== row.project_id)
      .slice(0, 20)

    const projectPartsMissingSubsection = projectParts
      .filter((row) => !subsectionMap.has(row.project_section_id))
      .slice(0, 20)

    const projectPartsUnknownType = projectParts
      .filter((row) => !MASTER_PART_TABLES.includes(String(row.part_type || '')))
      .slice(0, 20)

    const projectPartsMissingMasterReference = projectParts
      .filter((row) => MASTER_PART_TABLES.includes(String(row.part_type || '')) && !masterPartIds[row.part_type]?.has(row.part_id))
      .slice(0, 20)

    const purchaseOrdersMissingProject = purchaseOrders
      .filter((row) => row.project_id == null || !projectIds.has(row.project_id))
      .slice(0, 20)

    const purchaseOrdersMissingSupplier = purchaseOrders
      .filter((row) => row.supplier_id == null || !supplierIds.has(row.supplier_id))
      .slice(0, 20)

    return {
      ok: true,
      sections_missing_project: {
        count: sections.filter((row) => !projectIds.has(row.project_id)).length,
        sample: sectionsMissingProject,
      },
      subsections_missing_project: {
        count: subsections.filter((row) => !projectIds.has(row.project_id)).length,
        sample: subsectionsMissingProject,
      },
      subsections_missing_section: {
        count: subsections.filter((row) => row.section_id == null || !sectionMap.has(row.section_id)).length,
        sample: subsectionsMissingSection,
      },
      subsections_project_mismatch: {
        count: subsections.filter((row) => row.section_id != null && sectionMap.has(row.section_id) && sectionMap.get(row.section_id).project_id !== row.project_id).length,
        sample: subsectionsProjectMismatch,
      },
      project_parts_missing_subsection: {
        count: projectParts.filter((row) => !subsectionMap.has(row.project_section_id)).length,
        sample: projectPartsMissingSubsection,
      },
      project_parts_unknown_part_type: {
        count: projectParts.filter((row) => !MASTER_PART_TABLES.includes(String(row.part_type || ''))).length,
        sample: projectPartsUnknownType,
      },
      project_parts_missing_master_reference: {
        count: projectParts.filter((row) => MASTER_PART_TABLES.includes(String(row.part_type || '')) && !masterPartIds[row.part_type]?.has(row.part_id)).length,
        sample: projectPartsMissingMasterReference,
      },
      purchase_orders_missing_project: {
        count: purchaseOrders.filter((row) => row.project_id == null || !projectIds.has(row.project_id)).length,
        sample: purchaseOrdersMissingProject,
      },
      purchase_orders_missing_supplier: {
        count: purchaseOrders.filter((row) => row.supplier_id == null || !supplierIds.has(row.supplier_id)).length,
        sample: purchaseOrdersMissingSupplier,
      },
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function main() {
  loadLocalEnv()

  const options = parseArgs(process.argv.slice(2))
  if (options.help || !['audit', 'normalize'].includes(options.command)) {
    printHelp()
    if (!options.help && !['audit', 'normalize'].includes(options.command)) process.exitCode = 1
    return
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required.')
  }

  const selectedTables = options.tables?.length
    ? options.tables
    : Object.keys(TABLE_CONFIG)

  const invalidTables = selectedTables.filter((table) => !TABLE_CONFIG[table])
  if (invalidTables.length) {
    throw new Error(`Unknown table filter: ${invalidTables.join(', ')}`)
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const report = {
    mode: options.command === 'normalize' && options.apply ? 'write' : 'dry-run',
    command: options.command,
    generated_at: new Date().toISOString(),
    tables: {},
    integrity: null,
  }

  for (const table of selectedTables) {
    report.tables[table] = await runTableAudit(
      supabase,
      table,
      TABLE_CONFIG[table],
      options.command === 'normalize' && options.apply,
    )
  }

  report.integrity = await runIntegrityAudit(supabase)

  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
