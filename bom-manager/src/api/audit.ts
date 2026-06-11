import { supabase } from '@/lib/supabase'

export interface AuditLogEntry {
  id: string
  performed_by: string | null
  action: string
  entity_type: string
  entity_id: string
  old_values: Record<string, any> | null
  new_values: Record<string, any> | null
  created_at: string
  ip: string | null
  actor_name: string
  actor_email: string | null
}

export interface AuditFieldChange {
  field: string
  from: any
  to: any
}

export const auditApi = {
  async getActivityLogs(options: {
    entityTypes?: string[]
    entityId?: string
    limit?: number
  }) {
    let query = (supabase as any)
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })

    if (options.entityTypes?.length) {
      query = query.in('entity_type', options.entityTypes)
    }
    if (options.entityId) {
      query = query.eq('entity_id', options.entityId)
    }
    if (options.limit) {
      query = query.limit(options.limit)
    }

    const { data, error } = await query
    if (error) throw error

    const rows = (data || []) as any[]
    const userIds = Array.from(new Set(rows.map((row) => row.performed_by).filter(Boolean)))

    const profileMap = new Map<string, { full_name: string | null; email: string | null }>()
    if (userIds.length > 0) {
      const { data: profiles } = await (supabase as any)
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)
      for (const profile of profiles || []) {
        profileMap.set(profile.id, {
          full_name: profile.full_name || null,
          email: profile.email || null,
        })
      }
    }

    return rows.map((row) => {
      const actor = profileMap.get(row.performed_by || '')
      return {
        ...row,
        actor_name: actor?.full_name || actor?.email || 'System',
        actor_email: actor?.email || null,
      } as AuditLogEntry
    })
  },
}

export function computeAuditFieldChanges(log: {
  action: string
  old_values: Record<string, any> | null
  new_values: Record<string, any> | null
}) {
  const action = String(log.action || '').toUpperCase()
  const oldValues = log.old_values || {}
  const newValues = log.new_values || {}

  if (action === 'DELETE') {
    return Object.entries(oldValues)
      .filter(([key]) => !shouldSkipAuditField(key))
      .map(([field, value]) => ({ field, from: value, to: null } satisfies AuditFieldChange))
  }

  if (action === 'CREATE' || action === 'INSERT') {
    return Object.entries(newValues)
      .filter(([key]) => !shouldSkipAuditField(key))
      .map(([field, value]) => ({ field, from: null, to: value } satisfies AuditFieldChange))
  }

  const allKeys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)])
  const changes: AuditFieldChange[] = []
  for (const key of allKeys) {
    if (shouldSkipAuditField(key)) continue
    const before = oldValues[key]
    const after = newValues[key]
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push({ field: key, from: before, to: after })
    }
  }
  return changes
}

function shouldSkipAuditField(key: string) {
  return key.startsWith('_') || key === 'id' || key === 'created_at' || key === 'updated_at'
}
