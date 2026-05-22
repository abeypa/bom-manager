const DUPLICATE_EXEMPT_RE =
  /\b(packing|forwarding|freight|insurance|transport|loading|unloading|cd applicable|cash discount|commercial adjustment|discount|round ?off)\b/i

export const MASTER_PART_INTERLOCK_FIELDS =
  'id, part_number, description, manufacturer_part_number, beperp_part_no'

export function isProjectPartDuplicateExemptText(text: string | null | undefined): boolean {
  return DUPLICATE_EXEMPT_RE.test(String(text || ''))
}

export function isProjectPartDuplicateExemptMaster(master: any): boolean {
  const haystack = [
    master?.part_number,
    master?.description,
    master?.manufacturer_part_number,
    master?.beperp_part_no,
  ]
    .filter(Boolean)
    .join(' ')

  return isProjectPartDuplicateExemptText(haystack)
}

export async function findExistingProjectPartInProject(
  supabaseClient: any,
  projectId: number,
  partType: string,
  partId: number,
  excludeProjectPartId?: number,
) {
  const { data: peerSubs, error: subErr } = await supabaseClient
    .from('project_subsections')
    .select('id, section_name')
    .eq('project_id', projectId)

  if (subErr) throw subErr

  const peerIds = (peerSubs || []).map((s: any) => s.id)
  if (!peerIds.length) return null

  let query = supabaseClient
    .from('project_parts')
    .select('id, project_section_id, quantity, unit_price, currency, discount_percent, notes, updated_date')
    .eq('part_type', partType)
    .eq('part_id', partId)
    .in('project_section_id', peerIds)

  if (excludeProjectPartId != null) {
    query = query.neq('id', excludeProjectPartId)
  }

  const { data: existing, error } = await query.limit(1)
  if (error) throw error
  if (!existing?.length) return null

  const row = existing[0]
  const subsection = (peerSubs || []).find((s: any) => s.id === row.project_section_id)

  return {
    ...row,
    subsection_name: subsection?.section_name || `subsection #${row.project_section_id}`,
  }
}
