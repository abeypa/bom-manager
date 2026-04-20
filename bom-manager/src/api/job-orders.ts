import { supabase } from '@/lib/supabase';

export type JOStatus = 'Draft' | 'Issued' | 'In-Build' | 'Completed' | 'On Hold' | 'Cancelled';
export type JOSection = 'Mechanical' | 'Electrical' | 'Software' | 'Vehicle' | 'General' | string;
export type ScopeSupplier = 'BEP' | 'BEPI' | 'Customer' | 'Other';
export type ScopeStatus = 'Confirmed' | 'TBD' | 'Hold' | 'Cancelled';

export interface JobOrder {
  id: number;
  project_id: number;
  jo_number: string;
  title: string | null;
  revision: string;
  issue_date: string | null;
  status: JOStatus;
  model_number: string | null;
  serial_number: string | null;
  reference_projects: string | null;
  contact_name: string | null;
  contact_title: string | null;
  inco_terms: string | null;
  warranty: string | null;
  delivery_months: number | null;
  shipping_to: string | null;
  paint_machine: string | null;
  paint_moving: string | null;
  paint_panel: string | null;
  manuals_usb_qty: number;
  manuals_hardcopy_qty: number;
  special_requirements: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface JOParameter {
  id: number;
  jo_id: number;
  section: string;
  parameter_name: string;
  value: string | null;
  unit: string | null;
  vendor: string | null;
  notes: string | null;
  sort_order: number;
  is_tbd: boolean;
  is_hold: boolean;
  created_at: string;
}

export interface JOBrandItem {
  id: number;
  jo_id: number;
  component: string;
  make: string | null;
  notes: string | null;
  sort_order: number;
}

export interface JOScopeItem {
  id: number;
  jo_id: number;
  supplier: ScopeSupplier;
  qty: string;
  description: string;
  status: ScopeStatus;
  notes: string | null;
  sort_order: number;
}

export interface JobOrderFull extends JobOrder {
  parameters: JOParameter[];
  brand_list: JOBrandItem[];
  scope_items: JOScopeItem[];
}

export const jobOrdersApi = {
  // ── READ ──────────────────────────────────────────────────────────────────

  getByProject: async (projectId: number): Promise<JobOrder[]> => {
    const { data, error } = await supabase
      .from('job_orders')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  getById: async (joId: number): Promise<JobOrderFull> => {
    const [joRes, paramsRes, brandsRes, scopeRes] = await Promise.all([
      (supabase as any).from('job_orders').select('*').eq('id', joId).single(),
      supabase.from('jo_parameters').select('*').eq('jo_id', joId).order('section').order('sort_order'),
      supabase.from('jo_brand_list').select('*').eq('jo_id', joId).order('sort_order'),
      supabase.from('jo_scope_items').select('*').eq('jo_id', joId).order('supplier').order('sort_order'),
    ]);
    if (joRes.error) throw joRes.error;
    return {
      ...joRes.data,
      parameters: paramsRes.data || [],
      brand_list: brandsRes.data || [],
      scope_items: scopeRes.data || [],
    };
  },

  // ── CREATE ────────────────────────────────────────────────────────────────

  create: async (jo: Partial<JobOrderFull>): Promise<JobOrder> => {
    const { data: { user } } = await supabase.auth.getUser();
    
    // Strip relations to avoid column not found errors
    const { parameters, brand_list, scope_items, ...joPayload } = jo as any;

    const { data, error } = await (supabase as any)
      .from('job_orders')
      .insert([{ ...joPayload, created_by: user?.email || 'system' }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ── UPDATE ────────────────────────────────────────────────────────────────

  update: async (id: number, updates: Partial<JobOrderFull>): Promise<JobOrder> => {
    // Strip relations to avoid column not found errors
    const { parameters, brand_list, scope_items, ...joPayload } = updates as any;

    const { data, error } = await (supabase as any)
      .from('job_orders')
      .update({ ...joPayload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  delete: async (id: number): Promise<void> => {
    const { error } = await supabase.from('job_orders').delete().eq('id', id);
    if (error) throw error;
  },

  // ── BUMP REVISION ─────────────────────────────────────────────────────────
  // Creates a new JO row copying all data, bumps revision string

  bumpRevision: async (joId: number): Promise<JobOrder> => {
    const full = await jobOrdersApi.getById(joId);

    const revMap: Record<string, string> = {
      'Orig': 'Rev.1', 'Rev.1': 'Rev.2', 'Rev.2': 'Rev.3',
      'Rev.3': 'Rev.4', 'Rev.4': 'Rev.5', 'Rev.5': 'Rev.6',
    };
    const nextRev = revMap[full.revision] || `Rev.${parseInt(full.revision.replace('Rev.', '') || '0') + 1}`;

    const { id: _id, created_at: _ca, updated_at: _ua, ...joData } = full as any;

    // Create new JO with bumped revision
    const newJO = await jobOrdersApi.create({
      ...joData,
      revision: nextRev,
      status: 'Draft',
      issue_date: null,
    });

    // Copy all parameters
    if (full.parameters.length) {
      const params = full.parameters.map(({ id: _pid, jo_id: _jid, created_at: _pca, ...p }) => ({
        ...p, jo_id: newJO.id,
      }));
      await (supabase as any).from('jo_parameters').insert(params);
    }

    // Copy brand list
    if (full.brand_list.length) {
      const brands = full.brand_list.map(({ id: _bid, jo_id: _jid, ...b }) => ({
        ...b, jo_id: newJO.id,
      }));
      await (supabase as any).from('jo_brand_list').insert(brands);
    }

    // Copy scope items
    if (full.scope_items.length) {
      const scope = full.scope_items.map(({ id: _sid, jo_id: _jid, ...s }) => ({
        ...s, jo_id: newJO.id,
      }));
      await (supabase as any).from('jo_scope_items').insert(scope);
    }

    return newJO;
  },

  // ── PARAMETERS ────────────────────────────────────────────────────────────

  addParameter: async (param: Omit<JOParameter, 'id' | 'created_at'>): Promise<JOParameter> => {
    const { data, error } = await (supabase as any)
      .from('jo_parameters').insert([param]).select().single();
    if (error) throw error;
    return data;
  },

  updateParameter: async (id: number, updates: Partial<JOParameter>): Promise<JOParameter> => {
    const { data, error } = await (supabase as any)
      .from('jo_parameters').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  deleteParameter: async (id: number): Promise<void> => {
    const { error } = await supabase.from('jo_parameters').delete().eq('id', id);
    if (error) throw error;
  },

  // Bulk upsert all parameters for a JO (used on save)
  saveParameters: async (joId: number, params: Omit<JOParameter, 'id' | 'created_at' | 'jo_id'>[]): Promise<void> => {
    // Delete all existing, re-insert
    await supabase.from('jo_parameters').delete().eq('jo_id', joId);
    if (params.length) {
      const rows = params.map((p, i) => ({ ...p, jo_id: joId, sort_order: i }));
      const { error } = await (supabase as any).from('jo_parameters').insert(rows);
      if (error) throw error;
    }
  },

  // ── BRAND LIST ────────────────────────────────────────────────────────────

  saveBrandList: async (joId: number, items: Omit<JOBrandItem, 'id' | 'jo_id'>[]): Promise<void> => {
    await supabase.from('jo_brand_list').delete().eq('jo_id', joId);
    if (items.length) {
      const rows = items.map((b, i) => ({ ...b, jo_id: joId, sort_order: i }));
      const { error } = await (supabase as any).from('jo_brand_list').insert(rows);
      if (error) throw error;
    }
  },

  // ── SCOPE OF SUPPLY ───────────────────────────────────────────────────────

  saveScopeItems: async (joId: number, items: Omit<JOScopeItem, 'id' | 'jo_id'>[]): Promise<void> => {
    await supabase.from('jo_scope_items').delete().eq('jo_id', joId);
    if (items.length) {
      const rows = items.map((s, i) => ({ ...s, jo_id: joId, sort_order: i }));
      const { error } = await (supabase as any).from('jo_scope_items').insert(rows);
      if (error) throw error;
    }
  },
};
