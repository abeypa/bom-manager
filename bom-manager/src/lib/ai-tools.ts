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
    name: 'add_part_to_project',
    kind: 'write',
    description:
      'Add a master part as a BOM line in a project subsection. Requires user approval. Use search_master_parts first to find part_id and part_type.',
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
      `Add ${a.quantity}× ${a.part_type} #${a.part_id} @ ${a.currency || 'INR'} ${a.unit_price} to subsection ${a.project_subsection_id} (disc ${a.discount_percent || 0}%)`,
    handler: async (a: any) => {
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
