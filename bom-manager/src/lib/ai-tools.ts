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
    handler: async (a: any) => {
      const notes = [a.gstin && `GSTIN: ${a.gstin}`].filter(Boolean).join(' | ') || null
      const { data, error } = await (supabase as any)
        .from('suppliers')
        .insert([{
          name: a.name,
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
    handler: async (a: any) => {
      const prefix = PREFIX_BY_PART_TYPE[a.part_type]
      if (!prefix) throw new Error(`Unknown part_type: ${a.part_type}`)
      if (!a.beperp_part_no) throw new Error('beperp_part_no (ERP Item Code) is required')
      const part_number = `${prefix}-${a.beperp_part_no}`

      // Hard duplicate check before insert
      const { data: dup } = await (supabase as any)
        .from(a.part_type)
        .select('id, part_number')
        .or(`part_number.eq.${part_number},beperp_part_no.eq.${a.beperp_part_no}`)
        .limit(1)
      if (dup && dup.length) {
        throw new Error(
          `A master part with part_number "${part_number}" or ERP id "${a.beperp_part_no}" already exists (id ${dup[0].id}). Use update_master_part_price to change its data.`,
        )
      }

      const insertRow: any = {
        part_number,
        beperp_part_no: a.beperp_part_no,
        manufacturer_part_number: a.manufacturer_part_number || null,
        description: a.description,
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
      const patch: any = {}
      if (a.base_price != null) patch.base_price = a.base_price
      if (a.discount_percent != null) patch.discount_percent = a.discount_percent
      if (a.currency) patch.currency = a.currency
      if (a.image_path) patch.image_path = a.image_path
      if (a.manufacturer_part_number) patch.manufacturer_part_number = a.manufacturer_part_number
      if (a.last_price_date) patch.updated_date = a.last_price_date
      else patch.updated_date = new Date().toISOString()
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
    handler: async (a: any) => {
      const { data, error } = await (supabase as any)
        .from('project_sections')
        .insert([{ project_id: a.project_id, name: a.name, order_index: a.order_index || 0 }])
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
    handler: async (a: any) => {
      const { data, error } = await (supabase as any)
        .from('project_subsections')
        .insert([{
          project_id: a.project_id,
          section_id: a.section_id,
          section_name: a.section_name,
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
    handler: async (a: any) => {
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
      const patch: any = {}
      if (a.quantity != null) patch.quantity = a.quantity
      if (a.unit_price != null) patch.unit_price = a.unit_price
      if (a.discount_percent != null) patch.discount_percent = a.discount_percent
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
    name: 'release_purchase_order',
    kind: 'write',
    description: 'Release a Draft PO. Will fail if the PO has no BEP PO PDF attached.',
    parameters: {
      type: 'object',
      required: ['po_id'],
      properties: { po_id: { type: 'number' } },
    },
    summarize: (a) => `Release purchase order #${a.po_id} (Draft → Released)`,
    handler: async (a: any) => purchaseOrdersApi.releasePO(a.po_id),
  },
  {
    name: 'update_po_status',
    kind: 'write',
    description: 'Move a PO to the next state (Sent, Confirmed, Partial, Received, Cancelled).',
    parameters: {
      type: 'object',
      required: ['po_id', 'new_status'],
      properties: {
        po_id: { type: 'number' },
        new_status: {
          type: 'string',
          enum: ['Released', 'Sent', 'Confirmed', 'Partial', 'Received', 'Cancelled'],
        },
      },
    },
    summarize: (a) => `Set PO #${a.po_id} status → ${a.new_status}`,
    handler: async (a: any) => purchaseOrdersApi.updateStatus(a.po_id, a.new_status),
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
      const { data: part } = await (supabase as any)
        .from(a.part_table_name).select('stock_quantity').eq('id', a.part_id).single()
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
      const { data: part } = await (supabase as any)
        .from(a.part_table_name).select('stock_quantity').eq('id', a.part_id).single()
      const stockBefore = (part as any)?.stock_quantity ?? 0
      if (stockBefore < a.quantity) throw new Error(`Insufficient stock. Have ${stockBefore}, need ${a.quantity}`)
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
