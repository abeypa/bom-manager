import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pendingPartsApi } from '@/api/pending-parts';
import { Send, UserCircle2, X, Loader2 } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { supabase } from '@/lib/supabase';

// Basic relative time formatter
function formatTimeAgo(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function DiscussionThread({ pendingPartId }: { pendingPartId: number }) {
  const [comment, setComment] = useState('');
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: comments, isLoading } = useQuery({
    queryKey: ['pending-part-comments', pendingPartId],
    queryFn: () => pendingPartsApi.getComments(pendingPartId),
  });

  const postComment = useMutation({
    mutationFn: () => pendingPartsApi.addComment(pendingPartId, comment, attachedImages),
    onSuccess: () => {
      setComment('');
      setAttachedImages([]);
      queryClient.invalidateQueries({ queryKey: ['pending-part-comments', pendingPartId] });
      // Scroll to bottom (handled naturally by reverse stack or simple view update)
    },
    onError: (err: any) => showToast('error', err.message),
  });

  const handlePaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            e.preventDefault();
            const file = items[i].getAsFile();
            if (!file) continue;
            
            setIsUploading(true);
            try {
              const fileExt = file.name.split('.').pop() || 'png';
              const fileName = `comment-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
              const { error } = await supabase.storage.from('part-images').upload(`comments/${fileName}`, file, {
                cacheControl: '3600',
                upsert: false
              });
              
              if (error) throw error;
              
              const { data: urlData } = supabase.storage.from('part-images').getPublicUrl(`comments/${fileName}`);
              setAttachedImages(prev => [...prev, urlData.publicUrl]);
            } catch (err: any) {
              showToast('error', 'Image upload failed: ' + err.message);
            } finally {
              setIsUploading(false);
            }
        }
    }
  };

  const removeImage = (index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (comment.trim() || attachedImages.length > 0) postComment.mutate();
  };

  if (isLoading) return <div className="p-6 text-center text-slate-400 text-[10px] font-black uppercase tracking-widest">Loading thread...</div>;

  return (
    <div className="flex flex-col bg-slate-50 relative">
      <div className="max-h-80 overflow-y-auto hidden-scrollbar p-6 space-y-4">
        {comments?.length === 0 ? (
          <div className="text-center text-slate-400 text-sm py-4 italic font-medium bg-white/50 border border-slate-100 rounded-xl shadow-sm">No comments yet. Start the discussion by saying hello or pasting an image!</div>
        ) : (
          comments?.map((c) => (
            <div key={c.id} className="flex gap-3 relative animate-in slide-in-from-bottom-2">
              {c.author_avatar ? (
                <img src={c.author_avatar} alt="Avatar" className="w-8 h-8 rounded-full border border-slate-200 object-cover shrink-0 bg-white" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center shrink-0 uppercase font-black text-sm ring-2 ring-white">
                  {(c.author_name || c.author_email || '?')[0]}
                </div>
              )}
              <div className="bg-white border border-slate-200 p-3 rounded-2xl rounded-tl-sm shadow-sm flex-1 overflow-hidden">
                <div className="flex justify-between items-end mb-1 border-b border-slate-50 pb-1.5">
                  <span className="text-[10px] font-black uppercase text-navy-900 tracking-wider flex items-center gap-1">
                    <UserCircle2 size={12} className="text-slate-400" /> {c.author_name || c.author_email?.split('@')[0] || 'Unknown User'}
                  </span>
                  <span className="text-[9px] text-slate-400 font-bold" title={new Date(c.created_at).toLocaleString()}>
                    {formatTimeAgo(c.created_at)}
                  </span>
                </div>
                
                {c.message && <p className="text-sm text-slate-700 leading-relaxed font-medium mt-1 whitespace-pre-wrap">{c.message}</p>}
                
                {c.images && c.images.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3 pt-2 border-t border-slate-50">
                    {c.images.map((img: string, idx: number) => (
                      <a key={idx} href={img} target="_blank" rel="noreferrer" className="block max-w-full sm:max-w-xs rounded-xl overflow-hidden border border-slate-200 hover:border-primary-400 transition-colors shadow-sm bg-slate-50">
                        <img src={img} alt="Attached" className="w-full h-auto max-h-48 object-cover" loading="lazy" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {attachedImages.length > 0 && (
        <div className="px-4 py-3 bg-slate-100/80 border-t border-slate-200 flex gap-3 overflow-x-auto">
          {attachedImages.map((img, idx) => (
             <div key={idx} className="relative w-16 h-16 rounded-xl border border-slate-200 overflow-hidden group shrink-0 shadow-sm bg-white">
                <img src={img} alt="Preview" className="w-full h-full object-cover" />
                <button type="button" onClick={() => removeImage(idx)} className="absolute top-1 right-1 bg-red-500/90 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"><X size={10}/></button>
             </div>
          ))}
          {isUploading && (
             <div className="w-16 h-16 rounded-xl border border-slate-200 bg-white/50 flex items-center justify-center shrink-0">
               <Loader2 size={16} className="animate-spin text-slate-400" />
             </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="p-4 bg-white border-t border-slate-200 flex gap-3 sticky bottom-0">
        <div className="flex-1 relative">
          <input 
            ref={inputRef}
            type="text" 
            placeholder="Add note or paste image (Ctrl+V)..." 
            value={comment}
            onChange={e => setComment(e.target.value)}
            onPaste={handlePaste}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-sm font-medium focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all focus:outline-none"
          />
          {isUploading && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-primary-500" />}
        </div>
        <button 
          type="submit" 
          disabled={(!comment.trim() && attachedImages.length === 0) || postComment.isPending || isUploading}
          className="btn btn-primary px-5 shadow-sm shadow-primary-500/20"
        >
          {postComment.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
}
