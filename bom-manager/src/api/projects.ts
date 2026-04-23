import { supabase } from '@/lib/supabase'
import { partsApi } from './parts'

export type Project = {
  id: number
  project_name: string
  project_number: string
  customer: string | null
  description: string | null
  status: string
  start_date: string | null
  target_completion_date: string | null
  actual_completion_date: string | null
  mechanical_design_status: string | null
  ee_design_status: string | null
  pneumatic_design_status: string | null
  po_release_status: string | null
  part_arrival_status: string | null
  machine_build_status: string | null
  created_date: string
  updated_date: string | null
}

export type ProjectInsert = Omit<Project, 'id' | 'created_date' | 'updated_date'>
export type ProjectUpdate = Partial<ProjectInsert>

// Section = top-level grouping (project_sections table, column: "name")
export type ProjectSection = {
  id: number
  project_id: number
  name: string
  order_index: number
  created_at: string
}

// Subsection = inside a Section, holds parts (project_subsections table, column: "section_name")
export type ProjectSubsection = {
  id: number
  project_id: number
  section_id: number | null        // FK → project_sections.id
  section_name: string
  description: string | null
  status: string
  estimated_cost: number | null
  actual_cost: number | null
  start_date: string | null
  target_completion_date: string | null
  sort_order: number | null
  image_path: string | null
  drawing_path: string | null
  datasheet_path: string | null
  created_date: string
  updated_date: string | null
}

type PartCategory =
  | 'mechanical_manufacture'
  | 'mechanical_bought_out'
  | 'electrical_manufacture'
  | 'electrical_bought_out'
  | 'pneumatic_bought_out'

const PART_DEFS = [
  { key: 'mechanical_manufacture_id',     table: 'mechanical_manufacture'  as PartCategory },
  { key: 'mechanical_bought_out_part_id', table: 'mechanical_bought_out'   as PartCategory },
  { key: 'electrical_manufacture_id',     table: 'electrical_manufacture'  as PartCategory },
  { key: 'electrical_bought_out_part_id', table: 'electrical_bought_out'   as PartCategory },
  { key: 'pneumatic_bought_out_part_id',  table: 'pneumatic_bought_out'    as PartCategory },
]

// Helper: Log stock movement (non-throwing)
const logStockMovement = async (
  movementType: 'IN' | 'OUT' | 'ADJUST' | 'RESTORE',
  partTable: PartCategory,
  partId: number,
  partNumber: string,
  quantity: number,
  stockBefore: number,
  stockAfter: number,
  extra: any = {}
) => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    await (supabase as any).from('stock_movements').insert({
      movement_type: movementType,
      part_table_name: partTable,
      part_id: partId,
      part_number: partNumber,
      quantity: movementType === 'OUT' ? -quantity : quantity,
      stock_before: stockBefore,
      stock_after: stockAfter,
      ...extra,
      moved_by: user?.email || 'system',
    })
  } catch (err) {
    console.error('Failed to log stock movement:', err)
  }
}

