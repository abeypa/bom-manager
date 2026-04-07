import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import { partsApi } from './parts'

export type Project = Database['public']['Tables']['projects']['Row']
export type ProjectInsert = Database['public']['Tables']['projects']['Insert']
export type ProjectUpdate = Database['public']['Tables']['projects']['Update']

// Section = top-level grouping within a project (e.g. "Mechanical Assembly")
export type ProjectSection = {
  id: number
  project_id: number
  name: string
  order_index: number
  created_at?: string
}

// Subsection = lives inside a Section, holds parts (e.g. "Main Frame")
export type ProjectSubsection = {
  id: number
  project_id: number
  section_id: number | null
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

export type ProjectSubsectionInsert = Omit<ProjectSubsection, 'id' | 'created_date' | 'updated_date'>

type PartCategory =
  | 'mechanical_manufacture'
  | 'mechanical_bought_out'
  | 'electrical_manufacture'
  | 'electrical_bought_out'
  | 'pneumatic_bought_out'

// Helper: Log stock movement
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
  await (supabase as any).from('stock_movements').insert({
    movement_type: movementType,
    part_table_name: partTable,
    part_id: partId,
    part_number: partNumber,
    quantity: movementType === 'OUT' ? -quantity : quantity,
    stock_before: stockBefore,
    stock_after: stockAfter,
    ...extra,
    moved_by: (await supabase.auth.getUser()).data.user?.email || 'system',
  })
}

