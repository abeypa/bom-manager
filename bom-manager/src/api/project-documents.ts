import { supabase } from '@/lib/supabase';

export type DocType = 'RFQ' | 'Customer Requirement' | 'Offer' | 'LOI' | 'PO' | 'Misc';
export type DocStatus = 'Draft' | 'Under Review' | 'Approved' | 'Superseded';

export interface ProjectDocument {
  id: number;
  project_id: number;
  doc_type: DocType;
  title: string;
  version: string;
  revision_date: string | null;
  status: DocStatus;
  file_path: string | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectDocumentInsert {
  project_id: number;
  doc_type: DocType;
  title: string;
  version?: string;
  revision_date?: string | null;
  status?: DocStatus;
  file_path?: string | null;
  notes?: string | null;
}

export const projectDocsApi = {
  getByProject: async (projectId: number): Promise<ProjectDocument[]> => {
    const { data, error } = await supabase
      .from('project_documents')
      .select('*')
      .eq('project_id', projectId)
      .order('doc_type')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  create: async (doc: ProjectDocumentInsert): Promise<ProjectDocument> => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await (supabase as any)
      .from('project_documents')
      .insert([{ ...doc, uploaded_by: user?.email || 'system' }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  update: async (id: number, updates: Partial<ProjectDocumentInsert>): Promise<ProjectDocument> => {
    const { data, error } = await (supabase as any)
      .from('project_documents')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  delete: async (id: number): Promise<void> => {
    const { error } = await supabase.from('project_documents').delete().eq('id', id);
    if (error) throw error;
  },

  // Upload file to bom_assets and return public URL
  uploadFile: async (file: File, projectId: number, docType: string): Promise<string> => {
    const ext = file.name.split('.').pop() || 'pdf';
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `project_docs/${projectId}/${docType.replace(/\s+/g, '_')}/${timestamp}_${safeName}`;

    const { error } = await supabase.storage
      .from('bom_assets')
      .upload(path, file, { upsert: true });
    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('bom_assets')
      .getPublicUrl(path);
    return publicUrl;
  },
};