export const projectsApi = {

  // ─── PROJECTS ──────────────────────────────────────────────────────────────

  getProjects: async () => {
    const { data, error } = await (supabase as any)
      .from('projects')
      .select('*')
      .order('created_date', { ascending: false })
    if (error) throw error
    return data
  },

  /**
   * Fetch full project hierarchy in separate queries (avoids nested select issues):
   *   Project → Sections → Subsections → Parts
   *
   * DB tables:
   *   project_sections    (id, project_id, name, order_index)
   *   project_subsections (id, project_id, section_id, section_name, ...)
   *   project_parts       (id, project_section_id → subsection id, ...)
   */
  getProject: async (projectId: number) => {
    // 1. Project
    const { data: project, error: projErr } = await (supabase as any)
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (projErr) {
      console.error('[getProject] project query error:', projErr)
      throw projErr
    }
    if (!project) {
      console.error('[getProject] project is null for id:', projectId)
      throw new Error(`Project ${projectId} not found — it may not exist or your session has expired. Try logging out and back in.`)
    }

    // 2. Sections (top-level, column: "name")
    const { data: sections, error: secErr } = await (supabase as any)
      .from('project_sections')
      .select('*')
      .eq('project_id', projectId)
      .order('order_index', { ascending: true })

    if (secErr) {
      console.error('sections error:', secErr)
      throw secErr
    }

    // 3. Subsections (column: "section_name", FK: "section_id")
    const { data: subsections, error: subErr } = await (supabase as any)
      .from('project_subsections')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })

    if (subErr) {
      console.error('subsections error:', subErr)
      throw subErr
    }

    // 4. Parts (FK: project_section_id → subsection id)
    const subsectionIds = (subsections || []).map((s: any) => s.id)
    let parts: any[] = []

    if (subsectionIds.length > 0) {
      // Step 4 - fetch parts only, no joins
      const { data: partsData, error: partsErr } = await (supabase as any)
        .from('project_parts')
        .select('*')
        .in('project_section_id', subsectionIds)

      if (partsErr) {
        console.error('parts error:', partsErr)
        throw partsErr
      }

      // Step 4b - fetch part details per part_type
      const partsByType: Record<string, any[]> = {}
      for (const p of (partsData || [])) {
        if (!p.part_type || !p.part_id) continue;
        if (!partsByType[p.part_type]) partsByType[p.part_type] = []
        partsByType[p.part_type].push(p.part_id)
      }

      const partDetailsMap: Record<string, Record<number, any>> = {}
      for (const [partType, ids] of Object.entries(partsByType)) {
        // Unique IDs to minimize query size
        const uniqueIds = Array.from(new Set(ids))
        const { data: details, error: detailsErr } = await (supabase as any)
          .from(partType)
          .select('*, suppliers:supplier_id(*)')
          .in('id', uniqueIds)

        if (detailsErr) {
          console.warn(`Error fetching details for type ${partType}:`, detailsErr)
          continue
        }

        partDetailsMap[partType] = {}
        for (const d of (details || [])) {
          partDetailsMap[partType][d.id] = d
        }
      }

      parts = (partsData || []).map((p: any) => ({
        ...p,
        part_ref: partDetailsMap[p.part_type]?.[p.part_id] || null,
      }))
    }

    // 5. PO Status Integration (NEW)
    const { data: poItems, error: poItemsErr } = await supabase
      .from('purchase_order_items')
      .select('id, project_part_id, received_qty, purchase_orders(po_number, status)')
      .in('project_part_id', parts.map(p => p.id))

    if (!poItemsErr && poItems) {
      // Map PO info to parts - prioritize non-Draft statuses if multiple POs exist for the same item
      parts = parts.map(p => {
        const itemMatches = (poItems as any[]).filter(i => i.project_part_id === p.id)
        if (itemMatches.length === 0) return { ...p, po_info: null }
        
        // Prioritize released/sent/received over Draft
        const bestMatch = itemMatches.find(i => i.purchase_orders?.status !== 'Draft') || itemMatches[0]
        
        return {
          ...p,
          po_info: {
            po_number: bestMatch.purchase_orders?.po_number,
            status: bestMatch.purchase_orders?.status,
            received_qty: bestMatch.received_qty || 0
          }
        }
      })
    }

    // 6. Build hierarchy in JS
    const subsectionsWithParts = (subsections || []).map((sub: any) => ({
      ...sub,
      parts: parts
        .filter((p: any) => p.project_section_id === sub.id)
        .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    }))

    const sectionIds = new Set((sections || []).map((s: any) => s.id))

    const sectionsWithSubsections = (sections || []).map((sec: any) => ({
      ...sec,
      subsections: subsectionsWithParts
        .filter((sub: any) => sub.section_id === sec.id)
        .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    }))

    const orphanedSubsections = subsectionsWithParts.filter(
      (sub: any) => !sub.section_id || !sectionIds.has(sub.section_id)
    )

    return {
      ...project,
      sections: sectionsWithSubsections,
      orphaned_subsections: orphanedSubsections,
    }
  },

  createProject: async (project: ProjectInsert) => {
    const { data, error } = await (supabase as any)
      .from('projects')
      .insert([project])
      .select()
      .single()
    if (error) throw error
    return data
  },

  updateProject: async (id: number, project: ProjectUpdate) => {
    const { data, error } = await (supabase as any)
      .from('projects')
      .update(project)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  deleteProject: async (id: number) => {
    const { error } = await (supabase as any).from('projects').delete().eq('id', id)
    if (error) throw error
  },

  // ─── SECTIONS ──────────────────────────────────────────────────────────────
  // Table: project_sections | Columns: id, project_id, name, order_index

  getSections: async (projectId: number) => {
    const { data, error } = await (supabase as any)
      .from('project_sections')
      .select('*')
      .eq('project_id', projectId)
      .order('order_index', { ascending: true })
    if (error) throw error
    return data
  },

  createSection: async (section: { project_id: number; name: string; order_index?: number }) => {
    const { data, error } = await (supabase as any)
      .from('project_sections')
      .insert([{ order_index: 0, ...section }])
      .select()
      .single()
    if (error) throw error
    return data
  },

  updateSection: async (id: number, section: { name?: string; order_index?: number; image_path?: string | null }) => {
    const { data, error } = await (supabase as any)
      .from('project_sections')
      .update(section)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  reorderSections: async (projectId: number, sectionIds: number[]) => {
    const updates = sectionIds.map((id, index) => 
      (supabase as any).from('project_sections').update({ order_index: index }).eq('id', id)
    );
    await Promise.all(updates);
  },

  deleteSection: async (id: number) => {
    const { error } = await (supabase as any).from('project_sections').delete().eq('id', id)
    if (error) throw error
  },

  // Backward compat aliases
  createMainSection: async (section: { project_id: number; name: string }) => {
    return projectsApi.createSection(section)
  },
  updateMainSection: async (id: number, section: { name?: string }) => {
    return projectsApi.updateSection(id, section)
  },
  deleteMainSection: async (id: number) => {
    return projectsApi.deleteSection(id)
  },

  // ─── SUBSECTIONS ───────────────────────────────────────────────────────────
  // Table: project_subsections | FK: section_id → project_sections.id

  createSubsection: async (subsection: {
    project_id: number
    section_id: number
    section_name: string
    description?: string | null
    status?: string
    estimated_cost?: number | null
    actual_cost?: number | null
    start_date?: string | null
    target_completion_date?: string | null
    sort_order?: number | null
    image_path?: string | null
    drawing_path?: string | null
    datasheet_path?: string | null
  }) => {
    const { data, error } = await (supabase as any)
      .from('project_subsections')
      .insert([{ status: 'planning', sort_order: 0, ...subsection }])
      .select()
      .single()
    if (error) throw error
    return data
  },

  updateSubsection: async (id: number, subsection: Partial<ProjectSubsection>) => {
    // Remove read-only fields
    const { id: _id, created_date: _cd, ...rest } = subsection as any
    const { data, error } = await (supabase as any)
      .from('project_subsections')
      .update(rest)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  deleteSubsection: async (id: number) => {
    const { error } = await (supabase as any).from('project_subsections').delete().eq('id', id)
    if (error) throw error
  },

  reorderSubsections: async (sectionId: number, subsectionIds: number[]) => {
    const updates = subsectionIds.map((id, index) => 
      (supabase as any).from('project_subsections').update({ sort_order: index, section_id: sectionId }).eq('id', id)
    );
    await Promise.all(updates);
  },

  // ─── COPY SUBSECTION ───────────────────────────────────────────────────────

  copySubsection: async (subsectionId: number, targetProjectId: number, targetSectionId?: number) => {
    const { data: sub, error: subErr } = await (supabase as any)
      .from('project_subsections')
      .select('*')
      .eq('id', subsectionId)
      .single()
    if (subErr) throw subErr

    const { data: existingParts } = await (supabase as any)
      .from('project_parts')
      .select('*')
      .eq('project_section_id', subsectionId)

    const { data: newSub, error: insErr } = await (supabase as any)
      .from('project_subsections')
      .insert([{
        project_id: targetProjectId,
        section_id: targetSectionId ?? sub.section_id,
        section_name: `${sub.section_name} (Copy)`,
        description: sub.description,
        status: 'planning',
        estimated_cost: sub.estimated_cost,
        actual_cost: 0,
        sort_order: (sub.sort_order || 0) + 1,
        image_path: sub.image_path,
        drawing_path: sub.drawing_path,
        datasheet_path: sub.datasheet_path,
      }])
      .select()
      .single()
    if (insErr) throw insErr

    const rawParts = existingParts || []
    if (rawParts.length > 0) {
      const partsToCopy = rawParts.map((p: any) => ({
        project_section_id: newSub.id,
        part_type: p.part_type,
        part_id: p.part_id,
        quantity: p.quantity,
        unit_price: p.unit_price,
        currency: p.currency,
        reference_designator: p.reference_designator,
        notes: p.notes,
      }))
      const { error: partsErr } = await (supabase as any).from('project_parts').insert(partsToCopy)
      if (partsErr) throw partsErr
    }

    return newSub
  },

  // Backward compat alias (used by ProjectSectionCopyModal)
  copySection: async (sectionId: number, targetProjectId: number) => {
    return projectsApi.copySubsection(sectionId, targetProjectId)
  },

  // ─── PARTS ─────────────────────────────────────────────────────────────────

  addPartToSection: async (payload: {
    project_section_id: number   // this is the subsection id
    part_type: string
    part_id: number
    quantity: number
    unit_price?: number
    currency?: string
    reference_designator?: string | null
    notes?: string | null
    [key: string]: any
  }) => {
    const { project_section_id, part_type, part_id, quantity } = payload

    if (!part_type || !part_id) throw new Error('Part table or ID not identified')

    // Fetch part data
    const { data: part, error: partErr } = await (supabase as any)
      .from(part_type)
      .select('stock_quantity, base_price, part_number, suppliers:supplier_id(name)')
      .eq('id', part_id)
      .single()

    if (partErr || !part) throw new Error('Part not found')

    // Fetch subsection (Simplified query to avoid join issues)
    const { data: subsection, error: subErr } = await (supabase as any)
      .from('project_subsections')
      .select('*')
      .eq('id', project_section_id)
      .single()

    if (subErr || !subsection) {
      console.error('[addPartToSection] Subsection lookup failed:', { id: project_section_id, error: subErr })
      throw new Error(`Subsection not found (ID: ${project_section_id})`)
    }

    // Fetch project info separately for logging
    const { data: project } = await (supabase as any)
      .from('projects')
      .select('id, project_name')
      .eq('id', (subsection as any).project_id)
      .single()

    // Check existing part in same subsection
    const { data: existingPart } = await (supabase as any)
      .from('project_parts')
      .select('id, quantity')
      .eq('project_section_id', project_section_id)
      .eq('part_type', part_type)
      .eq('part_id', part_id)
      .maybeSingle()

    const stockBefore = part.stock_quantity || 0
    const newStock = Math.max(0, stockBefore - quantity)

    let result: any

    if (existingPart) {
      const { data: updated, error } = await (supabase as any)
        .from('project_parts')
        .update({
          quantity: (existingPart.quantity || 0) + quantity,
          updated_date: new Date().toISOString(),
        })
        .eq('id', existingPart.id)
        .select()
        .single()
      if (error) throw error
      result = updated
    } else {
      const insertPayload: any = {
        project_section_id,
        part_type,
        part_id,
        quantity,
        unit_price: payload.unit_price ?? part.base_price ?? 0,
        currency: payload.currency || 'USD',
        discount_percent: payload.discount_percent || 0,
        reference_designator: payload.reference_designator || null,
        notes: payload.notes || null,
      }

      const { data: inserted, error } = await (supabase as any)
        .from('project_parts')
        .insert([insertPayload])
        .select()
        .single()
      if (error) throw error
      result = inserted
    }

    // Update stock + log
    await Promise.all([
      (supabase as any).from(part_type).update({ stock_quantity: newStock }).eq('id', part_id),
      logStockMovement('OUT', part_type as PartCategory, part_id, part.part_number, quantity, stockBefore, newStock, {
        project_id: project?.id,
        project_name: project?.project_name,
        project_section_name: (subsection as any).section_name,
      }),
    ])

    return result
  },

  removePartFromSection: async (id: number) => {
    // 1. Fetch the part link and check for PO associations
    const { data: link, error: linkErr } = await (supabase as any)
      .from('project_parts')
      .select('*, po_items:purchase_order_items(id, purchase_orders(status))')
      .eq('id', id)
      .single()

    if (linkErr || !link) throw new Error('Part record not found')

    // 2. Security Check: Prevent deleting parts that are already "in flight" on released POs
    const poItems = (link as any).po_items || []
    const releasedItems = poItems.filter((i: any) => i.purchase_orders?.status && i.purchase_orders.status !== 'Draft' && i.purchase_orders.status !== 'Cancelled')
    
    if (releasedItems.length > 0) {
      const status = releasedItems[0].purchase_orders.status
      throw new Error(`Cannot remove part: It is linked to a PO that is already "${status}". You must cancel the PO or receive the items first.`)
    }

    // 3. Cleanup: If the part is on a Draft/Cancelled PO, remove it from the PO first to clear FK constraint
    if (poItems.length > 0) {
      const { error: delPoErr } = await (supabase as any)
        .from('purchase_order_items')
        .delete()
        .in('id', poItems.map((i: any) => i.id))
      
      if (delPoErr) throw new Error('Failed to clear PO associations: ' + delPoErr.message)
    }

    const partTable = link.part_type as PartCategory
    const partId = link.part_id

    // Check if master part still exists
    const { data: part } = await (supabase as any)
      .from(partTable)
      .select('stock_quantity, part_number')
      .eq('id', partId)
      .single()

    if (part) {
      // Restore stock and log movement if master part exists
      const stockBefore = part.stock_quantity || 0
      const newStock = stockBefore + (link.quantity || 0)

      await Promise.all([
        (supabase as any).from(partTable).update({ stock_quantity: newStock }).eq('id', partId),
        logStockMovement('RESTORE', partTable, partId, part.part_number, link.quantity, stockBefore, newStock),
      ])
    } else {
      console.warn(`Master part (table: ${partTable}, id: ${partId}) not found. Skipping stock restoration for project part link ${id}.`)
    }

    // 4. Delete project part link (always allowed)
    await (supabase as any).from('project_parts').delete().eq('id', id)
  },

  updatePartInSection: async (id: number, payload: any) => {
    const { data: oldLink } = await (supabase as any)
      .from('project_parts')
      .select('*')
      .eq('id', id)
      .single()

    if (!oldLink) throw new Error('Part record not found')

    const { data, error } = await (supabase as any)
      .from('project_parts')
      .update({
        project_section_id: payload.project_section_id ?? oldLink.project_section_id,
        quantity: payload.quantity ?? oldLink.quantity,
        unit_price: payload.unit_price ?? oldLink.unit_price,
        discount_percent: payload.discount_percent ?? oldLink.discount_percent,
        reference_designator: payload.reference_designator !== undefined ? payload.reference_designator : oldLink.reference_designator,
        notes: payload.notes !== undefined ? payload.notes : oldLink.notes,
        updated_date: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    if (payload.update_master) {
      await partsApi.updatePart(oldLink.part_type as any, oldLink.part_id, {
        base_price: payload.unit_price,
      })
    }

    return data
  },

  reorderProjectParts: async (subsectionId: number, partIds: number[]) => {
    const updates = partIds.map((id, index) => 
      (supabase as any).from('project_parts').update({ sort_order: index, project_section_id: subsectionId }).eq('id', id)
    );
    await Promise.all(updates);
  },
}

export default projectsApi
