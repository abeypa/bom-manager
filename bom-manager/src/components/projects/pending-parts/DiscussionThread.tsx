import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pendingPartsApi } from '@/api/pending-parts';
import { Send, User } from 'lucide-react';
import { useToast } from '@/context/ToastContext';

// Basic relative time formatter to avoid external libraries if date-fns not installed
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
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: comments, isLoading } = useQuery({
    queryKey: ['pending-part-comments', pendingPartId],
    queryFn: () => pendingPartsApi.getComments(pendingPartId),
  });

  const postComment = useMutation({
    mutationFn: () => pendingPartsApi.addComment(pendingPartId, comment),
    onSuccess: () => {
      setComment('');
      queryClient.invalidateQueries({ queryKey: ['pending-part-comments', pendingPartId] });
    },
    onError: (err: any) => showToast('error', err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (comment.trim()) postComment.mutate();
  };

  if (isLoading) return <div className="p-6 text-center text-slate-400 text-[10px] font-black uppercase tracking-widest">Loading thread...</div>;

  return (
    <div className="flex flex-col bg-slate-50 relative">
      <div className="max-h-60 overflow-y-auto hidden-scrollbar p-6 space-y-4">
        {comments?.length === 0 ? (
          <div className="text-center text-slate-400 text-sm py-4 italic font-medium bg-white/50 border border-slate-100 rounded-xl">No comments yet. Start the discussion!</div>
        ) : (
          comments?.map((c) => (
            <div key={c.id} className="flex gap-3 relative animate-in slide-in-from-bottom-2">
              <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center shrink-0 uppercase font-black text-sm ring-2 ring-white">
                {(c.author_email || '?')[0]}
              </div>
              <div className="bg-white border border-slate-200 p-3 rounded-2xl rounded-tl-sm shadow-sm flex-1">
                <div className="flex justify-between items-end mb-1 border-b border-slate-50 pb-1.5">
                  <span className="text-[10px] font-black uppercase text-navy-900 tracking-wider flex items-center gap-1">
                    <User size={10} className="text-slate-400" /> {c.author_email?.split('@')[0]}
                  </span>
                  <span className="text-[9px] text-slate-400 font-bold">{formatTimeAgo(c.created_at)}</span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed font-medium mt-1">{c.message}</p>
              </div>
            </div>
          ))
        )}
      </div>
      <form onSubmit={handleSubmit} className="p-4 bg-white border-t border-slate-200 flex gap-3 sticky bottom-0">
        <input 
          type="text" 
          placeholder="Add your thoughts or approval notes..." 
          value={comment}
          onChange={e => setComment(e.target.value)}
          className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all focus:outline-none"
        />
        <button 
          type="submit" 
          disabled={!comment.trim() || postComment.isPending}
          className="btn btn-primary px-5 shadow-sm shadow-primary-500/20"
        >
          {postComment.isPending ? '...' : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
}