export const projectsApi = {
  // ─── PROJECTS ────────────────────────────────────────────

  getProjects: async () => {
    const { data, error } = await (supabase as any)
      .from('projects')
      .select('*')
      .order('created_date', { ascending: false })
    if (error) throw error
    return data
  },

  /**
   * Fetch a project with full hierarchy:
   * Project → Sections → Subsections → Parts
   */
  getProject: async (projectId: number) => {
    const { data, error } = await (supabase as any)
      .from('projects')
      .select(`
        *,
        sections:project_sections (
          *
        ),
        subsections:project_subsections (
          *,
          parts:project_parts (
            *,
            mechanical_manufacture (*),
            mechanical_bought_out (*),
            electrical_manufacture (*),
            electrical_bought_out (*),
            pneumatic_bought_out (*)
          )
        )
      `)
      .eq('id', projectId)
      .single()

    if (error) throw error

    // Attach subsections under their parent sections for easy rendering
    if (data) {
      const sections = data.sections || []
      const subsections = data.subsections || []

      data.sections = sections.map((sec: any) => ({
        ...sec,
        subsections: subsections
          .filter((sub: any) => sub.section_id === sec.id)
          .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      }))

      // Also keep flat list of subsections for backward compat
      data.orphaned_subsections = subsections.filter(
        (sub: any) => !sub.section_id
      )
    }

    return data
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

  // ─── SECTIONS (top-level) ─────────────────────────────────

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
      .insert([{ ...section, order_index: section.order_index ?? 0 }])
      .select()
      .single()
    if (error) throw error
    return data
  },

  updateSection: async (id: number, section: { name?: string; order_index?: number }) => {
    const { data, error } = await (supabase as any)
      .from('project_sections')
      .update(section)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  deleteSection: async (id: number) => {
    const { error } = await (supabase as any).from('project_sections').delete().eq('id', id)
    if (error) throw error
  },

  // ─── SUBSECTIONS (live inside Sections, hold parts) ────────

  getSubsections: async (projectId: number, sectionId?: number) => {
    let query = (supabase as any)
      .from('project_subsections')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })

    if (sectionId !== undefined) {
      query = query.eq('section_id', sectionId)
    }

    const { data, error } = await query
    if (error) throw error
    return data
  },

  createSubsection: async (subsection: ProjectSubsectionInsert) => {
    const { data, error } = await (supabase as any)
      .from('project_subsections')
      .insert([subsection])
      .select()
      .single()
    if (error) throw error
    return data
  },

  updateSubsection: async (id: number, subsection: Partial<ProjectSubsection>) => {
    const { data, error } = await (supabase as any)
      .from('project_subsections')
      .update(subsection)
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

  // ─── COPY SUBSECTION ──────────────────────────────────────

  copySubsection: async (subsectionId: number, targetProjectId: number, targetSectionId?: number) => {
    const { data: sub, error: subError } = await (supabase as any)
      .from('project_subsections')
      .select(`
        *,
        parts:project_parts(*)
      `)
      .eq('id', subsectionId)
      .single()

    if (subError) throw subError
    if (!sub) throw new Error('Subsection not found')

    const newSubPayload = {
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
    }

    const { data: newSub, error: insError } = await (supabase as any)
      .from('project_subsections')
      .insert([newSubPayload])
      .select()
      .single()

    if (insError) throw insError

    const rawParts = (sub as any).parts || []
    if (rawParts.length > 0) {
      const partsToCopy = rawParts.map((p: any) => ({
        project_section_id: (newSub as any).id,
        mechanical_manufacture_id: p.mechanical_manufacture_id,
        mechanical_bought_out_part_id: p.mechanical_bought_out_part_id,
        electrical_manufacture_id: p.electrical_manufacture_id,
        electrical_bought_out_part_id: p.electrical_bought_out_part_id,
        pneumatic_bought_out_part_id: p.pneumatic_bought_out_part_id,
        quantity: p.quantity,
        unit_price: p.unit_price,
        currency: p.currency,
        discount_percent: p.discount_percent,
        base_price_at_assignment: p.base_price_at_assignment,
        supplier_name_at_assignment: p.supplier_name_at_assignment,
        reference_designator: p.reference_designator,
        notes: p.notes,
      }))

      const { error: partsError } = await (supabase as any).from('project_parts').insert(partsToCopy)
      if (partsError) throw partsError
    }

    return newSub
  },

  // Keep backward compat alias
  copySection: async (sectionId: number, targetProjectId: number) => {
    return projectsApi.copySubsection(sectionId, targetProjectId)
  },

  // ─── PARTS ────────────────────────────────────────────────

  addPartToSection: async (payload: {
    project_section_id: number // this is actually subsection_id
    part_type?: PartCategory
    part_id?: number
    quantity: number
    unit_price?: number
    currency?: string
    discount_percent?: number
    reference_designator?: string | null
    notes?: string | null
    [key: string]: any
  }) => {
    const { project_section_id, quantity, reference_designator, notes } = payload

    const partKeys = [
      'mechanical_manufacture_id',
      'mechanical_bought_out_part_id',
      'electrical_manufacture_id',
      'electrical_bought_out_part_id',
      'pneumatic_bought_out_part_id',
    ]

    let partTableValue: PartCategory | undefined = payload.part_type
    let partIdValue: number | undefined = payload.part_id

    if (!partTableValue || !partIdValue) {
      for (const key of partKeys) {
        if (payload[key]) {
          partIdValue = payload[key]
          if (key === 'mechanical_manufacture_id') partTableValue = 'mechanical_manufacture'
          else if (key === 'mechanical_bought_out_part_id') partTableValue = 'mechanical_bought_out'
          else if (key === 'electrical_manufacture_id') partTableValue = 'electrical_manufacture'
          else if (key === 'electrical_bought_out_part_id') partTableValue = 'electrical_bought_out'
          else if (key === 'pneumatic_bought_out_part_id') partTableValue = 'pneumatic_bought_out'
          break
        }
      }
    }

    if (!partTableValue || !partIdValue) throw new Error('Part table or ID not identified')

    const [{ data: part }, { data: subsection }] = await Promise.all([
      (supabase as any)
        .from(partTableValue)
        .select('stock_quantity, base_price, part_number, supplier_id, suppliers:supplier_id(name), discount_percent')
        .eq('id', partIdValue)
        .single(),
      (supabase as any)
        .from('project_subsections')
        .select('*, project:projects(id, project_name)')
        .eq('id', project_section_id)
        .single(),
    ])

    if (!part) throw new Error('Part not found')
    if (!subsection) throw new Error('Subsection not found')

    const project = (subsection as any).project
    const vendorName = (part as any).suppliers?.name || null
    const partTypeKey = `${partTableValue}${partTableValue.includes('bought_out') && !partTableValue.includes('_part') ? '_part' : ''}_id`

    const { data: existingPart } = await (supabase as any)
      .from('project_parts')
      .select('*')
      .eq('project_section_id', project_section_id)
      .eq(partTypeKey, partIdValue)
      .maybeSingle()

    const stockBefore = part.stock_quantity
    const newStock = stockBefore - quantity

    let result
    if (existingPart) {
      const { data: updated, error: upError } = await (supabase as any)
        .from('project_parts')
        .update({
          quantity: (existingPart as any).quantity + quantity,
          use_date_time: new Date().toISOString(),
          updated_date: new Date().toISOString(),
        })
        .eq('id', existingPart.id)
        .select()
        .single()
      if (upError) throw upError
      result = updated
    } else {
      const insertPayload: any = {
        project_section_id,
        [partTypeKey]: partIdValue,
        quantity,
        unit_price: payload.unit_price || part.base_price || 0,
        currency: payload.currency || 'INR',
        discount_percent: payload.discount_percent ?? part.discount_percent ?? 0,
        base_price_at_assignment: part.base_price,
        supplier_name_at_assignment: vendorName,
        reference_designator,
        notes,
        use_date_time: new Date().toISOString(),
      }

      const { data: inserted, error: inError } = await (supabase as any)
        .from('project_parts')
        .insert([insertPayload])
        .select()
        .single()

      if (inError) throw inError
      result = inserted
    }

    await Promise.all([
      (supabase as any).from(partTableValue).update({ stock_quantity: newStock }).eq('id', partIdValue),
      logStockMovement('OUT', partTableValue, partIdValue, part.part_number, quantity, stockBefore, newStock, {
        project_id: project.id,
        project_name: project.project_name,
        project_section_name: (subsection as any).section_name,
      }),
    ])

    return result
  },

  removePartFromSection: async (id: number) => {
    const { data: link, error: linkErr } = await (supabase as any)
      .from('project_parts')
      .select(`
        *,
        subsection:project_subsections(
          id,
          section_name,
          project:projects(id, project_name)
        )
      `)
      .eq('id', id)
      .single()

    if (linkErr || !link) throw new Error('Part record not found')

    const partTypes = [
      { key: 'mechanical_manufacture_id', table: 'mechanical_manufacture' },
      { key: 'mechanical_bought_out_part_id', table: 'mechanical_bought_out' },
      { key: 'electrical_manufacture_id', table: 'electrical_manufacture' },
      { key: 'electrical_bought_out_part_id', table: 'electrical_bought_out' },
      { key: 'pneumatic_bought_out_part_id', table: 'pneumatic_bought_out' },
    ]

    let partTable: PartCategory | undefined
    let partId: number | undefined
    for (const pt of partTypes) {
      if ((link as any)[pt.key]) {
        partTable = pt.table as PartCategory
        partId = (link as any)[pt.key]
        break
      }
    }

    if (!partTable || !partId) throw new Error('Underlying part not identified')

    const { data: part } = await (supabase as any)
      .from(partTable)
      .select('stock_quantity, part_number')
      .eq('id', partId)
      .single()

    if (!part) throw new Error('Master part not found')

    const stockBefore = part.stock_quantity
    const newStock = stockBefore + link.quantity

    await Promise.all([
      (supabase as any).from(partTable).update({ stock_quantity: newStock }).eq('id', partId),
      logStockMovement('RESTORE', partTable, partId, part.part_number, link.quantity, stockBefore, newStock, {
        project_id: (link as any).subsection?.project?.id,
        project_name: (link as any).subsection?.project?.project_name,
      }),
      (supabase as any).from('project_parts').delete().eq('id', id),
    ])
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
        quantity: payload.quantity,
        unit_price: payload.unit_price,
        currency: payload.currency,
        reference_designator: payload.reference_designator,
        notes: payload.notes,
        updated_date: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    if (payload.update_master) {
      const partTypeKey = Object.keys(oldLink).find(k => k.endsWith('_id') && oldLink[k])
      if (partTypeKey) {
        const table = partTypeKey.replace('_id', '').replace('_part', '')
        await partsApi.updatePart(table as any, oldLink[partTypeKey], {
          base_price: payload.unit_price,
          currency: payload.currency,
        })
      }
    }

    return data
  },
}

export default projectsApi
