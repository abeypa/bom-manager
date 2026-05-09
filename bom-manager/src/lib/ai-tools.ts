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
import { projectsApi } from '@/api/projects'
import { suppliersApi } from '@/api/suppliers'
import { purchaseOrdersApi } from '@/api/purchase-orders'
import { stockMovementsApi } from '@/api/stock-movements'
import { supabase } from '@/lib/supabase'

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
      'Search Wikimedia Commons (CORS-friendly, free, no key) for an image matching the query and return the first usable image URL. May return empty if nothing relevant is found — that is OK, the part can be created without an image.',
    parameters: {
      type: 'object',
      required: ['query'],
      properties: { query: { type: 'string', description: 'e.g. "Siemens 5ST3010 auxiliary switch"' } },
    },
    handler: async ({ query }: any) => {
      const url =
        'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrlimit=5&gsrnamespace=6' +
        '&prop=imageinfo&iiprop=url&iiurlwidth=400&gsrsearch=' +
        encodeURIComponent(`filetype:bitmap ${query}`)
      try {
        const res = await fetch(url)
        const json = await res.json()
        const pages = json?.query?.pages || {}
        for (const id of Object.keys(pages)) {
          const ii = pages[id]?.imageinfo?.[0]
          if (ii?.thumburl) return { found: true, image_url: ii.thumburl, source: 'wikimedia' }
          if (ii?.url) return { found: true, image_url: ii.url, source: 'wikimedia' }
        }
        return { found: false, image_url: null, source: 'wikimedia' }
      } catch (e: any) {
        return { found: false, image_url: null, error: e?.message }
      }
    },
  },
  {
    name: 'list_purchase_orders',
    kind: 'read',
    description: 'List purchase orders, optionally filtered by status or project.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        project_id: { type: 'number' },
      },
    },
    handler: async ({ status, project_id }: any) => {
      let q = (supabase as any).from('purchase_orders').select('id, po_number, status, project_id, supplier_id, grand_total, total_items, po_date, expected_delivery_date')
      if (status) q = q.eq('status', status)
      if (project_id) q = q.eq('project_id', project_id)
      const { data } = await q.order('po_date', { ascending: false }).limit(200)
      return data
    },
  },

  // ── WRITE (require user approval) ───────────────────────────────────────
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
      'Update price / discount / image / last_price_date on an EXISTING master part. Use when a new PO has the same item code at a different price.',
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
      },
    },
    summarize: (a) => {
      const bits = []
      if (a.base_price != null) bits.push(`price=${a.base_price}`)
      if (a.discount_percent != null) bits.push(`disc=${a.discount_percent}%`)
      if (a.image_path) bits.push('image set')
      return `Update ${a.part_type} #${a.part_id}: ${bits.join(', ') || 'metadata'}`
    },
    handler: async (a: any) => {
      assertInteger('part_id', a.part_id)
      if (a.base_price != null) assertNumberInRange('base_price', a.base_price, 0, MAX_PRICE)
      if (a.discount_percent != null) assertNumberInRange('discount_percent', a.discount_percent, 0, 100)
      await assertRowExists(a.part_type, a.part_id, `${a.part_type} master part`)

      const patch: any = {}
      if (a.base_price != null) patch.base_price = a.base_price
      if (a.discount_percent != null) patch.discount_percent = a.discount_percent
      if (a.currency) patch.currency = a.currency
      if (a.image_path) patch.image_path = a.image_path
      if (a.manufacturer_part_number) patch.manufacturer_part_number = a.manufacturer_part_number
      if (a.last_price_date) patch.updated_date = a.last_price_date
      else patch.updated_date = new Date().toISOString()
      if (Object.keys(patch).length === 1 /* only updated_date */) {
        throw new Error('update_master_part_price: nothing to update — supply at least one of base_price, discount_percent, currency, image_path, manufacturer_part_number, last_price_date.')
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
      'Each item must reference an existing project_part_id; the tool runs three interlocks per line: ' +
      '(a) project_part.unit_price equals the unit_price you pass; ' +
      '(b) the unit_price you pass equals expected_price_from_source (the price you read off the PDF); ' +
      '(c) the master part for that project_part has supplier_id equal to the PO supplier_id. ' +
      'Mismatches throw — fix the BOM mapping or re-read the PDF instead of forcing the PO through.',
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

        // (4) the master part referenced by this BOM line must belong to the PO supplier
        const { data: master } = await (supabase as any)
          .from(pp.part_type)
          .select('id, part_number, supplier_id')
          .eq('id', pp.part_id)
          .maybeSingle()
        if (!master) throw new Error(`Master part ${pp.part_type} #${pp.part_id} does not exist.`)
        if (master.supplier_id && master.supplier_id !== a.supplier_id) {
          throw new Error(
            `Supplier mismatch on project_part #${it.project_part_id} (${master.part_number}): ` +
            `master record's supplier is #${master.supplier_id}, draft PO supplier is #${a.supplier_id}. ` +
            `A PO can only contain lines from one supplier.`,
          )
        }

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
    description: 'Record an outward stock movement (issue to project / scrap).',
    parameters: {
      type: 'object',
      required: ['part_table_name', 'part_id', 'part_number', 'quantity'],
      properties: {
        part_table_name: { type: 'string', enum: part_type_enum },
        part_id: { type: 'number' },
        part_number: { type: 'string' },
        quantity: { type: 'number', minimum: 1 },
        project_id: { type: 'number' },
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
