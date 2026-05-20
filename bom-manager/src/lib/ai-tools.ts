/**
 * AI agent tool registry.
 *
 * RULES (enforced here, not by the LLM):
 *   1. Tools tagged `read` execute immediately and return JSON to the model.
 *   2. Tools tagged `write` NEVER execute on their own. The model can only
 *      *propose* a write — the proposal is queued in the chat as a card with
 *      Approve / Reject buttons. The user must press Approve before the
 *      mutation actually runs against Supabase.
 *   3. Every tool input is validated against its declared schema before it
 *      is executed or queued. Unknown tools are rejected.
 *
 * Add new tools by appending to TOOL_REGISTRY below.
 */

import { reportsApi } from '@/api/reports'
import { dashboardApi } from '@/api/dashboard'
import { projectsApi } from '@/api/projects'
import { suppliersApi } from '@/api/suppliers'
import { purchaseOrdersApi } from '@/api/purchase-orders'
import { stockMovementsApi } from '@/api/stock-movements'
import { getPoRemainingForPart } from '@/api/po-payments'
import { supabase } from '@/lib/supabase'
import { auditPurchaseOrderPdf } from '@/lib/po-pdf-audit'
import { getSignedUrl } from '@/api/storage'
import { urlToPDFAttachment } from '@/lib/ai-attachments'
import { parsePurchaseOrderText } from '@/lib/po-ingestion-parser'

export type ToolKind = 'read' | 'write'

export interface ToolSpec {
  name: string
  kind: ToolKind
  description: string
  /** JSONSchema-style parameter shape sent to the LLM */
  parameters: Record<string, any>
  /** Renderer-friendly summary for the approval card (write tools only) */
  summarize?: (args: any) => string
  /**
   * Optional pre-flight validation for write tools. Runs at proposal time,
   * BEFORE the action is queued for user approval. If it throws, the
   * proposal is dropped and the error is fed back to the model so it can
   * re-plan (e.g. switch from create_master_part → update_master_part_price
   * when a duplicate is detected). Use this to surface conflicts the user
   * should not even see in the approval queue.
   */
  preflight?: (args: any) => Promise<void>
  /** Actual handler. For write tools this is invoked AFTER user approves. */
  handler: (args: any) => Promise<any>
}

const part_type_enum = [
  'mechanical_manufacture',
  'mechanical_bought_out',
  'electrical_manufacture',
  'electrical_bought_out',
  'pneumatic_bought_out',
]

/** Internal part-number prefix → part_type table mapping. */
export const PART_TYPE_BY_PREFIX: Record<string, string> = {
  EBO: 'electrical_bought_out',
  EMF: 'electrical_manufacture',
  MBO: 'mechanical_bought_out',
  MMF: 'mechanical_manufacture',
  PBO: 'pneumatic_bought_out',
}
export const PREFIX_BY_PART_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(PART_TYPE_BY_PREFIX).map(([k, v]) => [v, k]),
)

// ─── Software interlocks ────────────────────────────────────────────────────
// These run inside every write handler regardless of what the AI claims.
// If the AI proposes nonsense (negative price, missing supplier, empty name,
// duplicate row, etc.) the tool throws; the runner feeds the error back to
// the model, which is then expected to ask the user instead of retrying.

const MAX_QTY = 1_000_000
const MAX_PRICE = 1_000_000_000
const MAX_DESC_LEN = 2000
const IMAGE_EXT_RE = /\.(jpg|jpeg|png|webp)(\?|$)/i

function assertNonEmpty(field: string, v: any) {
  if (v == null || (typeof v === 'string' && v.trim() === '')) {
    throw new Error(`Validation: ${field} is required and cannot be empty.`)
  }
}
function assertNumberInRange(field: string, v: any, min: number, max: number) {
  if (typeof v !== 'number' || !Number.isFinite(v))
    throw new Error(`Validation: ${field} must be a finite number.`)
  if (v < min || v > max)
    throw new Error(`Validation: ${field} must be between ${min} and ${max} (got ${v}).`)
}
function assertInteger(field: string, v: any) {
  if (!Number.isInteger(v)) throw new Error(`Validation: ${field} must be an integer (got ${v}).`)
}
function assertMaxLen(field: string, v: any, max: number) {
  if (typeof v === 'string' && v.length > max)
    throw new Error(`Validation: ${field} is too long (${v.length} > ${max}).`)
}
async function assertRowExists(table: string, id: number, label?: string) {
  const { data } = await (supabase as any).from(table).select('id').eq('id', id).maybeSingle()
  if (!data) throw new Error(`${label || table} #${id} does not exist.`)
}

function extractLikelyCatalogNumbers(text: string): string[] {
  const matches = String(text || '').match(/\b[A-Z0-9]{2,}(?:[-/][A-Z0-9]+){1,}\b/gi) || []
  return Array.from(new Set(matches.map((m) => m.toUpperCase()).filter((m) => m.length >= 5))).slice(0, 5)
}

function buildProductImageQueries(query: string): string[] {
  const raw = String(query || '').trim()
  const normalized = raw.replace(/\s+/g, ' ')
  const catalogNumbers = extractLikelyCatalogNumbers(normalized)
  const derivedBrand =
    /\b(1732E|1734|20G|20-750|PowerFlex|PF750|ArmorBlock)\b/i.test(normalized) ? 'Allen Bradley' :
    /\bLIYCY\b/i.test(normalized) ? 'LAPP' :
    /\b(MS3102|MS3106|3101F|3106F)\b/i.test(normalized) ? 'Amphenol' :
    ''
  const queries = [
    normalized,
    ...catalogNumbers.flatMap((code) => [
      `${derivedBrand} ${code} product image`.trim(),
      `${code} product photo`,
      `${code} ${normalized}`,
    ]),
  ].filter(Boolean)
  return Array.from(new Set(queries)).slice(0, 8)
}

function industrialImageCandidates(query: string) {
  const codes = extractLikelyCatalogNumbers(query)
  const candidates: Array<{ url: string; source: string }> = []
  for (const code of codes) {
    if (/^(1732E|1734|20G|20-750)/i.test(code)) {
      candidates.push({
        url: `https://gesrepair.com/wp-content/uploads/2020/AB_Images/Allen-Bradley_${code}.jpg`,
        source: 'gesrepair-direct',
      })
    }
  }
  return candidates
}

function decodeImageUrl(url: string) {
  return url
    .replace(/\\u0026/g, '&')
    .replace(/\\/g, '')
}

function isUsefulImageUrl(url: string) {
  if (!url || url.includes('duckduckgo.com')) return false
  if (/logo|sprite|icon|placeholder|loading|no-image/i.test(url)) return false
  return IMAGE_EXT_RE.test(url) || /cloudinary|cdn|images|image|products|wp-content/i.test(url)
}

function normalizePartKey(value: any) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function normalizeManufacturerPartKey(value: any) {
  return normalizePartKey(
    String(value || '').replace(/\b(?:PDF|COPY|DUPLICATE|NEW)\b/gi, ''),
  )
}

function normalizeDescriptionKey(value: any) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 8)
    .join(' ')
}

function hasValue(value: any) {
  return value != null && String(value).trim() !== ''
}

function pickBestValue(keepValue: any, removeValue: any) {
  return hasValue(keepValue) ? keepValue : (hasValue(removeValue) ? removeValue : keepValue)
}

const BOUGHT_OUT_PART_TYPES = new Set(['mechanical_bought_out', 'electrical_bought_out', 'pneumatic_bought_out'])
const ACTIVE_PO_STATUSES = new Set(['Draft', 'Released', 'Pending', 'Sent', 'Confirmed', 'Partial', 'Received'])

const lineValue = (row: any) => {
  const qty = Number(row?.quantity || 0)
  const price = Number(row?.unit_price || 0)
  const disc = Number(row?.discount_percent || 0)
  return qty * price * (1 - disc / 100)
}

function percentChange(oldPrice: any, newPrice: any) {
  const oldValue = Number(oldPrice || 0)
  const newValue = Number(newPrice || 0)
  if (!oldValue || !Number.isFinite(oldValue) || !Number.isFinite(newValue)) return null
  return ((newValue - oldValue) / oldValue) * 100
}

function normalizeCode(value: any) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function codeMatches(left: any, right: any) {
  const a = normalizeCode(left)
  const b = normalizeCode(right)
  return Boolean(a && b && (a === b || a.endsWith(b) || b.endsWith(a)))
}

function normalizeSupplierText(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').replace(/[.,]/g, '').trim()
}

async function resolveStoredFileUrl(stored: string) {
  if (!stored) return ''
  if (!stored.startsWith('http')) return await getSignedUrl(stored, 3600) || stored
  if (stored.includes('/storage/v1/object/sign/drawings/')) {
    const match = stored.match(/\/drawings\/(.+?)(?:\?|$)/)
    if (match) return await getSignedUrl(match[1], 3600) || stored
  }
  return stored
}

async function fetchMasterDetailsByType(projectParts: any[]) {
  const idsByType: Record<string, number[]> = {}
  for (const part of projectParts) {
    if (!part.part_type || !part.part_id || !part_type_enum.includes(part.part_type)) continue
    if (!idsByType[part.part_type]) idsByType[part.part_type] = []
    idsByType[part.part_type].push(part.part_id)
  }

  const details: Record<string, Record<number, any>> = {}
  for (const [partType, ids] of Object.entries(idsByType)) {
    const uniqueIds = Array.from(new Set(ids))
    if (!uniqueIds.length) continue
    const { data, error } = await (supabase as any)
      .from(partType)
      .select('id, part_number, beperp_part_no, manufacturer_part_number, description, supplier_id, image_path, base_price, currency, updated_date, suppliers:supplier_id(name)')
      .in('id', uniqueIds)
    if (error) throw error
    details[partType] = Object.fromEntries((data || []).map((row: any) => [row.id, row]))
  }
  return details
}

async function buildBomHealthAudit(projectId?: number) {
  const projectQuery = (supabase as any)
    .from('projects')
    .select('id, project_name, project_number, status')
    .order('created_date', { ascending: false })
  const { data: projects, error: projectError } = projectId
    ? await projectQuery.eq('id', projectId)
    : await projectQuery.limit(50)
  if (projectError) throw projectError
  const projectRows = projects || []
  if (projectId && projectRows.length === 0) return { error: `Project #${projectId} not found.` }

  const projectIds = projectRows.map((p: any) => p.id)
  if (!projectIds.length) {
    return { checked_projects: 0, summary: {}, issues: {}, projects: [] }
  }

  const { data: subsections, error: subsectionError } = await (supabase as any)
    .from('project_subsections')
    .select('id, project_id, section_name')
    .in('project_id', projectIds)
  if (subsectionError) throw subsectionError

  const subsectionRows = subsections || []
  const subsectionIds = subsectionRows.map((s: any) => s.id)
  const subsectionToProject = new Map<number, any>(subsectionRows.map((s: any) => [s.id, s]))

  let projectParts: any[] = []
  if (subsectionIds.length) {
    const { data, error } = await (supabase as any)
      .from('project_parts')
      .select('id, project_section_id, part_type, part_id, quantity, unit_price, discount_percent')
      .in('project_section_id', subsectionIds)
    if (error) throw error
    projectParts = data || []
  }

  let poItems: any[] = []
  if (projectParts.length) {
    const { data } = await (supabase as any)
      .from('purchase_order_items')
      .select('id, project_part_id, purchase_orders(status, po_number)')
      .in('project_part_id', projectParts.map((p) => p.id))
    poItems = data || []
  }

  const masterDetails = await fetchMasterDetailsByType(projectParts)
  const orderedPartIds = new Set(
    poItems
      .filter((item: any) => ACTIVE_PO_STATUSES.has(item.purchase_orders?.status))
      .map((item: any) => item.project_part_id)
      .filter(Boolean)
  )

  const issues = {
    missing_images: [] as any[],
    missing_suppliers: [] as any[],
    zero_prices: [] as any[],
    duplicate_project_mappings: [] as any[],
    parts_without_po: [] as any[],
  }

  const projectSummaries = new Map<number, any>()
  for (const project of projectRows) {
    projectSummaries.set(project.id, {
      project_id: project.id,
      project_number: project.project_number,
      project_name: project.project_name,
      status: project.status,
      part_count: 0,
      bom_value: 0,
      issue_count: 0,
    })
  }

  const mappingGroups = new Map<string, any[]>()
  for (const part of projectParts) {
    const subsection = subsectionToProject.get(part.project_section_id)
    const project = projectSummaries.get(subsection?.project_id)
    const master = masterDetails[part.part_type]?.[part.part_id]
    if (!project) continue
    project.part_count += 1
    project.bom_value += lineValue(part)

    const issueBase = {
      project_id: project.project_id,
      project_number: project.project_number,
      project_name: project.project_name,
      project_part_id: part.id,
      part_type: part.part_type,
      part_id: part.part_id,
      part_number: master?.part_number || `${part.part_type} #${part.part_id}`,
      description: master?.description || '',
      subsection: subsection?.section_name || 'Unassigned',
    }

    if (BOUGHT_OUT_PART_TYPES.has(part.part_type) && !hasValue(master?.image_path)) {
      issues.missing_images.push(issueBase)
      project.issue_count += 1
    }
    if (!master?.supplier_id) {
      issues.missing_suppliers.push(issueBase)
      project.issue_count += 1
    }
    if (Number(part.unit_price || 0) <= 0 || Number(master?.base_price || 0) <= 0) {
      issues.zero_prices.push({ ...issueBase, project_price: part.unit_price || 0, master_price: master?.base_price || 0 })
      project.issue_count += 1
    }
    if (!orderedPartIds.has(part.id)) {
      issues.parts_without_po.push(issueBase)
      project.issue_count += 1
    }

    const groupKey = `${project.project_id}:${part.part_type}:${part.part_id}`
    if (!mappingGroups.has(groupKey)) mappingGroups.set(groupKey, [])
    mappingGroups.get(groupKey)!.push(issueBase)
  }

  for (const rows of mappingGroups.values()) {
    if (rows.length < 2) continue
    const project = projectSummaries.get(rows[0].project_id)
    if (project) project.issue_count += rows.length - 1
    issues.duplicate_project_mappings.push({
      project_id: rows[0].project_id,
      project_number: rows[0].project_number,
      project_name: rows[0].project_name,
      part_type: rows[0].part_type,
      part_id: rows[0].part_id,
      part_number: rows[0].part_number,
      occurrences: rows.length,
      project_part_ids: rows.map((r) => r.project_part_id),
      subsections: rows.map((r) => r.subsection),
    })
  }

  const trim = (rows: any[]) => rows.slice(0, 30)
  return {
    checked_projects: projectRows.length,
    checked_project_parts: projectParts.length,
    summary: {
      missing_images: issues.missing_images.length,
      missing_suppliers: issues.missing_suppliers.length,
      zero_prices: issues.zero_prices.length,
      duplicate_project_mappings: issues.duplicate_project_mappings.length,
      parts_without_po: issues.parts_without_po.length,
      total_issues:
        issues.missing_images.length +
        issues.missing_suppliers.length +
        issues.zero_prices.length +
        issues.duplicate_project_mappings.length +
        issues.parts_without_po.length,
    },
    projects: Array.from(projectSummaries.values())
      .sort((a, b) => b.issue_count - a.issue_count || b.bom_value - a.bom_value)
      .slice(0, 20),
    issues: {
      missing_images: trim(issues.missing_images),
      missing_suppliers: trim(issues.missing_suppliers),
      zero_prices: trim(issues.zero_prices),
      duplicate_project_mappings: trim(issues.duplicate_project_mappings),
      parts_without_po: trim(issues.parts_without_po),
    },
  }
}

