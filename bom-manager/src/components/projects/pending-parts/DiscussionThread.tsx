import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pendingPartsApi, PendingPartComment } from '@/api/pending-parts';
import { Send, X, Loader2, CornerDownRight, Reply } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { supabase } from '@/lib/supabase';

function formatTimeAgo(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function getInitial(name?: string, email?: string) {
  return (name || email || '?')[0].toUpperCase();
}

// ─── Single comment bubble (recursive for replies) ────────────────────────────
interface CommentNodeProps {
  comment: PendingPartComment;
  depth: number;
  onReply: (comment: PendingPartComment) => void;
}

function CommentNode({ comment, depth, onReply }: CommentNodeProps) {
  const isNested = depth > 0;

  return (
    <div className={`flex gap-2.5 animate-in slide-in-from-bottom-1 ${isNested ? 'ml-8 mt-2' : ''}`}>
      {/* Thread line for nested */}
      {isNested && (
        <div className="flex flex-col items-center shrink-0 mt-1">
          <div className="w-px flex-1 bg-slate-200 min-h-[20px]" />
        </div>
      )}

      <div className="flex gap-2.5 flex-1 min-w-0">
        {/* Avatar */}
        <div className="shrink-0">
          {comment.author_avatar ? (
            <img src={comment.author_avatar} alt="Avatar" className="w-7 h-7 rounded-full border border-slate-200 object-cover bg-white" />
          ) : (
            <div className={`flex items-center justify-center rounded-full uppercase font-black text-xs ring-2 ring-white shrink-0 ${isNested ? 'w-6 h-6 text-[10px] bg-slate-100 text-slate-600' : 'w-7 h-7 bg-primary-100 text-primary-700'}`}>
              {getInitial(comment.author_name, comment.author_email)}
            </div>
          )}
        </div>

        {/* Bubble */}
        <div className="flex-1 min-w-0">
          <div className={`bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden ${isNested ? 'rounded-tl-sm' : 'rounded-tl-sm'}`}>
            {/* Meta row */}
            <div className="flex justify-between items-center px-3 pt-2.5 pb-1.5 border-b border-slate-50">
              <span className="text-[10px] font-black uppercase text-navy-900 tracking-wider truncate">
                {comment.author_name || comment.author_email || 'Unknown User'}
              </span>
              <span className="text-[9px] text-slate-400 font-bold ml-2 shrink-0" title={new Date(comment.created_at).toLocaleString()}>
                {formatTimeAgo(comment.created_at)}
              </span>
            </div>

            {/* Message */}
            {comment.message && (
              <p className="px-3 pt-2 pb-2 text-sm text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">{comment.message}</p>
            )}

            {/* Attached images */}
            {comment.images && comment.images.length > 0 && (
              <div className="flex flex-wrap gap-2 px-3 pb-3 pt-1">
                {comment.images.map((img, idx) => (
                  <a key={idx} href={img} target="_blank" rel="noreferrer" className="block rounded-xl overflow-hidden border border-slate-200 hover:border-primary-400 transition-colors shadow-sm bg-slate-50">
                    <img src={img} alt="Attached" className="w-full h-auto max-h-36 max-w-xs object-cover" loading="lazy" />
                  </a>
                ))}
              </div>
            )}

            {/* Reply action */}
            <div className="px-3 pb-2 pt-0.5">
              <button
                onClick={() => onReply(comment)}
                className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-primary-600 transition-colors"
              >
                <Reply size={11} />
                Reply
              </button>
            </div>
          </div>

          {/* Nested replies */}
          {comment.replies && comment.replies.length > 0 && (
            <div className="mt-1 space-y-1 relative">
              {/* Vertical thread connector */}
              <div className="absolute left-0 top-0 bottom-4 w-px bg-slate-200 ml-3" />
              <div className="space-y-1 pl-1">
                {comment.replies.map(reply => (
                  <CommentNode key={reply.id} comment={reply} depth={depth + 1} onReply={onReply} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main DiscussionThread ─────────────────────────────────────────────────────
export default function DiscussionThread({ pendingPartId }: { pendingPartId: number }) {
  const [comment, setComment] = useState('');
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [replyTo, setReplyTo] = useState<PendingPartComment | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: commentTree, isLoading } = useQuery({
    queryKey: ['pending-part-comments', pendingPartId],
    queryFn: () => pendingPartsApi.getComments(pendingPartId),
  });

  const postComment = useMutation({
    mutationFn: () =>
      pendingPartsApi.addComment(pendingPartId, comment, attachedImages, replyTo?.id ?? null),
    onSuccess: () => {
      setComment('');
      setAttachedImages([]);
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ['pending-part-comments', pendingPartId] });
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
          const ext = file.name.split('.').pop() || 'png';
          const name = `comment-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
          const { error } = await supabase.storage.from('bom_assets').upload(`comments/${name}`, file, { cacheControl: '3600', upsert: false });
          if (error) throw error;
          const { data: urlData } = supabase.storage.from('bom_assets').getPublicUrl(`comments/${name}`);
          setAttachedImages(prev => [...prev, urlData.publicUrl]);
        } catch (err: any) {
          showToast('error', 'Image upload failed: ' + err.message);
        } finally {
          setIsUploading(false);
        }
      }
    }
  };

  const handleReply = (c: PendingPartComment) => {
    setReplyTo(c);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (comment.trim() || attachedImages.length > 0) postComment.mutate();
  };

  if (isLoading) return (
    <div className="p-6 text-center text-slate-400 text-[10px] font-black uppercase tracking-widest">Loading thread...</div>
  );

  const totalComments = (commentTree || []).reduce(
    function count(acc: number, c: PendingPartComment): number {
      return acc + 1 + (c.replies ? c.replies.reduce(count, 0) : 0);
    }, 0
  );

  return (
    <div className="flex flex-col bg-slate-50 relative">

      {/* Comment count bar */}
      {totalComments > 0 && (
        <div className="px-6 pt-4 pb-1">
          <span className="text-[9px] uppercase font-black tracking-widest text-slate-400">
            {totalComments} {totalComments === 1 ? 'comment' : 'comments'}
          </span>
        </div>
      )}

      {/* Comment tree */}
      <div className="max-h-96 overflow-y-auto hidden-scrollbar p-5 space-y-4">
        {(commentTree?.length ?? 0) === 0 ? (
          <div className="text-center text-slate-400 text-sm py-8 italic font-medium bg-white/50 border border-slate-100 rounded-2xl shadow-sm">
            No comments yet. Start the discussion!
          </div>
        ) : (
          commentTree!.map(c => (
            <CommentNode key={c.id} comment={c} depth={0} onReply={handleReply} />
          ))
        )}
      </div>

      {/* Image previews */}
      {attachedImages.length > 0 && (
        <div className="px-4 py-3 bg-slate-100/80 border-t border-slate-200 flex gap-3 overflow-x-auto">
          {attachedImages.map((img, idx) => (
            <div key={idx} className="relative w-16 h-16 rounded-xl border border-slate-200 overflow-hidden group shrink-0 shadow-sm bg-white">
              <img src={img} alt="Preview" className="w-full h-full object-cover" />
              <button type="button" onClick={() => setAttachedImages(prev => prev.filter((_, i) => i !== idx))} className="absolute top-1 right-1 bg-red-500/90 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600">
                <X size={10} />
              </button>
            </div>
          ))}
          {isUploading && (
            <div className="w-16 h-16 rounded-xl border border-slate-200 bg-white/50 flex items-center justify-center shrink-0">
              <Loader2 size={16} className="animate-spin text-slate-400" />
            </div>
          )}
        </div>
      )}

      {/* Reply-to banner */}
      {replyTo && (
        <div className="mx-4 mb-0 mt-0 px-3 py-2 bg-primary-50 border border-primary-100 rounded-xl flex items-center justify-between gap-2 animate-in slide-in-from-top-1">
          <div className="flex items-center gap-2 text-xs text-primary-700 font-bold truncate">
            <CornerDownRight size={13} className="shrink-0" />
            Replying to <span className="font-black">@{replyTo.author_name || replyTo.author_email || 'User'}</span>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-primary-400 hover:text-primary-700 transition-colors shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 bg-white border-t border-slate-200 flex gap-3 sticky bottom-0">
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            placeholder={replyTo
              ? `Reply to @${replyTo.author_name || replyTo.author_email || 'User'}...`
              : 'Add note or paste image (Ctrl+V)...'}
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
