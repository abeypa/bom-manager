import React, { useState } from 'react';
import { X, Upload, Link as LinkIcon, Trash2, Plus } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { pendingPartsApi, PendingPartInsert } from '@/api/pending-parts';
import { useToast } from '@/context/ToastContext';
import { supabase } from '@/lib/supabase';

export default function PendingPartFormModal({ isOpen, onClose, projectId }: { isOpen: boolean, onClose: () => void, projectId: number }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [formData, setFormData] = useState<PendingPartInsert>({
    project_id: projectId,
    name: '',
    description: '',
    category: 'mechanical_bought_out',
    status: 'Pending',
    images: [],
    links: [],
    created_by: null,
    rejection_reason: null,
  });

  const [linkInput, setLinkInput] = useState({ label: '', url: '' });

  const submitMut = useMutation({
    mutationFn: (data: PendingPartInsert) => pendingPartsApi.createPendingPart(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-parts', projectId] });
      showToast('success', 'Part request submitted successfully');
      onClose();
    },
    onError: (err: any) => showToast('error', err.message),
  });

  if (!isOpen) return null;

  const addLink = () => {
    if (linkInput.url) {
      setFormData(prev => ({ ...prev, links: [...prev.links, linkInput] }));
      setLinkInput({ label: '', url: '' });
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Quick base64 for reliable display if bucket is unconfigured, or direct supabase upload 
    // Usually part-images is configured for public assets. We attempt upload.
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `pending-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
      const { error } = await supabase.storage.from('bom_assets').upload(`pending/${fileName}`, file, {
        cacheControl: '3600',
        upsert: false
      });
      if (error) throw error;
      
      const { data: urlData } = supabase.storage.from('bom_assets').getPublicUrl(`pending/${fileName}`);
      setFormData(prev => ({ ...prev, images: [...prev.images, urlData.publicUrl] }));
    } catch (err: any) {
      showToast('error', 'Upload failed: ' + err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-navy-900/40 backdrop-blur-sm z-[9999] flex py-10 px-4 justify-center items-start overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl animate-in zoom-in-95 duration-300 mx-auto relative my-auto">
        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50/50 rounded-t-[2rem]">
          <div>
             <h2 className="text-xl font-black text-navy-900 tracking-tight">Request New Part</h2>
             <p className="text-xs font-bold text-slate-400 mt-1">Submit a part for admin approval</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-red-500 hover:bg-white rounded-xl transition-all border border-transparent shadow-sm hover:border-red-100">
            <X size={20} />
          </button>
        </div>

        <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto hidden-scrollbar">
          <div className="grid grid-cols-2 gap-6">
            <div className="col-span-2">
              <label className="block text-[10px] uppercase font-black text-slate-400 tracking-wider mb-2">Part Name / Component Ref</label>
              <input 
                type="text" required 
                value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 py-3 px-4 rounded-xl focus:ring-2 focus:ring-primary-500/20 text-sm font-bold shadow-sm"
                placeholder="e.g. M4x10 Socket Head Cap Screw or STM32F405 MCU"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-[10px] uppercase font-black text-slate-400 tracking-wider mb-2">Category Ecosystem</label>
              <div className="relative">
                 <select 
                   value={formData.category || ''} onChange={e => setFormData({...formData, category: e.target.value})}
                   className="w-full bg-slate-50 border border-slate-200 py-3 px-4 pr-10 rounded-xl text-sm font-bold appearance-none shadow-sm focus:ring-2 focus:ring-primary-500/20"
                 >
                   <option value="mechanical_manufacture">Mechanical Manufacture</option>
                   <option value="mechanical_bought_out">Mechanical Bought Out</option>
                   <option value="electrical_manufacture">Electrical Manufacture</option>
                   <option value="electrical_bought_out">Electrical Bought Out</option>
                   <option value="pneumatic_bought_out">Pneumatic Bought Out</option>
                 </select>
                 <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">▼</div>
              </div>
            </div>

            <div className="col-span-2">
              <label className="block text-[10px] uppercase font-black text-slate-400 tracking-wider mb-2">Detailed Context & Description</label>
              <textarea 
                rows={4} 
                value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 py-3 px-4 rounded-xl focus:ring-2 focus:ring-primary-500/20 text-sm font-medium shadow-sm leading-relaxed"
                placeholder="Why is it needed? Include specific materials, tolerances, or functional requirements to expedite approval..."
              />
            </div>

            {/* Links */}
            <div className="col-span-2 space-y-3 p-4 bg-slate-50/50 border border-slate-100 rounded-2xl">
              <label className="block text-[10px] uppercase font-black text-slate-400 tracking-wider">Datasheets & References</label>
              <div className="flex gap-2">
                <input 
                   placeholder="Label (e.g. DigiKey)" 
                   className="bg-white border border-slate-200 p-2 text-sm rounded-xl font-bold flex-1 shadow-sm"
                   value={linkInput.label} onChange={e => setLinkInput({...linkInput, label: e.target.value})}
                />
                <input 
                   placeholder="URL (https://...)" 
                   className="bg-white border border-slate-200 p-2 text-sm rounded-xl font-medium flex-[2] shadow-sm"
                   value={linkInput.url} onChange={e => setLinkInput({...linkInput, url: e.target.value})}
                   onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addLink())}
                />
                <button type="button" onClick={addLink} className="p-3 border border-slate-200 bg-white shadow-sm rounded-xl hover:bg-slate-50 hover:text-primary-600 text-slate-400 transition-colors"><Plus size={16}/></button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.links.map((link, i) => (
                  <span key={i} className="flex items-center gap-2 bg-white border border-primary-100 text-primary-700 shadow-sm text-xs px-3 py-1.5 rounded-lg font-bold">
                    <LinkIcon size={12} className="opacity-50" /> {link.label || 'Link'}
                    <button type="button" onClick={() => setFormData(p => ({...p, links: p.links.filter((_, idx) => idx !== i)}))} className="text-red-400 hover:text-red-600 ml-1 bg-red-50 p-0.5 rounded"><X size={12}/></button>
                  </span>
                ))}
              </div>
            </div>

            {/* Images */}
            <div className="col-span-2 p-4 bg-slate-50/50 border border-slate-100 rounded-2xl">
              <label className="block text-[10px] uppercase font-black text-slate-400 tracking-wider mb-3">Reference Images</label>
              <div className="flex flex-wrap items-center gap-4">
                <label className="cursor-pointer flex flex-col items-center justify-center w-24 h-24 border-2 border-dashed border-slate-300 bg-white rounded-2xl hover:bg-primary-50 hover:border-primary-400 transition-colors group">
                  <Upload size={20} className="text-slate-400 mb-1 group-hover:text-primary-500 transition-colors" />
                  <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider group-hover:text-primary-600">Upload</span>
                  <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                </label>
                {formData.images.map((img, i) => (
                   <div key={i} className="relative w-24 h-24 rounded-2xl border border-slate-200 shadow-sm overflow-hidden group">
                     <img src={img} alt="preview" className="w-full h-full object-cover" />
                     <div className="absolute inset-0 bg-navy-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                       <button type="button" onClick={() => setFormData(p => ({...p, images: p.images.filter((_, idx)=>idx !== i)}))} className="bg-red-500 text-white p-2 rounded-full shadow-lg hover:bg-red-600 transition-colors transform scale-75 group-hover:scale-100 duration-200"><Trash2 size={14}/></button>
                     </div>
                   </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-[2rem]">
          <button type="button" onClick={onClose} className="btn btn-secondary px-6 font-bold">Cancel</button>
          <button 
            onClick={() => submitMut.mutate(formData)}
            disabled={!formData.name || submitMut.isPending}
            className="btn btn-primary px-8 shadow-lg shadow-primary-600/20"
          >
            {submitMut.isPending ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </div>
    </div>
  );
}