async function buildExistingPoPdfCorrectionPlan(poId: number, allowDeleteReceivedLines = false) {
  assertInteger('po_id', poId)
  const { data: po, error: poError } = await (supabase as any)
    .from('purchase_orders')
    .select('*, suppliers(name), project:projects(id, project_name, project_number), purchase_order_items(*)')
    .eq('id', poId)
    .single()
  if (poError || !po) throw new Error(poError?.message || `PO #${poId} not found.`)
  if (!po.bep_po_pdf_url) throw new Error(`PO ${po.po_number} does not have a BEP PO PDF attached.`)
  if (po.status === 'Cancelled') throw new Error('Cancelled POs cannot be corrected by AI.')

  const pdfUrl = await resolveStoredFileUrl(po.bep_po_pdf_url)
  const pdf = await urlToPDFAttachment(pdfUrl, `${po.po_number}.pdf`)
  const parsed = parsePurchaseOrderText({
    fileName: pdf.name,
    fileSize: pdf.size,
    mimeType: 'application/pdf',
    pageCount: pdf.pageCount,
    text: pdf.text,
  })
  if (!parsed.lines.length) throw new Error('No PDF line items were detected. Run OCR or attach a clearer PDF before correction.')

  const dbSupplier = normalizeSupplierText(po.suppliers?.name || '')
  const pdfSupplier = normalizeSupplierText(parsed.supplier_name || '')
  if (dbSupplier && pdfSupplier && !dbSupplier.includes(pdfSupplier) && !pdfSupplier.includes(dbSupplier)) {
    throw new Error(`Supplier mismatch: DB supplier is "${po.suppliers?.name}", PDF supplier is "${parsed.supplier_name}".`)
  }

  const { data: subsections, error: subError } = await (supabase as any)
    .from('project_subsections')
    .select('id, project_id, section_name')
    .eq('project_id', po.project_id)
  if (subError) throw subError
  const subsectionIds = (subsections || []).map((s: any) => s.id)

  let projectParts: any[] = []
  if (subsectionIds.length) {
    const { data, error } = await (supabase as any)
      .from('project_parts')
      .select('id, project_section_id, part_type, part_id, quantity, unit_price, discount_percent')
      .in('project_section_id', subsectionIds)
    if (error) throw error
    projectParts = data || []
  }
  const masterDetails = await fetchMasterDetailsByType(projectParts)
  const projectCandidates = projectParts.map((projectPart) => {
    const master = masterDetails[projectPart.part_type]?.[projectPart.part_id]
    return {
      project_part: projectPart,
      master,
      part_number: master?.part_number || '',
      item_code: master?.beperp_part_no || master?.part_number?.split('-').at(-1) || '',
    }
  }).filter((candidate) => candidate.master)

  const oldItems = [...(po.purchase_order_items || [])]
  const usedOldIds = new Set<number>()
  const desiredItems: any[] = []
  const unresolved: any[] = []

  for (const line of parsed.lines) {
    const oldCandidates = oldItems
      .filter((item: any) => !usedOldIds.has(item.id) && (
        codeMatches(item.part_number, line.item_code) ||
        codeMatches(item.part_number?.split('-').at(-1), line.item_code)
      ))
      .sort((a: any, b: any) => {
        const aPrice = Math.abs(Number(a.unit_price || 0) - Number(line.unit_price || 0))
        const bPrice = Math.abs(Number(b.unit_price || 0) - Number(line.unit_price || 0))
        return aPrice - bPrice
      })
    const oldMatch = oldCandidates[0]
    if (oldMatch) usedOldIds.add(oldMatch.id)

    const projectMatch = oldMatch?.project_part_id
      ? projectCandidates.find((candidate) => candidate.project_part.id === oldMatch.project_part_id)
      : projectCandidates.find((candidate) =>
          codeMatches(candidate.item_code, line.item_code) ||
          codeMatches(candidate.part_number, line.item_code) ||
          codeMatches(candidate.part_number?.split('-').at(-1), line.item_code)
        )

    if (!projectMatch) {
      unresolved.push({
        line_no: line.line_no,
        item_code: line.item_code,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
        discount_percent: line.discount_percent,
        total_amount: line.total_amount,
        reason: 'No matching existing PO line or project BOM part was found.',
      })
      continue
    }

    const qty = Number(line.quantity || 0)
    const unitPrice = Number(line.unit_price || 0)
    const discount = Number(line.discount_percent || 0)
    const printedLineAmount = Number(line.total_amount || 0)
    if (qty <= 0 || unitPrice < 0 || discount < 0 || discount > 100) {
      unresolved.push({
        line_no: line.line_no,
        item_code: line.item_code,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
        discount_percent: line.discount_percent,
        total_amount: line.total_amount,
        reason: `Invalid quantity, price, or discount parsed from PDF: qty=${line.quantity}, unit=${line.unit_price}, disc=${line.discount_percent}.`,
      })
      continue
    }
    if (printedLineAmount <= 0) {
      unresolved.push({
        line_no: line.line_no,
        item_code: line.item_code,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
        discount_percent: line.discount_percent,
        total_amount: line.total_amount,
        reason: `Invalid printed line amount parsed from PDF: amount=${line.total_amount}.`,
      })
      continue
    }

    const receivedQty = Math.min(Number(oldMatch?.received_qty || 0), qty)
    desiredItems.push({
      old_item_id: oldMatch?.id || null,
      purchase_order_id: po.id,
      project_part_id: projectMatch.project_part.id,
      part_type: projectMatch.project_part.part_type,
      part_id: projectMatch.project_part.part_id,
      part_number: projectMatch.master.part_number,
      description: line.description || projectMatch.master.description || null,
      quantity: qty,
      received_qty: receivedQty,
      unit_price: unitPrice,
      discount_percent: discount,
      total_amount: printedLineAmount,
      pdf_line_no: line.line_no,
      pdf_item_code: line.item_code,
    })
  }

  if (unresolved.length) {
    return {
      ok_to_apply: false,
      po: { id: po.id, po_number: po.po_number, status: po.status, supplier: po.suppliers?.name, project: po.project },
      parsed_pdf: { po_number: parsed.po_number, supplier_name: parsed.supplier_name, line_count: parsed.lines.length },
      unresolved,
      message: 'Correction blocked until every PDF line is mapped to an existing project BOM part.',
    }
  }

  const extraItems = oldItems.filter((item: any) => !usedOldIds.has(item.id))
  const receivedExtraItems = extraItems.filter((item: any) => Number(item.received_qty || 0) > 0)
  if (receivedExtraItems.length && !allowDeleteReceivedLines) {
    return {
      ok_to_apply: false,
      po: { id: po.id, po_number: po.po_number, status: po.status, supplier: po.suppliers?.name, project: po.project },
      parsed_pdf: { po_number: parsed.po_number, supplier_name: parsed.supplier_name, line_count: parsed.lines.length },
      extra_items: extraItems.map((item: any) => ({
        id: item.id,
        part_number: item.part_number,
        quantity: item.quantity,
        received_qty: item.received_qty || 0,
        unit_price: item.unit_price,
      })),
      message: 'Correction would remove received PO lines. Re-run with allow_delete_received_lines=true if this is intentional.',
    }
  }

  const newGrand = desiredItems.reduce((sum, item) => sum + item.total_amount, 0)
  const pdfBasic = Number(parsed.basic_amount || 0)
  if (pdfBasic > 0 && Math.abs(newGrand - pdfBasic) > Math.max(5, pdfBasic * 0.02)) {
    return {
      ok_to_apply: false,
      po: {
        id: po.id,
        po_number: po.po_number,
        status: po.status,
        supplier: po.suppliers?.name,
        project: po.project,
        old_total: po.grand_total || 0,
        new_total: newGrand,
        old_line_count: oldItems.length,
        new_line_count: desiredItems.length,
      },
      parsed_pdf: {
        po_number: parsed.po_number,
        supplier_name: parsed.supplier_name,
        po_date: parsed.po_date,
        line_count: parsed.lines.length,
        basic_amount: parsed.basic_amount,
      },
      message: `Correction blocked: parsed line total ${newGrand.toFixed(2)} does not match PDF Basic Amount ${pdfBasic.toFixed(2)}.`,
    }
  }
  const inserts = desiredItems.filter((item) => !item.old_item_id).length
  const updates = desiredItems.filter((item) => item.old_item_id).length

  return {
    ok_to_apply: true,
    po: {
      id: po.id,
      po_number: po.po_number,
      status: po.status,
      supplier: po.suppliers?.name,
      project: po.project,
      old_total: po.grand_total || 0,
      new_total: newGrand,
      old_line_count: oldItems.length,
      new_line_count: desiredItems.length,
    },
    parsed_pdf: {
      po_number: parsed.po_number,
      supplier_name: parsed.supplier_name,
      po_date: parsed.po_date,
      line_count: parsed.lines.length,
    },
    changes: {
      update_lines: updates,
      insert_lines: inserts,
      delete_lines: extraItems.length,
      delete_received_lines: receivedExtraItems.length,
    },
    delete_item_ids: extraItems.map((item: any) => item.id),
    desired_items: desiredItems,
  }
}

function summarizePoCorrectionPlan(plan: any) {
  return {
    po_id: plan.po?.id,
    po_number: plan.po?.po_number,
    status: plan.po?.status,
    supplier: plan.po?.supplier,
    pdf_po_number: plan.parsed_pdf?.po_number,
    old_line_count: plan.po?.old_line_count,
    new_line_count: plan.po?.new_line_count ?? plan.parsed_pdf?.line_count,
    old_total: plan.po?.old_total,
    new_total: plan.po?.new_total,
    ok_to_apply: Boolean(plan.ok_to_apply),
    changes: plan.changes,
    unresolved_count: plan.unresolved?.length || 0,
    unresolved: (plan.unresolved || []).slice(0, 10).map((line: any) => ({
      line_no: line.line_no,
      item_code: line.item_code,
      description: line.description,
      quantity: line.quantity,
      unit_price: line.unit_price,
      discount_percent: line.discount_percent,
      total_amount: line.total_amount,
      reason: line.reason,
    })),
    extra_item_count: plan.extra_items?.length || plan.changes?.delete_lines || 0,
    extra_items: (plan.extra_items || []).slice(0, 10).map((item: any) => ({
      id: item.id,
      part_number: item.part_number,
      quantity: item.quantity,
      received_qty: item.received_qty || 0,
      unit_price: item.unit_price,
    })),
    message: plan.message,
  }
}

const FINAL_PO_REPAIR_STATUSES = ['Released', 'Pending', 'Sent', 'Confirmed', 'Partial', 'Received']

async function buildReleasedPoPdfRepairPreview(projectId: number, allowDeleteReceivedLines = true) {
  assertInteger('project_id', projectId)
  const { data: project } = await (supabase as any)
    .from('projects')
    .select('id, project_number, project_name')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) throw new Error(`Project #${projectId} not found.`)

  const { data: pos, error } = await (supabase as any)
    .from('purchase_orders')
    .select('id, po_number, status, supplier_id, bep_po_pdf_url, suppliers(name)')
    .eq('project_id', projectId)
    .in('status', FINAL_PO_REPAIR_STATUSES)
    .order('po_date', { ascending: false })
    .limit(150)
  if (error) throw error

  const missingPdf: any[] = []
  const ready: any[] = []
  const blocked: any[] = []

  for (const po of pos || []) {
    if (!po.bep_po_pdf_url) {
      missingPdf.push({
        po_id: po.id,
        po_number: po.po_number,
        status: po.status,
        supplier: po.suppliers?.name,
        issue: 'No BEP PO PDF attached.',
      })
      continue
    }

    try {
      const plan = await buildExistingPoPdfCorrectionPlan(po.id, allowDeleteReceivedLines)
      if (plan.ok_to_apply) ready.push(summarizePoCorrectionPlan(plan))
      else blocked.push(summarizePoCorrectionPlan(plan))
    } catch (err: any) {
      blocked.push({
        po_id: po.id,
        po_number: po.po_number,
        status: po.status,
        supplier: po.suppliers?.name,
        ok_to_apply: false,
        message: err?.message || String(err),
      })
    }
  }

  const totals = ready.reduce((acc: any, row: any) => {
    acc.update_lines += row.changes?.update_lines || 0
    acc.insert_lines += row.changes?.insert_lines || 0
    acc.delete_lines += row.changes?.delete_lines || 0
    acc.delete_received_lines += row.changes?.delete_received_lines || 0
    acc.old_total += Number(row.old_total || 0)
    acc.new_total += Number(row.new_total || 0)
    return acc
  }, {
    update_lines: 0,
    insert_lines: 0,
    delete_lines: 0,
    delete_received_lines: 0,
    old_total: 0,
    new_total: 0,
  })

  return {
    project,
    scope: 'Finalized/active POs only: Released, Pending, Sent, Confirmed, Partial, Received. Draft and Cancelled are excluded.',
    included_statuses: FINAL_PO_REPAIR_STATUSES,
    checked: (pos || []).length,
    ready_count: ready.length,
    blocked_count: blocked.length,
    missing_pdf_count: missingPdf.length,
    totals,
    ready,
    blocked,
    missing_pdf: missingPdf,
  }
}

async function applyExistingPoPdfCorrection(a: any) {
  assertInteger('po_id', a.po_id)
  const plan = await buildExistingPoPdfCorrectionPlan(a.po_id, Boolean(a.allow_delete_received_lines))
  if (!plan.ok_to_apply) {
    throw new Error(plan.message || 'PO PDF correction is not safe to apply yet.')
  }

  for (const item of plan.desired_items || []) {
    const row = {
      purchase_order_id: a.po_id,
      part_type: item.part_type,
      part_id: item.part_id,
      part_number: item.part_number,
      description: item.description,
      quantity: item.quantity,
      received_qty: item.received_qty || 0,
      unit_price: item.unit_price,
      discount_percent: item.discount_percent || 0,
      total_amount: item.total_amount,
      project_part_id: item.project_part_id,
    }

    if (item.old_item_id) {
      const { error } = await (supabase as any)
        .from('purchase_order_items')
        .update(row)
        .eq('id', item.old_item_id)
      if (error) throw error
    } else {
      const { error } = await (supabase as any)
        .from('purchase_order_items')
        .insert(row)
      if (error) throw error
    }
  }

  if ((plan.delete_item_ids || []).length) {
    const { error } = await (supabase as any)
      .from('purchase_order_items')
      .delete()
      .in('id', plan.delete_item_ids)
    if (error) throw error
  }

  const headerPatch: any = {
    updated_date: new Date().toISOString(),
  }
  if (a.correct_po_number !== false && plan.parsed_pdf?.po_number && /^PO\/.+\/\d+/i.test(plan.parsed_pdf.po_number)) {
    headerPatch.po_number = plan.parsed_pdf.po_number
  }
  if (a.correct_po_date !== false && plan.parsed_pdf?.po_date) {
    headerPatch.po_date = plan.parsed_pdf.po_date
  }
  if (Object.keys(headerPatch).length > 1) {
    const { error } = await (supabase as any)
      .from('purchase_orders')
      .update(headerPatch)
      .eq('id', a.po_id)
    if (error) throw error
  }

  const totals = await purchaseOrdersApi.recalcPOTotals(a.po_id)
  return {
    corrected: true,
    po_id: a.po_id,
    po_number: headerPatch.po_number || plan.po.po_number,
    status_unchanged: plan.po.status,
    line_count: plan.desired_items.length,
    changes: plan.changes,
    totals,
  }
}

async function getMasterPartForMerge(partType: string, partId: number) {
  assertInteger('part_id', partId)
  if (!part_type_enum.includes(partType)) throw new Error(`Unknown part_type: ${partType}`)
  const { data, error } = await (supabase as any)
    .from(partType)
    .select('*')
    .eq('id', partId)
    .single()
  if (error || !data) throw new Error(`${partType} #${partId} does not exist.`)
  return data
}

export const TOOL_REGISTRY: ToolSpec[] = [
  // ── READ ────────────────────────────────────────────────────────────────
  {
    name: 'list_projects',
    kind: 'read',
    description: 'List all projects with id, project_number, project_name, customer, status.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const projects = await projectsApi.getProjects()
      return projects.map((p: any) => ({
        id: p.id,
        project_number: p.project_number,
        project_name: p.project_name,
        customer: p.customer,
        status: p.status,
      }))
    },
  },
  {
    name: 'get_project_details',
    kind: 'read',
    description: 'Get a single project with its sections, subsections and BOM parts.',
    parameters: {
      type: 'object',
      required: ['project_id'],
      properties: { project_id: { type: 'number' } },
    },
    handler: async ({ project_id }: { project_id: number }) => {
      return await projectsApi.getProject(project_id)
    },
  },
  {
    name: 'get_project_financials',
    kind: 'read',
    description: 'Get BOM value, PO total, received and pending values per project. Optional filters.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: "Project status filter or 'all'" },
        customer: { type: 'string' },
      },
    },
    handler: async (args: any) => {
      return await reportsApi.getProjectFinancials({
        status: args.status || 'all',
        poStatus: 'all',
        customer: args.customer,
      })
    },
  },
  {
    name: 'get_reconciliation',
    kind: 'read',
    description: 'BOM vs PO per-part reconciliation. Optional project_id to scope.',
    parameters: {
      type: 'object',
      properties: { project_id: { type: 'number' } },
    },
    handler: async (args: any) => {
      const rows = await reportsApi.getReconciliation(args.project_id)
      return rows.filter(r => r.issue !== 'OK')
    },
  },
  {
    name: 'audit_bom_health',
    kind: 'read',
    description:
      'Run a smart read-only BOM health audit. Checks project parts for missing images, missing suppliers, zero prices, duplicate project mappings, and parts not linked to any active PO. Use project_id when the user selects a project; omit it for a cross-project scan.',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'number', description: 'Optional project id to audit one project.' },
      },
    },
    handler: async ({ project_id }: any) => {
      if (project_id != null) assertInteger('project_id', project_id)
      return await buildBomHealthAudit(project_id)
    },
  },
  {
    name: 'analyze_price_changes',
    kind: 'read',
    description:
      'Analyze recent part price history and return the biggest price increases/decreases. Use this for price watch, price spike, latest PO price intelligence, or procurement cost risk questions.',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', default: 90, description: 'How many recent days to scan.' },
        threshold_percent: { type: 'number', default: 10, description: 'Minimum absolute price change percentage to include.' },
        limit: { type: 'number', default: 25 },
      },
    },
    handler: async ({ days = 90, threshold_percent = 10, limit = 25 }: any) => {
      const scanDays = Math.max(1, Math.min(Number(days) || 90, 730))
      const threshold = Math.max(0, Math.min(Number(threshold_percent) || 10, 500))
      const maxRows = Math.max(1, Math.min(Number(limit) || 25, 100))
      const since = new Date(Date.now() - scanDays * 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await (supabase as any)
        .from('part_price_history')
        .select('id, part_table_name, part_id, part_number, old_price, new_price, old_currency, new_currency, old_discount_percent, new_discount_percent, change_reason, changed_at, changed_by')
        .gte('changed_at', since)
        .order('changed_at', { ascending: false })
        .limit(500)
      if (error) throw error

      const rows = (data || [])
        .map((row: any) => {
          const pct = percentChange(row.old_price, row.new_price)
          return {
            ...row,
            percent_change: pct == null ? null : Number(pct.toFixed(2)),
            direction: pct == null ? 'unknown' : pct > 0 ? 'increase' : pct < 0 ? 'decrease' : 'flat',
          }
        })
        .filter((row: any) => row.percent_change != null && Math.abs(row.percent_change) >= threshold)
        .sort((a: any, b: any) => Math.abs(b.percent_change) - Math.abs(a.percent_change))
        .slice(0, maxRows)

      return {
        scanned_days: scanDays,
        threshold_percent: threshold,
        spike_count: rows.length,
        increases: rows.filter((r: any) => r.direction === 'increase').length,
        decreases: rows.filter((r: any) => r.direction === 'decrease').length,
        price_changes: rows,
      }
    },
  },
  {
    name: 'analyze_supplier_intelligence',
    kind: 'read',
    description:
      'Analyze supplier procurement exposure: open PO value, draft value, overdue POs, PO count, and top follow-up suppliers. Can be filtered by supplier_id or project_id.',
    parameters: {
      type: 'object',
      properties: {
        supplier_id: { type: 'number' },
        project_id: { type: 'number' },
        limit: { type: 'number', default: 10 },
      },
    },
    handler: async ({ supplier_id, project_id, limit = 10 }: any) => {
      if (supplier_id != null) assertInteger('supplier_id', supplier_id)
      if (project_id != null) assertInteger('project_id', project_id)
      const maxRows = Math.max(1, Math.min(Number(limit) || 10, 50))
      let q = (supabase as any)
        .from('purchase_orders')
        .select('id, po_number, supplier_id, project_id, status, grand_total, po_date, expected_delivery_date, suppliers(name), project:projects(project_name, project_number)')
        .order('po_date', { ascending: false })
        .limit(500)
      if (supplier_id) q = q.eq('supplier_id', supplier_id)
      if (project_id) q = q.eq('project_id', project_id)
      const { data, error } = await q
      if (error) throw error

      const today = new Date().toISOString().split('T')[0]
      const supplierMap = new Map<string, any>()
      for (const po of data || []) {
        const key = String(po.supplier_id || po.suppliers?.name || 'unknown')
        const current = supplierMap.get(key) || {
          supplier_id: po.supplier_id || null,
          supplier_name: po.suppliers?.name || 'Unassigned supplier',
          total_po_value: 0,
          open_po_value: 0,
          draft_po_value: 0,
          po_count: 0,
          open_po_count: 0,
          draft_po_count: 0,
          overdue_po_count: 0,
          overdue_pos: [] as any[],
          latest_po_date: null as string | null,
        }
        const value = Number(po.grand_total || 0)
        const isOpen = ACTIVE_PO_STATUSES.has(po.status)
        const isDraft = po.status === 'Draft'
        const isOverdue = isOpen && po.expected_delivery_date && po.expected_delivery_date < today
        current.total_po_value += value
        current.po_count += 1
        if (isOpen) {
          current.open_po_value += value
          current.open_po_count += 1
        }
        if (isDraft) {
          current.draft_po_value += value
          current.draft_po_count += 1
        }
        if (isOverdue) {
          current.overdue_po_count += 1
          current.overdue_pos.push({
            po_id: po.id,
            po_number: po.po_number,
            expected_delivery_date: po.expected_delivery_date,
            project: po.project?.project_number || po.project?.project_name || null,
            value,
          })
        }
        if (!current.latest_po_date || (po.po_date && po.po_date > current.latest_po_date)) current.latest_po_date = po.po_date
        supplierMap.set(key, current)
      }

      const suppliers = Array.from(supplierMap.values())
        .sort((a, b) => b.overdue_po_count - a.overdue_po_count || b.open_po_value - a.open_po_value)
        .slice(0, maxRows)
        .map((supplier) => ({ ...supplier, overdue_pos: supplier.overdue_pos.slice(0, 10) }))

      return {
        supplier_count: suppliers.length,
        total_open_value: suppliers.reduce((sum, s) => sum + s.open_po_value, 0),
        total_overdue_pos: suppliers.reduce((sum, s) => sum + s.overdue_po_count, 0),
        suppliers,
      }
    },
  },
  {
    name: 'score_project_procurement_risk',
    kind: 'read',
    description:
      'Return dashboard-grade project procurement risk scores, including health score, BOM/PO gap, overdue POs, and parts needing PO coverage. Use this for risk score or smart dashboard questions.',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'number', description: 'Optional project id to return one project risk signal.' },
        limit: { type: 'number', default: 10 },
      },
    },
    handler: async ({ project_id, limit = 10 }: any) => {
      if (project_id != null) assertInteger('project_id', project_id)
      const maxRows = Math.max(1, Math.min(Number(limit) || 10, 50))
      const dashboard = await dashboardApi.getSmartDashboard()
      const projects = (dashboard.priority_projects || [])
        .filter((project: any) => !project_id || project.project_id === project_id)
        .slice(0, maxRows)
      return {
        generated_at: dashboard.generated_at,
        kpis: dashboard.kpis,
        projects,
      }
    },
  },
  {
    name: 'search_master_parts',
    kind: 'read',
    description: 'Search the master part catalogue across all part_types by part_number or description.',
    parameters: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'Substring to search' },
        part_type: { type: 'string', enum: part_type_enum, description: 'Optional, restrict to one part_type' },
        limit: { type: 'number', default: 25 },
      },
    },
    handler: async ({ query, part_type, limit = 25 }: any) => {
      const types = part_type ? [part_type] : part_type_enum
      const results: any[] = []
      for (const pt of types) {
        const { data } = await (supabase as any)
          .from(pt)
          .select('id, part_number, description, supplier_id, stock_quantity, unit_price')
          .or(`part_number.ilike.%${query}%,description.ilike.%${query}%`)
          .limit(limit)
        for (const d of data || []) results.push({ part_type: pt, ...d })
      }
      return results.slice(0, limit)
    },
  },
  {
    name: 'list_parts_missing_images',
    kind: 'read',
    description:
      'List master parts whose image_path is empty or missing. Use this before searching images for existing master parts. Can be scoped to EBO/MBO/PBO/etc by part_type.',
    parameters: {
      type: 'object',
      properties: {
        part_type: { type: 'string', enum: part_type_enum, description: 'Optional, restrict to one part_type such as electrical_bought_out for EBO.' },
        limit: { type: 'number', default: 25 },
      },
    },
    handler: async ({ part_type, limit = 25 }: any) => {
      const types = part_type ? [part_type] : part_type_enum
      const maxRows = Math.max(1, Math.min(Number(limit) || 25, 100))
      const results: any[] = []
      for (const pt of types) {
        const { data, error } = await (supabase as any)
          .from(pt)
          .select('id, part_number, beperp_part_no, manufacturer, manufacturer_part_number, description, image_path')
          .order('updated_date', { ascending: false, nullsFirst: false })
          .limit(500)
        if (error) throw error
        for (const d of data || []) {
          if (d.image_path && String(d.image_path).trim()) continue
          results.push({
            part_type: pt,
            id: d.id,
            part_number: d.part_number,
            beperp_part_no: d.beperp_part_no,
            manufacturer: d.manufacturer,
            manufacturer_part_number: d.manufacturer_part_number,
            description: d.description,
          })
          if (results.length >= maxRows) return results
        }
      }
      return results
    },
  },
  {
    name: 'find_duplicate_master_parts',
    kind: 'read',
    description:
      'Find likely duplicate master parts by normalized ERP code, internal part number, manufacturer part number, and description. Use this before proposing any merge/delete.',
    parameters: {
      type: 'object',
      properties: {
        part_type: { type: 'string', enum: part_type_enum, description: 'Optional, restrict to one part table such as electrical_bought_out.' },
        query: { type: 'string', description: 'Optional part number, ERP code, manufacturer part number, or description fragment to focus the scan.' },
        limit: { type: 'number', default: 20 },
      },
    },
    handler: async ({ part_type, query, limit = 20 }: any) => {
      const types = part_type ? [part_type] : part_type_enum
      const maxGroups = Math.max(1, Math.min(Number(limit) || 20, 100))
      const queryKey = normalizePartKey(query)
      const queryText = String(query || '').trim().toLowerCase()
      const rows: any[] = []

      for (const pt of types) {
        const { data, error } = await (supabase as any)
          .from(pt)
          .select('id, part_number, beperp_part_no, manufacturer_part_number, description, manufacturer, image_path, stock_quantity, base_price, currency, updated_date, supplier_id')
          .limit(2000)
        if (error) throw error
        for (const row of data || []) {
          const searchBlob = [
            row.part_number,
            row.beperp_part_no,
            row.manufacturer_part_number,
            row.description,
            row.manufacturer,
          ].filter(Boolean).join(' ').toLowerCase()
          if (queryKey) {
            const keys = [
              normalizePartKey(row.part_number),
              normalizePartKey(row.beperp_part_no),
              normalizePartKey(row.manufacturer_part_number),
            ]
            if (!keys.some((key) => key.includes(queryKey) || queryKey.includes(key)) && !searchBlob.includes(queryText)) continue
          }
          rows.push({ part_type: pt, ...row })
        }
      }

      const groups = new Map<string, any[]>()
      const addKey = (key: string, row: any) => {
        if (!key || key.length < 4) return
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(row)
      }

      for (const row of rows) {
        addKey(`erp:${normalizePartKey(row.beperp_part_no)}`, row)
        addKey(`part:${normalizePartKey(row.part_number)}`, row)
        addKey(`mfg:${normalizePartKey(row.manufacturer_part_number)}`, row)
        addKey(`desc:${normalizeDescriptionKey(row.description)}`, row)
      }

      const seen = new Set<string>()
      const duplicates: any[] = []
      for (const [match_key, members] of groups.entries()) {
        const unique = Array.from(new Map(members.map((m) => [`${m.part_type}:${m.id}`, m])).values())
        if (unique.length < 2) continue
        const signature = unique.map((m) => `${m.part_type}:${m.id}`).sort().join('|')
        if (seen.has(signature)) continue
        seen.add(signature)
        duplicates.push({
          match_key,
          confidence: match_key.startsWith('erp:') || match_key.startsWith('part:') || match_key.startsWith('mfg:') ? 'high' : 'review',
          candidates: unique.map((m) => ({
            part_type: m.part_type,
            id: m.id,
            part_number: m.part_number,
            beperp_part_no: m.beperp_part_no,
            manufacturer_part_number: m.manufacturer_part_number,
            description: m.description,
            manufacturer: m.manufacturer,
            has_image: Boolean(m.image_path),
            stock_quantity: m.stock_quantity || 0,
            base_price: m.base_price || 0,
            currency: m.currency || 'INR',
            updated_date: m.updated_date,
            supplier_id: m.supplier_id,
          })),
        })
        if (duplicates.length >= maxGroups) break
      }
      return duplicates
    },
  },
  {
    name: 'list_suppliers',
    kind: 'read',
    description: 'List suppliers with id and name.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const s = await suppliersApi.getSuppliers()
      return (s || []).map((x: any) => ({ id: x.id, name: x.name, country: x.country }))
    },
  },
  {
    name: 'get_pending_procurement',
    kind: 'read',
    description: 'List BOM parts that have not yet been ordered, grouped by supplier.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const list = await purchaseOrdersApi.getPendingParts()
      return (list || []).map((p: any) => ({
        project_part_id: p.id,
        project: p.subsection?.section?.project?.project_name,
        section: p.subsection?.section_name,
        part_number: p.part_ref?.part_number,
        supplier: p.part_ref?.suppliers?.name,
        supplier_id: p.part_ref?.supplier_id,
        quantity: p.quantity,
        unit_price: p.unit_price,
      }))
    },
  },
  {
    name: 'find_master_part_by_erp_id',
    kind: 'read',
    description:
      'Find an existing master part by ERP Integration ID (column beperp_part_no), manufacturer_part_number, or part_number. Searches all part_types unless one is specified. Use this BEFORE creating a new master part to avoid duplicates AND before adding a part to any project — mapping a project line requires the master part to already exist.',
    parameters: {
      type: 'object',
      required: ['code'],
      properties: {
        code: { type: 'string', description: 'Item code from PO PDF (e.g. 9101689) or part_number / manufacturer_part_number' },
        part_type: { type: 'string', enum: part_type_enum, description: 'Optional: scope to one part_type' },
      },
    },
    handler: async ({ code, part_type }: any) => {
      const types = part_type ? [part_type] : part_type_enum
      const out: any[] = []
      for (const pt of types) {
        const { data } = await (supabase as any)
          .from(pt)
          .select('id, part_number, beperp_part_no, manufacturer_part_number, description, supplier_id, base_price, discount_percent, currency')
          .or(`beperp_part_no.eq.${code},manufacturer_part_number.eq.${code},part_number.eq.${code}`)
          .limit(5)
        for (const d of data || []) out.push({ part_type: pt, ...d })
      }
      return out
    },
  },
  {
    name: 'find_project_by_name',
    kind: 'read',
    description: 'Look up a project by partial name or project_number (case-insensitive). Use this whenever the user mentions a project by name (e.g. "JPM") so you can reference it by id.',
    parameters: {
      type: 'object',
      required: ['query'],
      properties: { query: { type: 'string' } },
    },
    handler: async ({ query }: any) => {
      const q = String(query).trim()
      const { data } = await (supabase as any)
        .from('projects')
        .select('id, project_number, project_name, customer, status')
        .or(`project_name.ilike.%${q}%,project_number.ilike.%${q}%,customer.ilike.%${q}%`)
        .limit(10)
      return data || []
    },
  },
  {
    name: 'find_supplier_by_name',
    kind: 'read',
    description: 'Look up a supplier by partial name match (case-insensitive).',
    parameters: {
      type: 'object',
      required: ['query'],
      properties: { query: { type: 'string' } },
    },
    handler: async ({ query }: any) => {
      const { data } = await (supabase as any)
        .from('suppliers')
        .select('id, name, address, email, phone, notes')
        .ilike('name', `%${query}%`)
        .limit(10)
      return data || []
    },
  },
  {
    name: 'get_project_structure',
    kind: 'read',
    description: 'Get the full section/subsection tree for a project (no parts). Use this BEFORE adding parts so you can decide whether to reuse an existing subsection or create a new one.',
    parameters: {
      type: 'object',
      required: ['project_id'],
      properties: { project_id: { type: 'number' } },
    },
    handler: async ({ project_id }: any) => {
      const { data: sections } = await (supabase as any)
        .from('project_sections')
        .select('id, name, order_index')
        .eq('project_id', project_id)
        .order('order_index', { ascending: true })
      const { data: subs } = await (supabase as any)
        .from('project_subsections')
        .select('id, section_id, section_name, description, sort_order')
        .eq('project_id', project_id)
        .order('sort_order', { ascending: true })
      return {
        sections: sections || [],
        subsections: subs || [],
      }
    },
  },
  {
    name: 'search_image_url',
    kind: 'read',
    description:
      'Find a product image URL for a bought-out part. Uses DuckDuckGo (via CORS proxy) as primary — gives real product photos. Falls back to Wikimedia. ' +
      'Only call this for bought-out parts (EBO, MBO, PBO). Skip for manufactured parts (EMF, MMF) — those are custom and have no web image. ' +
      'Build the query as: "<manufacturer> <manufacturer_part_number> <short description>" for best results.',
    parameters: {
      type: 'object',
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          description: 'Product search string, e.g. "Siemens 3RT2015-1AB02 contactor 7A" or "Phoenix Contact 2967120 terminal block"',
        },
      },
    },
    handler: async ({ query }: any) => {
      const queries = buildProductImageQueries(query)

      for (const candidate of industrialImageCandidates(query)) {
        return { found: true, image_url: candidate.url, source: candidate.source, query: String(query) }
      }

      // ── Strategy 1: DuckDuckGo via corsproxy.io ──────────────────────────
      // DuckDuckGo image results embed actual product images from manufacturer
      // and distributor sites — far better for industrial parts than Wikimedia.
      try {
        const searchQuery = queries[0] || String(query || '')
        const ddgUrl = 'https://duckduckgo.com/?q=' + encodeURIComponent(searchQuery) + '&iax=images&ia=images'
        const res = await fetch('https://corsproxy.io/?' + encodeURIComponent(ddgUrl), {
          signal: AbortSignal.timeout(7000),
          headers: { 'Accept': 'text/html' },
        })
        if (res.ok) {
          const html = await res.text()
          // DDG embeds image data in its page as JSON-like fragments
          const matches = [...html.matchAll(/"image":"(https:[^"]+)"/g)]
          for (const m of matches) {
            const url = decodeImageUrl(m[1])
            // Skip DDG's own thumbnails; prefer direct product image hosts
            if (isUsefulImageUrl(url)) {
              return { found: true, image_url: url, source: 'duckduckgo-html', query: searchQuery }
            }
          }
        }
      } catch { /* proxy unavailable — fall through */ }

      // ── Strategy 2: Wikimedia Commons (native CORS, last resort) ─────────
      for (const searchQuery of queries) {
        try {
          const pageUrl = 'https://duckduckgo.com/?q=' + encodeURIComponent(searchQuery) + '&iax=images&ia=images'
          const pageRes = await fetch('https://corsproxy.io/?' + encodeURIComponent(pageUrl), {
            signal: AbortSignal.timeout(7000),
            headers: { Accept: 'text/html' },
          })
          if (!pageRes.ok) continue
          const html = await pageRes.text()
          const vqd = html.match(/vqd=['"]?([^'"&\s]+)['"]?/)?.[1]
          if (!vqd) continue
          const apiUrl =
            'https://duckduckgo.com/i.js?o=json&q=' +
            encodeURIComponent(searchQuery) +
            '&vqd=' +
            encodeURIComponent(vqd) +
            '&f=,,,&p=1'
          const imgRes = await fetch('https://corsproxy.io/?' + encodeURIComponent(apiUrl), {
            signal: AbortSignal.timeout(7000),
            headers: { Accept: 'application/json' },
          })
          if (!imgRes.ok) continue
          const json = await imgRes.json()
          for (const item of json?.results || []) {
            const url = decodeImageUrl(item?.image || item?.thumbnail || '')
            if (isUsefulImageUrl(url)) {
              return { found: true, image_url: url, source: 'duckduckgo-images', query: searchQuery, title: item?.title }
            }
          }
        } catch { /* continue to next query */ }
      }

      try {
        const wmUrl =
          'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*' +
          '&generator=search&gsrlimit=5&gsrnamespace=6' +
          '&prop=imageinfo&iiprop=url&iiurlwidth=400&gsrsearch=' +
          encodeURIComponent('filetype:bitmap ' + query)
        const res = await fetch(wmUrl)
        const json = await res.json()
        const pages = json?.query?.pages || {}
        for (const id of Object.keys(pages)) {
          const ii = pages[id]?.imageinfo?.[0]
          if (ii?.thumburl) return { found: true, image_url: ii.thumburl, source: 'wikimedia' }
          if (ii?.url)      return { found: true, image_url: ii.url,      source: 'wikimedia' }
        }
      } catch { /* ignore */ }

      return { found: false, image_url: null }
    },
  },
  {
    name: 'list_purchase_orders',
    kind: 'read',
    description: 'List purchase orders. Filter by po_number (exact or partial match), status, or project_id. Use po_number to look up a specific PO by its number.',
    parameters: {
      type: 'object',
      properties: {
        po_number: { type: 'string', description: 'Search by PO number (partial match, e.g. "PO-56741134").' },
        status: { type: 'string' },
        project_id: { type: 'number' },
      },
    },
    handler: async ({ status, project_id, po_number }: any) => {
      let q = (supabase as any).from('purchase_orders').select('id, po_number, status, project_id, supplier_id, grand_total, total_items, po_date, expected_delivery_date')
      if (po_number) q = q.ilike('po_number', `%${po_number}%`)
      if (status) q = q.eq('status', status)
      if (project_id) q = q.eq('project_id', project_id)
      const { data, error } = await q.order('po_date', { ascending: false }).limit(200)
      if (error) return { error: error.message }
      return data ?? []
    },
  },
  {
    name: 'audit_project_po_pdfs',
    kind: 'read',
    description:
      'Run a read-only PO/PDF match audit for purchase orders in one project. Use after the project is selected. Compares attached BEP PO PDFs against stored PO number, supplier, line count, item codes, quantities, unit prices, discounts, and total value. Include po_status in reports for matched and mismatched POs.',
    parameters: {
      type: 'object',
      required: ['project_id'],
      properties: {
        project_id: { type: 'number', description: 'Project id whose purchase orders should be audited.' },
        po_ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'Optional specific PO ids to audit. If omitted, audit all POs in the project.',
        },
      },
    },
    handler: async ({ project_id, po_ids }: any) => {
      assertInteger('project_id', project_id)
      const scopedIds = Array.isArray(po_ids)
        ? po_ids.filter((id) => Number.isInteger(id)).slice(0, 100)
        : []

      const { data: project } = await (supabase as any)
        .from('projects')
        .select('id, project_number, project_name')
        .eq('id', project_id)
        .maybeSingle()
      if (!project) return { error: `Project #${project_id} not found.` }

      let q = (supabase as any)
        .from('purchase_orders')
        .select('*, suppliers(name), purchase_order_items(*)')
        .eq('project_id', project_id)
        .order('po_date', { ascending: false })
        .limit(100)
      if (scopedIds.length) q = q.in('id', scopedIds)

      const { data, error } = await q
      if (error) throw error

      const results = []
      for (const po of data || []) {
        const result = await auditPurchaseOrderPdf(po)
        results.push({
          ...result,
          issues: result.issues.slice(0, 25),
          issue_count: result.issues.length,
          has_more_issues: result.issues.length > 25,
        })
      }

      const byStatus = (status: string) => results.filter((r) => r.status === status).length
      return {
        project,
        checked: results.length,
        matched: byStatus('match'),
        needs_review: byStatus('warning') + byStatus('error'),
        missing_pdf: byStatus('missing_pdf'),
        results,
      }
    },
  },
  {
    name: 'get_po_details',
    kind: 'read',
    description: 'Get full details of a single PO including all line items with ordered, received, and pending quantities. Use this to answer questions like "what is received / pending for PO-XXXXX".',
    parameters: {
      type: 'object',
      properties: {
        po_number: { type: 'string', description: 'The PO number, e.g. "PO-56741134".' },
        po_id: { type: 'number', description: 'The numeric PO id (alternative to po_number).' },
      },
    },
    handler: async ({ po_number, po_id }: any) => {
      // Resolve id from po_number if needed
      let id = po_id
      if (!id && po_number) {
        const { data: rows } = await (supabase as any)
          .from('purchase_orders')
          .select('id')
          .ilike('po_number', `%${po_number}%`)
          .limit(1)
        if (!rows?.length) return { error: `No PO found matching "${po_number}"` }
        id = rows[0].id
      }
      if (!id) return { error: 'Provide po_number or po_id.' }

      // Fetch PO + items + supplier
      const { data: po, error } = await (supabase as any)
        .from('purchase_orders')
        .select(`*, suppliers(name), purchase_order_items(*)`)
        .eq('id', id)
        .single()
      if (error || !po) return { error: error?.message || 'PO not found' }

      // Fetch receipt history for audit trail
      const { data: receipts } = await (supabase as any)
        .from('po_receipts')
        .select('id, receipt_date, quantity, notes, purchase_order_item_id')
        .eq('purchase_order_id', id)
        .order('receipt_date', { ascending: false })

      const receiptsByItem: Record<number, any[]> = {}
      for (const r of receipts || []) {
        if (!receiptsByItem[r.purchase_order_item_id]) receiptsByItem[r.purchase_order_item_id] = []
        receiptsByItem[r.purchase_order_item_id].push({ date: r.receipt_date, qty: r.quantity, notes: r.notes })
      }

      const items = (po.purchase_order_items || []).map((it: any) => ({
        part_number: it.part_number,
        part_type: it.part_type,
        ordered: it.quantity,
        received: it.received_qty ?? 0,
        pending: Math.max(0, it.quantity - (it.received_qty ?? 0)),
        unit_price: it.unit_price,
        discount_percent: it.discount_percent,
        receipts: receiptsByItem[it.id] || [],
      }))

      return {
        po_number: po.po_number,
        supplier: po.suppliers?.name,
        status: po.status,
        po_date: po.po_date,
        grand_total: po.grand_total,
        items,
        summary: {
          total_lines: items.length,
          fully_received: items.filter((i: any) => i.pending === 0).length,
          partially_received: items.filter((i: any) => i.received > 0 && i.pending > 0).length,
          not_received: items.filter((i: any) => i.received === 0).length,
        },
      }
    },
  },

  {
    name: 'preview_existing_po_pdf_correction',
    kind: 'read',
    description:
      'Preview how an existing PO, including a Released PO, would be corrected to match its attached BEP PO PDF. This does not write. Use before apply_existing_po_pdf_correction.',
    parameters: {
      type: 'object',
      required: ['po_id'],
      properties: {
        po_id: { type: 'number' },
        allow_delete_received_lines: {
          type: 'boolean',
          default: false,
          description: 'When false, preview blocks if correction would remove PO lines that already have received_qty.',
        },
      },
    },
    handler: async ({ po_id, allow_delete_received_lines = false }: any) => {
      const plan = await buildExistingPoPdfCorrectionPlan(po_id, Boolean(allow_delete_received_lines))
      return {
        ...plan,
        desired_items: (plan.desired_items || []).map((item: any) => ({
          old_item_id: item.old_item_id,
          project_part_id: item.project_part_id,
          part_number: item.part_number,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_percent: item.discount_percent,
          total_amount: item.total_amount,
          pdf_line_no: item.pdf_line_no,
          pdf_item_code: item.pdf_item_code,
        })),
      }
    },
  },

  // ── WRITE (require user approval) ───────────────────────────────────────
  {
    name: 'preview_released_po_pdf_repairs',
    kind: 'read',
    description:
      'Preview repair for every finalized/active PO in one project that has an attached BEP PO PDF. Includes Released, Pending, Sent, Confirmed, Partial, and Received POs; excludes Draft and Cancelled. Identifies DB-only lines to delete. This does not write. This result is complete for the bulk repair workflow: after calling it, summarize and either propose apply_released_po_pdf_repairs when all checked POs are ready, or stop if any PO is blocked/missing PDF.',
    parameters: {
      type: 'object',
      required: ['project_id'],
      properties: {
        project_id: { type: 'number' },
        allow_delete_received_lines: {
          type: 'boolean',
          default: true,
          description: 'For this project-level PO repair, default true because the user explicitly wants DB-only lines removed when they are not in the PDF.',
        },
      },
    },
    handler: async ({ project_id, allow_delete_received_lines = true }: any) => {
      return buildReleasedPoPdfRepairPreview(project_id, Boolean(allow_delete_received_lines))
    },
  },
  {
    name: 'create_supplier',
    kind: 'write',
    description: 'Create a new supplier. Use only after find_supplier_by_name returned no match.',
    parameters: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string' },
        address: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        gstin: { type: 'string', description: 'Indian GSTIN — stored in notes since there is no dedicated column.' },
        contact_person: { type: 'string' },
      },
    },
    summarize: (a) => `Create supplier "${a.name}"${a.gstin ? ` (GSTIN ${a.gstin})` : ''}`,
    preflight: async (a: any) => {
      if (!a.name || String(a.name).trim() === '') throw new Error('name is required')
      const { data: dup } = await (supabase as any)
        .from('suppliers')
        .select('id, name')
        .ilike('name', String(a.name).trim())
        .limit(1)
      if (dup && dup.length) {
        throw new Error(
          `Supplier "${dup[0].name}" already exists (id ${dup[0].id}). ` +
          `Use supplier_id ${dup[0].id} directly; do NOT propose create_supplier.`,
        )
      }
    },
    handler: async (a: any) => {
      assertNonEmpty('name', a.name)
      assertMaxLen('name', a.name, 200)
      // Case-insensitive duplicate check
      const { data: dup } = await (supabase as any)
        .from('suppliers')
        .select('id, name')
        .ilike('name', a.name.trim())
        .limit(1)
      if (dup && dup.length) {
        throw new Error(`Supplier "${dup[0].name}" already exists (id ${dup[0].id}). Use it instead of creating a duplicate.`)
      }
      const notes = [a.gstin && `GSTIN: ${a.gstin}`].filter(Boolean).join(' | ') || null
      const { data, error } = await (supabase as any)
        .from('suppliers')
        .insert([{
          name: a.name.trim(),
          address: a.address || null,
          email: a.email || null,
          phone: a.phone || null,
          contact_person: a.contact_person || null,
          notes,
        }])
        .select()
        .single()
      if (error) throw error
      return data
    },
  },
  {
    name: 'create_master_part',
    kind: 'write',
    description:
      'Create a master part record. Always look up first with find_master_part_by_erp_id; never create a duplicate. ERP Integration ID (Item Code from PO PDF) goes into beperp_part_no. The supplier-side / manufacturer code goes into manufacturer_part_number. The Internal Part Number is derived automatically as "<PREFIX>-<beperp_part_no>" based on the part_type — DO NOT supply part_number; it is computed for you. last_price_date should be the PO date.',
    parameters: {
      type: 'object',
      required: ['part_type', 'beperp_part_no', 'description', 'supplier_id', 'base_price'],
      properties: {
        part_type: { type: 'string', enum: part_type_enum },
        beperp_part_no: { type: 'string', description: 'ERP Integration ID = Item Code from PO PDF' },
        manufacturer_part_number: { type: 'string', description: 'Supplier / OEM catalogue number, e.g. 5ST3010' },
        description: { type: 'string' },
        supplier_id: { type: 'number' },
        manufacturer: { type: 'string' },
        base_price: { type: 'number' },
        discount_percent: { type: 'number', default: 0 },
        currency: { type: 'string', default: 'INR' },
        image_path: { type: 'string', description: 'Optional image URL — try search_image_url first.' },
        last_price_date: { type: 'string', description: 'ISO date (the PO date).' },
        specifications: { type: 'string' },
      },
    },
    summarize: (a) => {
      const prefix = PREFIX_BY_PART_TYPE[a.part_type] || '?'
      return `Create ${a.part_type} ${prefix}-${a.beperp_part_no} (ERP ${a.beperp_part_no})${a.manufacturer_part_number ? ' / ' + a.manufacturer_part_number : ''} @ ${a.currency || 'INR'} ${a.base_price}` +
        (a.discount_percent ? ` (-${a.discount_percent}%)` : '')
    },
    preflight: async (a: any) => {
      const prefix = PREFIX_BY_PART_TYPE[a.part_type]
      if (!prefix) throw new Error(`Unknown part_type: ${a.part_type}`)
      if (a.beperp_part_no == null || String(a.beperp_part_no).trim() === '')
        throw new Error('beperp_part_no (ERP Item Code) is required')
      const erp = String(a.beperp_part_no).trim()
      const part_number = `${prefix}-${erp}`
      const mfgPart = a.manufacturer_part_number ? String(a.manufacturer_part_number).trim() : null
      const normalizedMfgPart = normalizeManufacturerPartKey(mfgPart)
      if (mfgPart && /(?:^|[-_\s])(?:PDF|COPY|DUPLICATE|NEW)(?:$|[-_\s])/i.test(mfgPart)) {
        throw new Error('manufacturer_part_number appears modified to bypass duplicate checks. Use the real manufacturer part number or leave it blank.')
      }
      // Scan every part_type table for a matching record
      for (const pt of part_type_enum) {
        const orClauses = [
          `part_number.eq.${part_number}`,
          `beperp_part_no.eq.${erp}`,
        ]
        if (mfgPart) orClauses.push(`manufacturer_part_number.eq.${mfgPart}`)
        const { data: dup } = await (supabase as any)
          .from(pt)
          .select('id, part_number, beperp_part_no, manufacturer_part_number, base_price, discount_percent, currency')
          .or(orClauses.join(','))
          .limit(1)
        if (dup && dup.length) {
          const d = dup[0]
          const reasons: string[] = []
          if (d.part_number === part_number) reasons.push(`part_number "${part_number}"`)
          if (String(d.beperp_part_no) === erp) reasons.push(`ERP id "${erp}"`)
          if (mfgPart && d.manufacturer_part_number === mfgPart) reasons.push(`manufacturer_part_number "${mfgPart}"`)
          throw new Error(
            `Duplicate master part: a record already exists matching ${reasons.join(' / ')} ` +
            `in table "${pt}" (id ${d.id}, part_number ${d.part_number}, ` +
            `current price ${d.currency || 'INR'} ${d.base_price} with ${d.discount_percent || 0}% discount). ` +
            `Do NOT propose create_master_part. If the new PO has a different price/discount, propose ` +
            `update_master_part_price({ part_type: "${pt}", part_id: ${d.id}, base_price: <new>, discount_percent: <new>, last_price_date: <po_date> }) ` +
            `instead. If the price is unchanged, skip this part.`,
          )
        }
        if (normalizedMfgPart) {
          const { data: fuzzyDup } = await (supabase as any)
            .from(pt)
            .select('id, part_number, beperp_part_no, manufacturer_part_number, base_price, discount_percent, currency')
            .not('manufacturer_part_number', 'is', null)
          const found = (fuzzyDup || []).find((row: any) =>
            normalizeManufacturerPartKey(row.manufacturer_part_number) === normalizedMfgPart
          )
          if (found) {
            throw new Error(
              `Duplicate master part: manufacturer part "${mfgPart}" matches existing "${found.manufacturer_part_number}" ` +
              `in table "${pt}" (id ${found.id}, part_number ${found.part_number}). Do NOT create a duplicate with a modified manufacturer number.`,
            )
          }
        }
      }
    },
    handler: async (a: any) => {
      const prefix = PREFIX_BY_PART_TYPE[a.part_type]
      if (!prefix) throw new Error(`Unknown part_type: ${a.part_type}`)
      if (a.beperp_part_no == null || String(a.beperp_part_no).trim() === '')
        throw new Error('beperp_part_no (ERP Item Code) is required')
      const part_number = `${prefix}-${String(a.beperp_part_no).trim()}`

      // Hard duplicate check across EVERY part_type table.
      // The same physical component must never exist twice in part master,
      // regardless of which category an earlier record was filed under.
      const mfgPart = a.manufacturer_part_number || null
      const normalizedMfgPart = normalizeManufacturerPartKey(mfgPart)
      if (mfgPart && /(?:^|[-_\s])(?:PDF|COPY|DUPLICATE|NEW)(?:$|[-_\s])/i.test(String(mfgPart))) {
        throw new Error('manufacturer_part_number appears modified to bypass duplicate checks. Use the real manufacturer part number or leave it blank.')
      }
      for (const pt of part_type_enum) {
        const orClauses = [
          `part_number.eq.${part_number}`,
          `beperp_part_no.eq.${a.beperp_part_no}`,
        ]
        if (mfgPart) orClauses.push(`manufacturer_part_number.eq.${mfgPart}`)
        const { data: dup } = await (supabase as any)
          .from(pt)
          .select('id, part_number, beperp_part_no, manufacturer_part_number, description')
          .or(orClauses.join(','))
          .limit(1)
        if (dup && dup.length) {
          const d = dup[0]
          const reasons: string[] = []
          if (d.part_number === part_number) reasons.push(`part_number "${part_number}"`)
          if (String(d.beperp_part_no) === String(a.beperp_part_no)) reasons.push(`ERP id "${a.beperp_part_no}"`)
          if (mfgPart && d.manufacturer_part_number === mfgPart) reasons.push(`manufacturer_part_number "${mfgPart}"`)
          throw new Error(
            `Refusing to create duplicate master part. ` +
            `An existing record matches by ${reasons.join(' / ')} ` +
            `in table "${pt}" (id ${d.id}, part_number ${d.part_number}). ` +
            `If the price changed, use update_master_part_price on that record. ` +
            `If the existing record is filed under the wrong category, ask the user before doing anything else.`,
          )
        }
        if (normalizedMfgPart) {
          const { data: fuzzyDup } = await (supabase as any)
            .from(pt)
            .select('id, part_number, manufacturer_part_number')
            .not('manufacturer_part_number', 'is', null)
          const found = (fuzzyDup || []).find((row: any) =>
            normalizeManufacturerPartKey(row.manufacturer_part_number) === normalizedMfgPart
          )
          if (found) {
            throw new Error(
              `Refusing to create duplicate master part. Manufacturer part "${mfgPart}" matches existing ` +
              `"${found.manufacturer_part_number}" in table "${pt}" (id ${found.id}, part_number ${found.part_number}).`,
            )
          }
        }
      }

      // Field-level validation
      assertNonEmpty('description', a.description)
      assertMaxLen('description', a.description, MAX_DESC_LEN)
      assertInteger('supplier_id', a.supplier_id)
      assertNumberInRange('base_price', a.base_price, 0, MAX_PRICE)
      if (a.discount_percent != null) assertNumberInRange('discount_percent', a.discount_percent, 0, 100)
      await assertRowExists('suppliers', a.supplier_id, 'supplier')

      const insertRow: any = {
        part_number,
        beperp_part_no: String(a.beperp_part_no).trim(),
        manufacturer_part_number: a.manufacturer_part_number ? String(a.manufacturer_part_number).trim() : null,
        description: String(a.description).trim(),
        supplier_id: a.supplier_id,
        manufacturer: a.manufacturer || null,
        base_price: a.base_price,
        discount_percent: a.discount_percent || 0,
        currency: a.currency || 'INR',
        image_path: a.image_path || null,
        specifications: a.specifications || null,
      }
      if (a.last_price_date) insertRow.updated_date = a.last_price_date
      const { data, error } = await (supabase as any)
        .from(a.part_type)
        .insert([insertRow])
        .select()
        .single()
      if (error) throw error
      return data
    },
  },
  {
    name: 'update_master_part_price',
    kind: 'write',
    description:
      'Update price / discount / image / last_price_date / supplier on an EXISTING master part. Use when a new PO has the same item code at a different price, or when a different supplier is now sourcing the part (pass supplier_id to record the current/primary supplier — the same part can be supplied by multiple suppliers over time).',
    parameters: {
      type: 'object',
      required: ['part_type', 'part_id'],
      properties: {
        part_type: { type: 'string', enum: part_type_enum },
        part_id: { type: 'number' },
        base_price: { type: 'number' },
        discount_percent: { type: 'number' },
        currency: { type: 'string' },
        image_path: { type: 'string' },
        last_price_date: { type: 'string' },
        manufacturer_part_number: { type: 'string' },
        supplier_id: { type: 'number', description: 'Optional. Update the master part\'s primary supplier when a different supplier is now sourcing this part. The supplier row must exist.' },
      },
    },
    summarize: (a) => {
      const bits = []
      if (a.base_price != null) bits.push(`price=${a.base_price}`)
      if (a.discount_percent != null) bits.push(`disc=${a.discount_percent}%`)
      if (a.supplier_id != null) bits.push(`supplier=#${a.supplier_id}`)
      if (a.image_path) bits.push('image set')
      return `Update ${a.part_type} #${a.part_id}: ${bits.join(', ') || 'metadata'}`
    },
    handler: async (a: any) => {
      assertInteger('part_id', a.part_id)
      if (a.base_price != null) assertNumberInRange('base_price', a.base_price, 0, MAX_PRICE)
      if (a.discount_percent != null) assertNumberInRange('discount_percent', a.discount_percent, 0, 100)
      await assertRowExists(a.part_type, a.part_id, `${a.part_type} master part`)
      if (a.supplier_id != null) {
        assertInteger('supplier_id', a.supplier_id)
        await assertRowExists('suppliers', a.supplier_id, 'supplier')
      }

      const patch: any = {}
      if (a.base_price != null) patch.base_price = a.base_price
      if (a.discount_percent != null) patch.discount_percent = a.discount_percent
      if (a.currency) patch.currency = a.currency
      if (a.image_path) patch.image_path = a.image_path
      if (a.manufacturer_part_number) patch.manufacturer_part_number = a.manufacturer_part_number
      if (a.supplier_id != null) patch.supplier_id = a.supplier_id
      if (a.last_price_date) patch.updated_date = a.last_price_date
      else patch.updated_date = new Date().toISOString()
      if (Object.keys(patch).length === 1 /* only updated_date */) {
        throw new Error('update_master_part_price: nothing to update — supply at least one of base_price, discount_percent, currency, image_path, manufacturer_part_number, supplier_id, last_price_date.')
      }
      const { data, error } = await (supabase as any)
        .from(a.part_type)
        .update(patch)
        .eq('id', a.part_id)
        .select()
        .single()
      if (error) throw error
      return data
    },
  },
  {
    name: 'merge_duplicate_master_parts',
    kind: 'write',
    description:
      'Merge two duplicate master part rows in the SAME part table. Repoints project BOM lines, PO items, stock movements, and price history from remove_part_id to keep_part_id, combines useful metadata/stock, then deletes the duplicate. Use only after find_duplicate_master_parts and after telling the user exactly which row will be kept.',
    parameters: {
      type: 'object',
      required: ['part_type', 'keep_part_id', 'remove_part_id'],
      properties: {
        part_type: { type: 'string', enum: part_type_enum },
        keep_part_id: { type: 'number', description: 'The canonical master part row to keep.' },
        remove_part_id: { type: 'number', description: 'The duplicate master part row to merge and delete.' },
        reason: { type: 'string', description: 'Short audit reason shown to the user.' },
      },
    },
    summarize: (a) => `Merge duplicate ${a.part_type}: keep #${a.keep_part_id}, remove #${a.remove_part_id}`,
    preflight: async (a: any) => {
      if (!part_type_enum.includes(a.part_type)) throw new Error(`Unknown part_type: ${a.part_type}`)
      assertInteger('keep_part_id', a.keep_part_id)
      assertInteger('remove_part_id', a.remove_part_id)
      if (a.keep_part_id === a.remove_part_id) throw new Error('keep_part_id and remove_part_id must be different.')
      const keep = await getMasterPartForMerge(a.part_type, a.keep_part_id)
      const remove = await getMasterPartForMerge(a.part_type, a.remove_part_id)
      const keepKeys = [
        normalizePartKey(keep.part_number),
        normalizePartKey(keep.beperp_part_no),
        normalizePartKey(keep.manufacturer_part_number),
      ].filter(Boolean)
      const removeKeys = [
        normalizePartKey(remove.part_number),
        normalizePartKey(remove.beperp_part_no),
        normalizePartKey(remove.manufacturer_part_number),
      ].filter(Boolean)
      const hasStrongMatch = keepKeys.some((key) => removeKeys.includes(key))
      const descMatch = normalizeDescriptionKey(keep.description) && normalizeDescriptionKey(keep.description) === normalizeDescriptionKey(remove.description)
      if (!hasStrongMatch && !descMatch) {
        throw new Error(
          `These rows do not have a strong duplicate match. Keep #${keep.id} (${keep.part_number}) and remove #${remove.id} (${remove.part_number}) need manual review.`,
        )
      }
    },
    handler: async (a: any) => {
      if (!part_type_enum.includes(a.part_type)) throw new Error(`Unknown part_type: ${a.part_type}`)
      assertInteger('keep_part_id', a.keep_part_id)
      assertInteger('remove_part_id', a.remove_part_id)
      if (a.keep_part_id === a.remove_part_id) throw new Error('keep_part_id and remove_part_id must be different.')

      const keep = await getMasterPartForMerge(a.part_type, a.keep_part_id)
      const remove = await getMasterPartForMerge(a.part_type, a.remove_part_id)
      const removeStock = Number(remove.stock_quantity || 0)
      const keepStock = Number(keep.stock_quantity || 0)
      const removeUpdated = remove.updated_date || remove.created_date
      const keepUpdated = keep.updated_date || keep.created_date
      const useRemovePrice = removeUpdated && (!keepUpdated || new Date(removeUpdated).getTime() > new Date(keepUpdated).getTime())

      const mergedPatch: any = {
        description: pickBestValue(keep.description, remove.description),
        manufacturer: pickBestValue(keep.manufacturer, remove.manufacturer),
        make: pickBestValue(keep.make, remove.make),
        manufacturer_part_number: pickBestValue(keep.manufacturer_part_number, remove.manufacturer_part_number),
        vendor_part_number: pickBestValue(keep.vendor_part_number, remove.vendor_part_number),
        specifications: pickBestValue(keep.specifications, remove.specifications),
        image_path: pickBestValue(keep.image_path, remove.image_path),
        datasheet_url: pickBestValue(keep.datasheet_url, remove.datasheet_url),
        pdf_path: pickBestValue(keep.pdf_path, remove.pdf_path),
        pdf2_path: pickBestValue(keep.pdf2_path, remove.pdf2_path),
        pdf3_path: pickBestValue(keep.pdf3_path, remove.pdf3_path),
        stock_quantity: keepStock + removeStock,
        received_qty: Number(keep.received_qty || 0) + Number(remove.received_qty || 0),
        order_qty: Math.max(Number(keep.order_qty || 0), Number(remove.order_qty || 0)),
        total_stock: Number(keep.total_stock || 0) + Number(remove.total_stock || 0),
        updated_date: new Date().toISOString(),
      }
      if (useRemovePrice) {
        mergedPatch.base_price = remove.base_price
        mergedPatch.currency = remove.currency || keep.currency || 'INR'
        mergedPatch.discount_percent = remove.discount_percent || 0
        mergedPatch.supplier_id = remove.supplier_id || keep.supplier_id
      } else {
        mergedPatch.supplier_id = keep.supplier_id || remove.supplier_id
      }

      const { data: projectPartRows } = await (supabase as any)
        .from('project_parts')
        .select('id, project_section_id, part_id, quantity, unit_price, discount_percent')
        .eq('part_type', a.part_type)
        .in('part_id', [a.keep_part_id, a.remove_part_id])

      const keepProjectParts = (projectPartRows || []).filter((row: any) => row.part_id === a.keep_part_id)
      const removeProjectParts = (projectPartRows || []).filter((row: any) => row.part_id === a.remove_part_id)
      let projectPartsRepointed = 0
      let projectPartsMerged = 0

      for (const row of removeProjectParts) {
        const existing = keepProjectParts.find((k: any) => k.project_section_id === row.project_section_id)
        if (existing) {
          await (supabase as any)
            .from('purchase_order_items')
            .update({ project_part_id: existing.id, part_id: a.keep_part_id, part_type: a.part_type, part_number: keep.part_number })
            .eq('project_part_id', row.id)
          await (supabase as any)
            .from('project_parts')
            .update({
              quantity: Number(existing.quantity || 0) + Number(row.quantity || 0),
              unit_price: useRemovePrice ? Number(remove.base_price || existing.unit_price || 0) : existing.unit_price,
              discount_percent: useRemovePrice ? Number(remove.discount_percent || 0) : existing.discount_percent,
              updated_date: new Date().toISOString(),
            })
            .eq('id', existing.id)
          await (supabase as any).from('project_parts').delete().eq('id', row.id)
          projectPartsMerged += 1
        } else {
          await (supabase as any)
            .from('project_parts')
            .update({
              part_id: a.keep_part_id,
              unit_price: useRemovePrice ? Number(remove.base_price || row.unit_price || 0) : row.unit_price,
              discount_percent: useRemovePrice ? Number(remove.discount_percent || 0) : row.discount_percent,
              updated_date: new Date().toISOString(),
            })
            .eq('id', row.id)
          projectPartsRepointed += 1
        }
      }

      const [{ count: poItemsUpdated }, { count: stockRowsUpdated }, { count: priceRowsUpdated }] = await Promise.all([
        (supabase as any)
          .from('purchase_order_items')
          .update({ part_id: a.keep_part_id, part_type: a.part_type, part_number: keep.part_number })
          .eq('part_type', a.part_type)
          .eq('part_id', a.remove_part_id)
          .select('id', { count: 'exact', head: true }),
        (supabase as any)
          .from('stock_movements')
          .update({ part_id: a.keep_part_id, part_table_name: a.part_type, part_number: keep.part_number })
          .eq('part_table_name', a.part_type)
          .eq('part_id', a.remove_part_id)
          .select('id', { count: 'exact', head: true }),
        (supabase as any)
          .from('part_price_history')
          .update({ part_id: a.keep_part_id, part_table_name: a.part_type, part_number: keep.part_number })
          .eq('part_table_name', a.part_type)
          .eq('part_id', a.remove_part_id)
          .select('id', { count: 'exact', head: true }),
      ])

      const { data: updatedKeep, error: keepErr } = await (supabase as any)
        .from(a.part_type)
        .update(mergedPatch)
        .eq('id', a.keep_part_id)
        .select()
        .single()
      if (keepErr) throw keepErr

      const { error: deleteErr } = await (supabase as any)
        .from(a.part_type)
        .delete()
        .eq('id', a.remove_part_id)
      if (deleteErr) throw deleteErr

      return {
        kept: { part_type: a.part_type, id: a.keep_part_id, part_number: keep.part_number },
        removed: { id: a.remove_part_id, part_number: remove.part_number },
        merged_stock_quantity: updatedKeep.stock_quantity,
        project_parts_repointed: projectPartsRepointed,
        project_parts_merged: projectPartsMerged,
        purchase_order_items_updated: poItemsUpdated || 0,
        stock_movements_updated: stockRowsUpdated || 0,
        price_history_rows_updated: priceRowsUpdated || 0,
        reason: a.reason || 'duplicate master part merge',
      }
    },
  },
  {
    name: 'create_project_section',
    kind: 'write',
    description: 'Create a top-level section under a project.',
    parameters: {
      type: 'object',
      required: ['project_id', 'name'],
      properties: {
        project_id: { type: 'number' },
        name: { type: 'string' },
        order_index: { type: 'number' },
      },
    },
    summarize: (a) => `Create section "${a.name}" in project #${a.project_id}`,
    preflight: async (a: any) => {
      if (!a.name || String(a.name).trim() === '') throw new Error('name is required')
      const { data: dup } = await (supabase as any)
        .from('project_sections')
        .select('id, name')
        .eq('project_id', a.project_id)
        .ilike('name', String(a.name).trim())
        .limit(1)
      if (dup && dup.length) {
        throw new Error(
          `Section "${dup[0].name}" already exists in project #${a.project_id} (id ${dup[0].id}). ` +
          `Reuse section_id ${dup[0].id}; do NOT propose create_project_section.`,
        )
      }
    },
    handler: async (a: any) => {
      assertNonEmpty('name', a.name)
      assertMaxLen('name', a.name, 200)
      assertInteger('project_id', a.project_id)
      await assertRowExists('projects', a.project_id, 'project')
      // Reject duplicate section name within the same project
      const { data: dup } = await (supabase as any)
        .from('project_sections')
        .select('id, name')
        .eq('project_id', a.project_id)
        .ilike('name', a.name.trim())
        .limit(1)
      if (dup && dup.length) {
        throw new Error(`Section "${dup[0].name}" already exists in project #${a.project_id} (id ${dup[0].id}). Reuse it instead of creating a duplicate.`)
      }
      const { data, error } = await (supabase as any)
        .from('project_sections')
        .insert([{ project_id: a.project_id, name: a.name.trim(), order_index: a.order_index || 0 }])
        .select()
        .single()
      if (error) throw error
      return data
    },
  },
  {
    name: 'create_project_subsection',
    kind: 'write',
    description: 'Create a subsection under an existing section. Returns the subsection id you then pass to add_part_to_project.',
    parameters: {
      type: 'object',
      required: ['project_id', 'section_id', 'section_name'],
      properties: {
        project_id: { type: 'number' },
        section_id: { type: 'number' },
        section_name: { type: 'string', description: 'Name of the new subsection (column is called section_name).' },
        description: { type: 'string' },
        sort_order: { type: 'number' },
      },
    },
    summarize: (a) => `Create subsection "${a.section_name}" under section #${a.section_id} (project #${a.project_id})`,
    preflight: async (a: any) => {
      if (!a.section_name || String(a.section_name).trim() === '') throw new Error('section_name is required')
      const { data: parent } = await (supabase as any)
        .from('project_sections')
        .select('id, project_id')
        .eq('id', a.section_id)
        .maybeSingle()
      if (!parent) throw new Error(`Parent section #${a.section_id} does not exist.`)
      if (parent.project_id !== a.project_id) {
        throw new Error(`Section #${a.section_id} belongs to project #${parent.project_id}, not #${a.project_id}.`)
      }
      const { data: dup } = await (supabase as any)
        .from('project_subsections')
        .select('id, section_name')
        .eq('section_id', a.section_id)
        .ilike('section_name', String(a.section_name).trim())
        .limit(1)
      if (dup && dup.length) {
        throw new Error(
          `Subsection "${dup[0].section_name}" already exists under section #${a.section_id} (id ${dup[0].id}). ` +
          `Reuse project_subsection_id ${dup[0].id}; do NOT propose create_project_subsection.`,
        )
      }
    },
    handler: async (a: any) => {
      assertNonEmpty('section_name', a.section_name)
      assertMaxLen('section_name', a.section_name, 200)
      assertInteger('project_id', a.project_id)
      assertInteger('section_id', a.section_id)

      // Verify the parent section exists AND belongs to the same project
      const { data: parent } = await (supabase as any)
        .from('project_sections')
        .select('id, project_id, name')
        .eq('id', a.section_id)
        .maybeSingle()
      if (!parent) throw new Error(`Parent section #${a.section_id} does not exist.`)
      if (parent.project_id !== a.project_id) {
        throw new Error(`Section #${a.section_id} belongs to project #${parent.project_id}, not #${a.project_id}.`)
      }

      // Reject duplicate subsection name under the same section
      const { data: dup } = await (supabase as any)
        .from('project_subsections')
        .select('id, section_name')
        .eq('section_id', a.section_id)
        .ilike('section_name', a.section_name.trim())
        .limit(1)
      if (dup && dup.length) {
        throw new Error(`Subsection "${dup[0].section_name}" already exists under section #${a.section_id} (id ${dup[0].id}). Reuse it.`)
      }

      const { data, error } = await (supabase as any)
        .from('project_subsections')
        .insert([{
          project_id: a.project_id,
          section_id: a.section_id,
          section_name: a.section_name.trim(),
          description: a.description || null,
          status: 'active',
          sort_order: a.sort_order || 0,
        }])
        .select()
        .single()
      if (error) throw error
      return data
    },
  },
  {
    name: 'add_part_to_project',
    kind: 'write',
    description:
      'Map an EXISTING master part to a project subsection as a BOM line. NEVER use this with a part_id you have not first verified via find_master_part_by_erp_id or search_master_parts. This tool will REJECT any (part_type, part_id) that is not in the master catalogue — it does NOT create new master parts. If the part is missing from master, stop and ask the user; only ingest a PO PDF or manually create the master record first.',
    parameters: {
      type: 'object',
      required: ['project_subsection_id', 'part_type', 'part_id', 'quantity', 'unit_price'],
      properties: {
        project_subsection_id: { type: 'number' },
        part_type: { type: 'string', enum: part_type_enum },
        part_id: { type: 'number' },
        quantity: { type: 'number', minimum: 1 },
        unit_price: { type: 'number', minimum: 0 },
        discount_percent: { type: 'number', minimum: 0, maximum: 100, default: 0 },
        currency: { type: 'string', default: 'INR' },
      },
    },
    summarize: (a) =>
      `Map ${a.quantity}× ${a.part_type} #${a.part_id} @ ${a.currency || 'INR'} ${a.unit_price} to subsection ${a.project_subsection_id} (disc ${a.discount_percent || 0}%)`,
    preflight: async (a: any) => {
      // Master part must exist
      const { data: master } = await (supabase as any)
        .from(a.part_type)
        .select('id, part_number')
        .eq('id', a.part_id)
        .maybeSingle()
      if (!master) {
        throw new Error(
          `Master part not found: ${a.part_type} #${a.part_id}. ` +
          `Use find_master_part_by_erp_id first; do not propose add_part_to_project for an unknown master.`,
        )
      }
      // Resolve target subsection → project_id, then check for duplicate mapping anywhere in the project
      const { data: targetSub } = await (supabase as any)
        .from('project_subsections')
        .select('id, project_id, section_name')
        .eq('id', a.project_subsection_id)
        .maybeSingle()
      if (!targetSub) throw new Error(`project_subsection ${a.project_subsection_id} not found.`)
      const { data: peerSubs } = await (supabase as any)
        .from('project_subsections')
        .select('id, section_name')
        .eq('project_id', targetSub.project_id)
      const peerIds = (peerSubs || []).map((s: any) => s.id)
      const { data: existing } = await (supabase as any)
        .from('project_parts')
        .select('id, project_section_id, quantity, unit_price')
        .eq('part_type', a.part_type)
        .eq('part_id', a.part_id)
        .in('project_section_id', peerIds.length ? peerIds : [targetSub.id])
      if (existing && existing.length) {
        const e = existing[0]
        const where = (peerSubs || []).find((s: any) => s.id === e.project_section_id)?.section_name || `subsection #${e.project_section_id}`
        throw new Error(
          `${master.part_number} is already mapped to project #${targetSub.project_id} (line id ${e.id}, in "${where}", qty ${e.quantity} @ ${e.unit_price}). ` +
          `Do NOT propose add_part_to_project. Use update_part_quantity to change qty/price, ` +
          `or move_part_to_subsection to relocate.`,
        )
      }
    },
    handler: async (a: any) => {
      // Field-level interlocks
      assertInteger('project_subsection_id', a.project_subsection_id)
      assertInteger('part_id', a.part_id)
      assertNumberInRange('quantity', a.quantity, 1, MAX_QTY)
      assertNumberInRange('unit_price', a.unit_price, 0, MAX_PRICE)
      if (a.discount_percent != null) assertNumberInRange('discount_percent', a.discount_percent, 0, 100)

      // Hard guard 1: master part must exist. add_part_to_project NEVER creates master parts.
      const { data: master, error: lookupErr } = await (supabase as any)
        .from(a.part_type)
        .select('id, part_number, beperp_part_no')
        .eq('id', a.part_id)
        .maybeSingle()
      if (lookupErr) throw lookupErr
      if (!master) {
        throw new Error(
          `Master part not found: ${a.part_type} #${a.part_id}. add_part_to_project only maps existing master parts. ` +
          `Use find_master_part_by_erp_id first; if the part is missing from master, ingest a PO PDF or create it explicitly with create_master_part — but do NOT auto-create as part of mapping.`,
        )
      }

      // Hard guard 2: never map the same master part twice into the same project.
      // We need the project_id of the chosen subsection to scope the duplicate check.
      const { data: targetSub, error: subErr } = await (supabase as any)
        .from('project_subsections')
        .select('id, project_id, section_name')
        .eq('id', a.project_subsection_id)
        .maybeSingle()
      if (subErr) throw subErr
      if (!targetSub) throw new Error(`project_subsection ${a.project_subsection_id} not found.`)

      const { data: peerSubs } = await (supabase as any)
        .from('project_subsections')
        .select('id, section_name')
        .eq('project_id', targetSub.project_id)
      const peerIds = (peerSubs || []).map((s: any) => s.id)

      const { data: existing } = await (supabase as any)
        .from('project_parts')
        .select('id, project_section_id, quantity, unit_price')
        .eq('part_type', a.part_type)
        .eq('part_id', a.part_id)
        .in('project_section_id', peerIds.length ? peerIds : [targetSub.id])
      if (existing && existing.length) {
        const e = existing[0]
        const where = (peerSubs || []).find((s: any) => s.id === e.project_section_id)?.section_name || `subsection #${e.project_section_id}`
        throw new Error(
          `This master part is already mapped to project #${targetSub.project_id} (line id ${e.id}, in "${where}", qty ${e.quantity} @ ${e.unit_price}). ` +
          `Update the existing line via update_part_quantity / move_part_to_subsection instead of adding a duplicate.`,
        )
      }

      const { data, error } = await (supabase as any)
        .from('project_parts')
        .insert([
          {
            project_section_id: a.project_subsection_id,
            part_type: a.part_type,
            part_id: a.part_id,
            quantity: a.quantity,
            unit_price: a.unit_price,
            discount_percent: a.discount_percent || 0,
            currency: a.currency || 'INR',
          },
        ])
        .select()
        .single()
      if (error) throw error
      return data
    },
  },
  {
    name: 'move_part_to_subsection',
    kind: 'write',
    description: 'Move an existing project_part row to a different subsection.',
    parameters: {
      type: 'object',
      required: ['project_part_id', 'target_subsection_id'],
      properties: {
        project_part_id: { type: 'number' },
        target_subsection_id: { type: 'number' },
      },
    },
    summarize: (a) =>
      `Move project_part #${a.project_part_id} → subsection #${a.target_subsection_id}`,
    handler: async (a: any) => {
      assertInteger('project_part_id', a.project_part_id)
      assertInteger('target_subsection_id', a.target_subsection_id)
      // Verify both rows exist and that the move is within the same project
      const { data: src } = await (supabase as any)
        .from('project_parts')
        .select('id, project_section_id, part_type, part_id')
        .eq('id', a.project_part_id)
        .maybeSingle()
      if (!src) throw new Error(`project_part #${a.project_part_id} does not exist.`)
      const { data: dstSub } = await (supabase as any)
        .from('project_subsections')
        .select('id, project_id, section_name')
        .eq('id', a.target_subsection_id)
        .maybeSingle()
      if (!dstSub) throw new Error(`target_subsection_id #${a.target_subsection_id} does not exist.`)
      const { data: srcSub } = await (supabase as any)
        .from('project_subsections')
        .select('id, project_id')
        .eq('id', src.project_section_id)
        .maybeSingle()
      if (srcSub && srcSub.project_id !== dstSub.project_id) {
        throw new Error(
          `Refusing cross-project move: project_part #${a.project_part_id} is in project #${srcSub.project_id}, ` +
          `target subsection is in project #${dstSub.project_id}. Cross-project moves are not supported.`,
        )
      }
      if (src.project_section_id === a.target_subsection_id) {
        throw new Error(`project_part #${a.project_part_id} is already in subsection #${a.target_subsection_id}.`)
      }
      // Don't allow the move if the destination subsection already has the same master part mapped
      const { data: existing } = await (supabase as any)
        .from('project_parts')
        .select('id')
        .eq('part_type', src.part_type)
        .eq('part_id', src.part_id)
        .eq('project_section_id', a.target_subsection_id)
        .limit(1)
      if (existing && existing.length) {
        throw new Error(
          `Subsection "${dstSub.section_name}" already has this master part (line id ${existing[0].id}). ` +
          `Merge with update_part_quantity instead of moving and creating a duplicate.`,
        )
      }
      const { data, error } = await (supabase as any)
        .from('project_parts')
        .update({ project_section_id: a.target_subsection_id })
        .eq('id', a.project_part_id)
        .select()
        .single()
      if (error) throw error
      return data
    },
  },
  {
    name: 'update_part_quantity',
    kind: 'write',
    description: 'Change the quantity (or discount %) of an existing project_part row.',
    parameters: {
      type: 'object',
      required: ['project_part_id'],
      properties: {
        project_part_id: { type: 'number' },
        quantity: { type: 'number', minimum: 0 },
        discount_percent: { type: 'number', minimum: 0, maximum: 100 },
        unit_price: { type: 'number', minimum: 0 },
      },
    },
    summarize: (a) => {
      const parts = []
      if (a.quantity != null) parts.push(`qty=${a.quantity}`)
      if (a.unit_price != null) parts.push(`price=${a.unit_price}`)
      if (a.discount_percent != null) parts.push(`disc=${a.discount_percent}%`)
      return `Update project_part #${a.project_part_id}: ${parts.join(', ')}`
    },
    handler: async (a: any) => {
      assertInteger('project_part_id', a.project_part_id)
      if (a.quantity != null) assertNumberInRange('quantity', a.quantity, 0, MAX_QTY)
      if (a.unit_price != null) assertNumberInRange('unit_price', a.unit_price, 0, MAX_PRICE)
      if (a.discount_percent != null) assertNumberInRange('discount_percent', a.discount_percent, 0, 100)
      await assertRowExists('project_parts', a.project_part_id, 'project_part')
      const patch: any = {}
      if (a.quantity != null) patch.quantity = a.quantity
      if (a.unit_price != null) patch.unit_price = a.unit_price
      if (a.discount_percent != null) patch.discount_percent = a.discount_percent
      if (Object.keys(patch).length === 0) {
        throw new Error('update_part_quantity: nothing to update — supply at least one of quantity, unit_price, discount_percent.')
      }
      const { data, error } = await (supabase as any)
        .from('project_parts')
        .update(patch)
        .eq('id', a.project_part_id)
        .select()
        .single()
      if (error) throw error
      return data
    },
  },
  {
    name: 'create_draft_po',
    kind: 'write',
    description:
      'Create a DRAFT purchase order from an attached PO PDF/image, AFTER the matching project_parts have been saved. ' +
      'Status is locked to "Draft" — the AI can never release, send, confirm, partial-receive or cancel a PO; the user does that from the PO screen. ' +
      'GST / CGST / SGST is NEVER included as a line item or added to grand_total. ' +
      'Each item must reference an existing project_part_id; the tool runs interlocks per line: ' +
      '(a) project_part.unit_price equals the unit_price you pass; ' +
      '(b) the unit_price you pass equals expected_price_from_source (the price you read off the PDF); ' +
      '(c) discount_percent agrees with the BOM line. ' +
      'One PO carries one supplier (purchase_orders.supplier_id) but the SAME PART can be supplied by DIFFERENT suppliers across POs — the master\'s supplier_id is informational and is NOT cross-checked against the PO supplier. ' +
      'Mismatches in (a)-(c) throw — fix the BOM mapping or re-read the PDF instead of forcing the PO through.',
    parameters: {
      type: 'object',
      required: ['project_id', 'supplier_id', 'po_date', 'expected_supplier_name', 'items'],
      properties: {
        project_id: { type: 'number' },
        supplier_id: { type: 'number' },
        expected_supplier_name: { type: 'string', description: 'Supplier name as printed on the source PDF — cross-checked against the DB row.' },
        po_number: { type: 'string', description: 'Optional. If omitted, auto-generated as CPO-<8digits>. You may pass the document number from the PDF (e.g. PO/P/25-26/100255).' },
        po_date: { type: 'string', description: 'ISO date as printed on the source PDF.' },
        expected_delivery_date: { type: 'string' },
        currency: { type: 'string', default: 'INR' },
        notes: { type: 'string' },
        items: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['project_part_id', 'quantity', 'unit_price', 'expected_price_from_source'],
            properties: {
              project_part_id: { type: 'number' },
              quantity: { type: 'number', minimum: 1 },
              unit_price: { type: 'number', minimum: 0 },
              discount_percent: { type: 'number', minimum: 0, maximum: 100, default: 0 },
              expected_price_from_source: { type: 'number', description: 'Unit price as printed on the PDF for this line (sanity check, must equal unit_price).' },
            },
          },
        },
      },
    },
    summarize: (a) => {
      const total = (a.items || []).reduce((s: number, it: any) =>
        s + (it.quantity || 0) * (it.unit_price || 0) * (1 - (it.discount_percent || 0) / 100), 0)
      return `Draft PO for project #${a.project_id} → supplier ${a.expected_supplier_name} (#${a.supplier_id}), ` +
        `${a.items?.length || 0} line(s), grand total ${a.currency || 'INR'} ${total.toFixed(2)} (excl. GST)`
    },
    handler: async (a: any) => {
      // Field-level interlocks
      assertInteger('project_id', a.project_id)
      assertInteger('supplier_id', a.supplier_id)
      assertNonEmpty('po_date', a.po_date)
      assertNonEmpty('expected_supplier_name', a.expected_supplier_name)
      if (!Array.isArray(a.items) || a.items.length === 0)
        throw new Error('items must be a non-empty array.')

      // Verify project + supplier
      const { data: project } = await (supabase as any)
        .from('projects').select('id, project_name, project_number').eq('id', a.project_id).maybeSingle()
      if (!project) throw new Error(`project #${a.project_id} does not exist.`)

      const { data: supplier } = await (supabase as any)
        .from('suppliers').select('id, name').eq('id', a.supplier_id).maybeSingle()
      if (!supplier) throw new Error(`supplier #${a.supplier_id} does not exist.`)

      // Cross-check supplier name vs the PDF
      const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[.,]/g, '').trim()
      if (!norm(supplier.name).includes(norm(a.expected_supplier_name)) &&
          !norm(a.expected_supplier_name).includes(norm(supplier.name))) {
        throw new Error(
          `Supplier mismatch: PO supplier_id #${a.supplier_id} is "${supplier.name}", ` +
          `but expected_supplier_name from PDF is "${a.expected_supplier_name}". ` +
          `Pick the correct supplier_id (use find_supplier_by_name) or stop and ask the user.`,
        )
      }

      // Reject duplicate project_part_ids inside the draft itself
      const seen = new Set<number>()
      for (const it of a.items) {
        if (seen.has(it.project_part_id))
          throw new Error(`project_part_id #${it.project_part_id} appears more than once in items[]; PO lines must be unique.`)
        seen.add(it.project_part_id)
      }

      // Per-line interlocks: project_part exists in this project, prices match, supplier matches
      const ppIds = a.items.map((it: any) => it.project_part_id)
      const { data: pps } = await (supabase as any)
        .from('project_parts')
        .select('id, project_section_id, part_type, part_id, quantity, unit_price, discount_percent, currency')
        .in('id', ppIds)
      const ppById = new Map<number, any>((pps || []).map((p: any) => [p.id, p]))

      const subIds = Array.from(new Set((pps || []).map((p: any) => p.project_section_id).filter(Boolean)))
      const { data: subs } = await (supabase as any)
        .from('project_subsections').select('id, project_id').in('id', subIds.length ? subIds : [-1])
      const subProjectById = new Map<number, number>((subs || []).map((s: any) => [s.id, s.project_id]))

      const poItems: any[] = []
      let grand = 0
      for (const it of a.items) {
        const pp = ppById.get(it.project_part_id)
        if (!pp) throw new Error(`project_part #${it.project_part_id} does not exist.`)

        // (1) project membership
        const ppProjectId = subProjectById.get(pp.project_section_id)
        if (ppProjectId !== a.project_id) {
          throw new Error(
            `project_part #${it.project_part_id} belongs to project #${ppProjectId ?? '?'}, not #${a.project_id}. ` +
            `A draft PO can only contain lines from the project it is being raised against.`,
          )
        }

        // (2) numeric range
        assertNumberInRange('items[].quantity', it.quantity, 1, MAX_QTY)
        assertNumberInRange('items[].unit_price', it.unit_price, 0, MAX_PRICE)
        assertNumberInRange('items[].expected_price_from_source', it.expected_price_from_source, 0, MAX_PRICE)
        if (it.discount_percent != null) assertNumberInRange('items[].discount_percent', it.discount_percent, 0, 100)

        // (3) price agreement: PDF == arg unit_price == saved project_part price
        const eps = 0.01
        if (Math.abs(it.unit_price - it.expected_price_from_source) > eps) {
          throw new Error(
            `Price mismatch on project_part #${it.project_part_id}: ` +
            `unit_price ${it.unit_price} != expected_price_from_source ${it.expected_price_from_source} (from PDF). ` +
            `Re-read the PDF; do NOT silently overwrite either value.`,
          )
        }
        if (Math.abs(Number(pp.unit_price || 0) - it.unit_price) > eps) {
          throw new Error(
            `Price drift on project_part #${it.project_part_id}: ` +
            `BOM line stores ${pp.unit_price}, draft says ${it.unit_price}. ` +
            `Update the BOM with update_part_quantity first, or fix the PDF reading. The draft PO will not be created with mismatched prices.`,
          )
        }
        // discount agreement (allow 0 vs null equivalence)
        const ppDisc = Number(pp.discount_percent || 0)
        const itDisc = Number(it.discount_percent || 0)
        if (Math.abs(ppDisc - itDisc) > eps) {
          throw new Error(
            `Discount drift on project_part #${it.project_part_id}: ` +
            `BOM line stores ${ppDisc}%, draft says ${itDisc}%. Reconcile before drafting.`,
          )
        }

        // (4) verify the master part exists. We do NOT require
        // master.supplier_id to equal the PO supplier_id — a single
        // part can legitimately be sourced from multiple suppliers
        // over time. master.supplier_id is treated as the "primary /
        // most recently used" supplier and is informational; it does
        // not constrain who can supply this part on a new PO. The
        // single-supplier-per-PO rule still holds via
        // purchase_orders.supplier_id.
        const { data: master } = await (supabase as any)
          .from(pp.part_type)
          .select('id, part_number, supplier_id')
          .eq('id', pp.part_id)
          .maybeSingle()
        if (!master) throw new Error(`Master part ${pp.part_type} #${pp.part_id} does not exist.`)

        // (5) build the wire row — GST is intentionally NOT applied
        const lineTotal = it.quantity * it.unit_price * (1 - itDisc / 100)
        grand += lineTotal
        poItems.push({
          part_type: pp.part_type,
          part_id: pp.part_id,
          part_number: master.part_number,
          description: null,
          quantity: it.quantity,
          unit_price: it.unit_price,
          discount_percent: itDisc,
          total_amount: lineTotal,
          project_part_id: pp.id,
        })
      }

      const po_number = a.po_number || `CPO-${Date.now().toString().slice(-8)}`
      const poData: any = {
        po_number,
        project_id: a.project_id,
        supplier_id: a.supplier_id,
        po_date: a.po_date,
        expected_delivery_date: a.expected_delivery_date || null,
        currency: a.currency || 'INR',
        status: 'Draft',          // hard-coded — AI cannot create non-Draft POs
        grand_total: grand,        // GST excluded by design
        total_items: poItems.length,
        total_quantity: poItems.reduce((s, i) => s + i.quantity, 0),
        notes: (a.notes ? a.notes + ' | ' : '') + 'Drafted by AI from source PO. GST excluded.',
        created_date: new Date().toISOString(),
      }
      return purchaseOrdersApi.createPurchaseOrderWithItems(poData, poItems)
    },
  },
  {
    name: 'apply_existing_po_pdf_correction',
    kind: 'write',
    description:
      'Correct an existing PO, including a Released PO, so its header and line items match the attached BEP PO PDF. Requires approval. It never changes PO status. It validates supplier/project mapping and blocks unresolved PDF lines. Use preview_existing_po_pdf_correction first.',
    parameters: {
      type: 'object',
      required: ['po_id'],
      properties: {
        po_id: { type: 'number' },
        allow_delete_received_lines: {
          type: 'boolean',
          default: false,
          description: 'Set true only when user explicitly accepts removing old PO lines that already have received_qty.',
        },
        correct_po_number: {
          type: 'boolean',
          default: true,
          description: 'Update purchase_orders.po_number from the PDF document number when detected.',
        },
        correct_po_date: {
          type: 'boolean',
          default: true,
          description: 'Update purchase_orders.po_date from the PDF date when detected.',
        },
      },
    },
    summarize: (a) =>
      `Correct existing PO #${a.po_id} from its attached PDF${a.allow_delete_received_lines ? ' (including received extra lines)' : ''}`,
    handler: async (a: any) => {
      assertInteger('po_id', a.po_id)
      const plan = await buildExistingPoPdfCorrectionPlan(a.po_id, Boolean(a.allow_delete_received_lines))
      if (!plan.ok_to_apply) {
        throw new Error(plan.message || 'PO PDF correction is not safe to apply yet.')
      }

      for (const item of plan.desired_items || []) {
        const row = {
          purchase_order_id: a.po_id,
          part_type: item.part_type,
          part_id: item.part_id,
          part_number: item.part_number,
          description: item.description,
          quantity: item.quantity,
          received_qty: item.received_qty || 0,
          unit_price: item.unit_price,
          discount_percent: item.discount_percent || 0,
          total_amount: item.total_amount,
          project_part_id: item.project_part_id,
        }

        if (item.old_item_id) {
          const { error } = await (supabase as any)
            .from('purchase_order_items')
            .update(row)
            .eq('id', item.old_item_id)
          if (error) throw error
        } else {
          const { error } = await (supabase as any)
            .from('purchase_order_items')
            .insert(row)
          if (error) throw error
        }
      }

      if ((plan.delete_item_ids || []).length) {
        const { error } = await (supabase as any)
          .from('purchase_order_items')
          .delete()
          .in('id', plan.delete_item_ids)
        if (error) throw error
      }

      const headerPatch: any = {
        updated_date: new Date().toISOString(),
      }
      if (a.correct_po_number !== false && plan.parsed_pdf?.po_number && /^PO\/.+\/\d+/i.test(plan.parsed_pdf.po_number)) {
        headerPatch.po_number = plan.parsed_pdf.po_number
      }
      if (a.correct_po_date !== false && plan.parsed_pdf?.po_date) {
        headerPatch.po_date = plan.parsed_pdf.po_date
      }
      if (Object.keys(headerPatch).length > 1) {
        const { error } = await (supabase as any)
          .from('purchase_orders')
          .update(headerPatch)
          .eq('id', a.po_id)
        if (error) throw error
      }

      const totals = await purchaseOrdersApi.recalcPOTotals(a.po_id)
      return {
        corrected: true,
        po_id: a.po_id,
        po_number: headerPatch.po_number || plan.po.po_number,
        status_unchanged: plan.po.status,
        line_count: plan.desired_items.length,
        changes: plan.changes,
        totals,
      }
    },
  },
  {
    name: 'apply_released_po_pdf_repairs',
    kind: 'write',
    description:
      'Bulk-correct every finalized/active PO in one project that has an attached BEP PO PDF. Includes Released, Pending, Sent, Confirmed, Partial, and Received POs; excludes Draft and Cancelled. Deletes DB-only PO lines that are not in the PDF, updates/inserts PDF lines, fixes PO number/date, recalculates totals, and never changes PO status. Requires approval.',
    parameters: {
      type: 'object',
      required: ['project_id'],
      properties: {
        project_id: { type: 'number' },
        allow_delete_received_lines: {
          type: 'boolean',
          default: true,
          description: 'Set true only when user explicitly wants DB-only lines removed even if they already have received_qty.',
        },
        correct_po_number: {
          type: 'boolean',
          default: true,
          description: 'Update each PO number from the attached PDF document number when detected.',
        },
        correct_po_date: {
          type: 'boolean',
          default: true,
          description: 'Update each PO date from the attached PDF date when detected.',
        },
      },
    },
    summarize: (a) =>
      `Repair finalized/active POs in project #${a.project_id} from attached PDFs; delete DB-only lines${a.allow_delete_received_lines ? ', including received extra lines' : ''}`,
    handler: async (a: any) => {
      assertInteger('project_id', a.project_id)
      const preview = await buildReleasedPoPdfRepairPreview(a.project_id, Boolean(a.allow_delete_received_lines))
      if (!preview.ready_count) {
        throw new Error('No finalized/active POs are ready for PDF repair. Check missing PDFs and blocked rows first.')
      }
      if (preview.blocked_count) {
        throw new Error(`${preview.blocked_count} finalized/active PO(s) are blocked. Fix unresolved PDF/project mappings before running bulk repair.`)
      }

      const applied = []
      for (const row of preview.ready) {
        applied.push(await applyExistingPoPdfCorrection({
          po_id: row.po_id,
          allow_delete_received_lines: a.allow_delete_received_lines !== false,
          correct_po_number: a.correct_po_number !== false,
          correct_po_date: a.correct_po_date !== false,
        }))
      }

      return {
        repaired: applied.length,
        project: preview.project,
        status_unchanged: true,
        deleted_db_only_lines: preview.totals.delete_lines,
        deleted_received_lines: preview.totals.delete_received_lines,
        totals_before: preview.totals.old_total,
        totals_after: preview.totals.new_total,
        applied,
        skipped_missing_pdf: preview.missing_pdf,
      }
    },
  },
  {
    name: 'stock_in',
    kind: 'write',
    description:
      'Record an inward stock movement (manual receipt outside of a PO). For PO-linked receipts use update_po_status with Received instead.',
    parameters: {
      type: 'object',
      required: ['part_table_name', 'part_id', 'part_number', 'quantity'],
      properties: {
        part_table_name: { type: 'string', enum: part_type_enum },
        part_id: { type: 'number' },
        part_number: { type: 'string' },
        quantity: { type: 'number', minimum: 1 },
        supplier_id: { type: 'number' },
        po_number: { type: 'string' },
        reference_notes: { type: 'string' },
      },
    },
    summarize: (a) => `Stock IN: +${a.quantity} of ${a.part_number} (${a.part_table_name})`,
    handler: async (a: any) => {
      assertInteger('part_id', a.part_id)
      assertNumberInRange('quantity', a.quantity, 1, MAX_QTY)
      assertNonEmpty('part_number', a.part_number)
      const { data: part } = await (supabase as any)
        .from(a.part_table_name).select('id, stock_quantity, part_number').eq('id', a.part_id).maybeSingle()
      if (!part) throw new Error(`${a.part_table_name} master part #${a.part_id} does not exist.`)
      if (part.part_number && part.part_number !== a.part_number) {
        throw new Error(
          `part_number mismatch: master record is "${part.part_number}" but stock_in payload says "${a.part_number}". Verify the row before retrying.`,
        )
      }
      // PO interlock: when a po_number is provided, total IN against
      // this (PO, part) cannot exceed the ordered qty for that part on
      // that PO. Manual stock_in without po_number is unrestricted.
      if (a.po_number) {
        const { ordered, completed, remaining } = await getPoRemainingForPart({
          poNumber: a.po_number,
          partTable: a.part_table_name,
          partId: a.part_id,
          mode: 'IN',
        })
        if (ordered === 0) {
          throw new Error(
            `PO ${a.po_number} has no line for ${a.part_number} (${a.part_table_name}). ` +
            `Either drop po_number to record a manual receipt, or correct the PO/part reference.`,
          )
        }
        if (a.quantity > remaining) {
          throw new Error(
            `Cannot stock_in ${a.quantity} for ${a.part_number} against PO ${a.po_number}: ` +
            `ordered ${ordered}, already received ${completed}, only ${remaining} remaining. ` +
            `Adjust stock manually from Part Master if needed.`,
          )
        }
      }
      const stockBefore = (part as any)?.stock_quantity ?? 0
      const stockAfter = stockBefore + a.quantity
      await (supabase as any).from(a.part_table_name).update({ stock_quantity: stockAfter }).eq('id', a.part_id)
      return stockMovementsApi.addMovement({
        movement_type: 'IN',
        part_table_name: a.part_table_name,
        part_id: a.part_id,
        part_number: a.part_number,
        quantity: a.quantity,
        stock_before: stockBefore,
        stock_after: stockAfter,
        supplier_id: a.supplier_id,
        po_number: a.po_number,
        reference_notes: a.reference_notes,
      } as any)
    },
  },
  {
    name: 'stock_out',
    kind: 'write',
    description:
      'Record an outward stock movement (issue to project / scrap). When the issue is being made against a specific PO, pass po_number — the tool then caps the OUT against the PO ordered qty.',
    parameters: {
      type: 'object',
      required: ['part_table_name', 'part_id', 'part_number', 'quantity'],
      properties: {
        part_table_name: { type: 'string', enum: part_type_enum },
        part_id: { type: 'number' },
        part_number: { type: 'string' },
        quantity: { type: 'number', minimum: 1 },
        project_id: { type: 'number' },
        po_number: { type: 'string' },
        reference_notes: { type: 'string' },
      },
    },
    summarize: (a) => `Stock OUT: -${a.quantity} of ${a.part_number} (${a.part_table_name})`,
    handler: async (a: any) => {
      assertInteger('part_id', a.part_id)
      assertNumberInRange('quantity', a.quantity, 1, MAX_QTY)
      assertNonEmpty('part_number', a.part_number)
      const { data: part } = await (supabase as any)
        .from(a.part_table_name).select('id, stock_quantity, part_number').eq('id', a.part_id).maybeSingle()
      if (!part) throw new Error(`${a.part_table_name} master part #${a.part_id} does not exist.`)
      if (part.part_number && part.part_number !== a.part_number) {
        throw new Error(
          `part_number mismatch: master record is "${part.part_number}" but stock_out payload says "${a.part_number}". Verify the row before retrying.`,
        )
      }
      // PO interlock: when a po_number is provided, total OUT against
      // this (PO, part) cannot exceed the ordered qty for that part on
      // that PO. Manual stock_out without a po_number is only capped
      // by master stock.
      if (a.po_number) {
        const { ordered, completed, remaining } = await getPoRemainingForPart({
          poNumber: a.po_number,
          partTable: a.part_table_name,
          partId: a.part_id,
          mode: 'OUT',
        })
        if (ordered === 0) {
          throw new Error(
            `PO ${a.po_number} has no line for ${a.part_number} (${a.part_table_name}). ` +
            `Either drop po_number to record a manual issue, or correct the PO/part reference.`,
          )
        }
        if (a.quantity > remaining) {
          throw new Error(
            `Cannot stock_out ${a.quantity} for ${a.part_number} against PO ${a.po_number}: ` +
            `ordered ${ordered}, already issued ${completed}, only ${remaining} remaining. ` +
            `Adjust stock manually from Part Master if needed.`,
          )
        }
      }
      const stockBefore = (part as any)?.stock_quantity ?? 0
      if (stockBefore < a.quantity) throw new Error(`Insufficient stock for ${part.part_number}. Have ${stockBefore}, need ${a.quantity}.`)
      const stockAfter = stockBefore - a.quantity
      await (supabase as any).from(a.part_table_name).update({ stock_quantity: stockAfter }).eq('id', a.part_id)
      return stockMovementsApi.addMovement({
        movement_type: 'OUT',
        part_table_name: a.part_table_name,
        part_id: a.part_id,
        part_number: a.part_number,
        quantity: a.quantity,
        stock_before: stockBefore,
        stock_after: stockAfter,
        project_id: a.project_id,
        po_number: a.po_number,
        reference_notes: a.reference_notes,
      } as any)
    },
  },
  {
    name: 'render_html_report',
    kind: 'read',
    description:
      'Display an HTML report inside the chat panel. The model should pass already-rendered HTML (no scripts). Use Tailwind classes for styling.',
    parameters: {
      type: 'object',
      required: ['title', 'html'],
      properties: {
        title: { type: 'string' },
        html: { type: 'string', description: 'Sanitized HTML body. <script> and event handlers are stripped before render.' },
      },
    },
    handler: async ({ title, html }: any) => ({ title, html }),
  },
]

export const READ_TOOL_NAMES = TOOL_REGISTRY.filter(t => t.kind === 'read').map(t => t.name)
export const WRITE_TOOL_NAMES = TOOL_REGISTRY.filter(t => t.kind === 'write').map(t => t.name)

export function findTool(name: string) {
  return TOOL_REGISTRY.find(t => t.name === name)
}

export function toOpenAITools() {
  return TOOL_REGISTRY.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description:
        (t.kind === 'write' ? '[WRITE — user approval required] ' : '') + t.description,
      parameters: t.parameters,
    },
  }))
}

/** Strip <script>, on*= handlers, and javascript: URLs from AI-supplied HTML. */
export function sanitizeHTML(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '')
}
