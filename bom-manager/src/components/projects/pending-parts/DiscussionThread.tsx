import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pendingPartsApi, PendingPartComment, Profile } from '@/api/pending-parts';
import { Send, X, Loader2, CornerDownRight, Reply, AtSign } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { supabase } from '@/lib/supabase';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeAgo(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getInitial(name?: string | null, email?: string | null) {
  return (name || email || '?')[0].toUpperCase();
}

/**
 * Parse a comment message into plain text segments and @mention segments.
 * Mentions are stored as "@displayName" within the text.
 */
function parseMentions(text: string, profiles: Profile[]): React.ReactNode[] {
  // Build a lookup: full_name → profile (for matching stored mentions)
  const byName = new Map(profiles.map(p => [p.full_name || p.email || '', p]));
  const parts: React.ReactNode[] = [];
  // Regex: match @<word chars + spaces, but stop at punctuation>
  const regex = /@([\w\s]+?)(?=\s|$|[^\w\s])/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    const mentionName = match[1].trim();
    const profile = byName.get(mentionName);
    parts.push(
      <span
        key={match.index}
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-primary-100 text-primary-700 font-bold text-[0.8em] mx-0.5 cursor-default"
        title={profile?.email || mentionName}
      >
        <span className="text-[9px] opacity-60">@</span>{mentionName}
      </span>
    );
    last = match.index + match[0].length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// ─── Mention Dropdown ─────────────────────────────────────────────────────────

interface MentionDropdownProps {
  profiles: Profile[];
  query: string;
  onSelect: (profile: Profile) => void;
  style?: React.CSSProperties;
}

function MentionDropdown({ profiles, query, onSelect, style }: MentionDropdownProps) {
  const filtered = profiles.filter(p => {
    const name = (p.full_name || '').toLowerCase();
    const email = (p.email || '').toLowerCase();
    const q = query.toLowerCase();
    return name.includes(q) || email.includes(q);
  }).slice(0, 6);

  if (filtered.length === 0) return null;

  return (
    <div
      className="absolute z-50 bottom-full mb-2 left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden animate-in slide-in-from-bottom-2 duration-150"
      style={style}
    >
      <div className="px-3 pt-2.5 pb-1 border-b border-slate-100">
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Mention a team member</span>
      </div>
      {filtered.map(p => (
        <button
          key={p.id}
          type="button"
          onMouseDown={e => { e.preventDefault(); onSelect(p); }}
          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-primary-50 transition-colors text-left group"
        >
          <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-black ring-2 ring-white shrink-0 group-hover:ring-primary-200 transition-all">
            {getInitial(p.full_name, p.email)}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-navy-900 truncate">{p.full_name || 'Unknown'}</div>
            {p.email && <div className="text-[10px] text-slate-400 font-medium truncate">{p.email}</div>}
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Comment Node (recursive) ─────────────────────────────────────────────────

interface CommentNodeProps {
  comment: PendingPartComment;
  depth: number;
  onReply: (comment: PendingPartComment) => void;
  profiles: Profile[];
}

function CommentNode({ comment, depth, onReply, profiles }: CommentNodeProps) {
  const isNested = depth > 0;
  const initial = getInitial(comment.author_name, comment.author_email);

  return (
    <div className={`flex gap-3 animate-in fade-in slide-in-from-bottom-1 duration-200 ${isNested ? 'ml-9 mt-2 relative' : ''}`}>
      {/* Thread line */}
      {isNested && (
        <div className="absolute -left-5 top-0 bottom-0 w-px bg-gradient-to-b from-slate-200 to-transparent" />
      )}

      {/* Avatar */}
      <div className="shrink-0 mt-0.5">
        {comment.author_avatar ? (
          <img
            src={comment.author_avatar}
            alt="Avatar"
            className={`rounded-full border-2 border-white shadow-sm object-cover ring-1 ring-slate-200 ${isNested ? 'w-6 h-6' : 'w-8 h-8'}`}
          />
        ) : (
          <div className={`rounded-full flex items-center justify-center uppercase font-black ring-2 ring-white shadow-sm ${
            isNested
              ? 'w-6 h-6 text-[10px] bg-slate-100 text-slate-500'
              : 'w-8 h-8 text-sm bg-gradient-to-br from-primary-400 to-primary-600 text-white'
          }`}>
            {initial}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Bubble */}
        <div className={`bg-white border border-slate-200/80 rounded-2xl rounded-tl-sm shadow-sm overflow-hidden transition-shadow hover:shadow-md ${isNested ? 'rounded-tl-sm' : ''}`}>
          {/* Header */}
          <div className="flex items-center justify-between px-3.5 pt-2.5 pb-1.5 gap-2">
            <span className="text-[11px] font-black text-navy-900 tracking-tight truncate">
              {comment.author_name || comment.author_email || 'Unknown'}
            </span>
            <span
              className="text-[10px] text-slate-400 font-semibold shrink-0 ml-2"
              title={new Date(comment.created_at).toLocaleString()}
            >
              {formatTimeAgo(comment.created_at)}
            </span>
          </div>

          {/* Message with @mention highlights */}
          {comment.message && (
            <p className="px-3.5 pb-2.5 text-sm text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">
              {parseMentions(comment.message, profiles)}
            </p>
          )}

          {/* Attached images */}
          {comment.images && comment.images.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3.5 pb-3 pt-0.5">
              {comment.images.map((img, idx) => (
                <a
                  key={idx}
                  href={img}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-xl overflow-hidden border border-slate-200 hover:border-primary-400 transition-all shadow-sm hover:shadow-md"
                >
                  <img src={img} alt="Attached" className="w-full h-auto max-h-40 max-w-xs object-cover" loading="lazy" />
                </a>
              ))}
            </div>
          )}

          {/* Reply action */}
          <div className="px-3.5 pb-2.5 pt-0">
            <button
              onClick={() => onReply(comment)}
              className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-primary-600 transition-colors group"
            >
              <Reply size={11} className="group-hover:scale-110 transition-transform" />
              Reply
            </button>
          </div>
        </div>

        {/* Nested replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-2 space-y-2 relative pl-1">
            {comment.replies.map(reply => (
              <CommentNode key={reply.id} comment={reply} depth={depth + 1} onReply={onReply} profiles={profiles} />
            ))}
          </div>
        )}
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

  // @mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null); // null = closed
  const [mentionStart, setMentionStart] = useState(0); // cursor position of the "@"

  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: commentTree, isLoading } = useQuery({
    queryKey: ['pending-part-comments', pendingPartId],
    queryFn: () => pendingPartsApi.getComments(pendingPartId),
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: () => pendingPartsApi.getProfiles(),
  });

  const postComment = useMutation({
    mutationFn: () =>
      pendingPartsApi.addComment(pendingPartId, comment, attachedImages, replyTo?.id ?? null),
    onSuccess: () => {
      setComment('');
      setAttachedImages([]);
      setReplyTo(null);
      setMentionQuery(null);
      queryClient.invalidateQueries({ queryKey: ['pending-part-comments', pendingPartId] });
    },
    onError: (err: any) => showToast('error', err.message),
  });

  // Detect @ in the input and activate mention dropdown
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setComment(val);

    const cursor = e.target.selectionStart ?? val.length;
    // Find the last @ before the cursor
    const beforeCursor = val.slice(0, cursor);
    const atIndex = beforeCursor.lastIndexOf('@');

    if (atIndex !== -1) {
      const afterAt = beforeCursor.slice(atIndex + 1);
      // Only show if no space in the query (user hasn't finished the mention word)
      if (!afterAt.includes(' ') || afterAt.length === 0) {
        setMentionQuery(afterAt);
        setMentionStart(atIndex);
        return;
      }
    }
    setMentionQuery(null);
  };

  const insertMention = useCallback((profile: Profile) => {
    const displayName = profile.full_name || profile.email || 'User';
    const before = comment.slice(0, mentionStart);
    const after = comment.slice(mentionStart + 1 + (mentionQuery?.length ?? 0));
    const newVal = `${before}@${displayName} ${after}`;
    setComment(newVal);
    setMentionQuery(null);
    setTimeout(() => {
      if (inputRef.current) {
        const pos = before.length + displayName.length + 2;
        inputRef.current.focus();
        inputRef.current.setSelectionRange(pos, pos);
      }
    }, 10);
  }, [comment, mentionStart, mentionQuery]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (mentionQuery !== null && e.key === 'Escape') {
      setMentionQuery(null);
    }
    if (e.key === 'Enter' && !e.shiftKey && mentionQuery === null) {
      e.preventDefault();
      if (comment.trim() || attachedImages.length > 0) postComment.mutate();
    }
  };

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
          const { error } = await supabase.storage
            .from('bom_assets')
            .upload(`comments/${name}`, file, { cacheControl: '3600', upsert: false });
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

  const totalComments = (commentTree || []).reduce(
    function count(acc: number, c: PendingPartComment): number {
      return acc + 1 + (c.replies ? c.replies.reduce(count, 0) : 0);
    }, 0
  );

  if (isLoading) return (
    <div className="p-8 flex items-center justify-center gap-2 text-slate-400">
      <Loader2 size={16} className="animate-spin" />
      <span className="text-[10px] font-black uppercase tracking-widest">Loading thread...</span>
    </div>
  );

  return (
    <div className="flex flex-col bg-slate-50/80">

      {/* Thread header */}
      {totalComments > 0 && (
        <div className="px-5 pt-3.5 pb-1 flex items-center gap-2">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-[9px] uppercase font-black tracking-widest text-slate-400 shrink-0">
            {totalComments} {totalComments === 1 ? 'comment' : 'comments'}
          </span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>
      )}

      {/* Comment tree */}
      <div className="max-h-[26rem] overflow-y-auto hidden-scrollbar px-5 py-4 space-y-4">
        {(commentTree?.length ?? 0) === 0 ? (
          <div className="text-center py-8">
            <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-2">
              <AtSign size={18} className="text-slate-300" />
            </div>
            <p className="text-slate-400 text-sm font-medium">No comments yet.</p>
            <p className="text-slate-300 text-xs mt-0.5">Start the discussion or @mention someone.</p>
          </div>
        ) : (
          commentTree!.map(c => (
            <CommentNode key={c.id} comment={c} depth={0} onReply={handleReply} profiles={profiles} />
          ))
        )}
      </div>

      {/* Image previews */}
      {attachedImages.length > 0 && (
        <div className="px-4 py-2.5 bg-white border-t border-slate-100 flex gap-2.5 overflow-x-auto">
          {attachedImages.map((img, idx) => (
            <div key={idx} className="relative w-14 h-14 rounded-xl border border-slate-200 overflow-hidden group shrink-0 shadow-sm bg-white">
              <img src={img} alt="Preview" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => setAttachedImages(prev => prev.filter((_, i) => i !== idx))}
                className="absolute top-0.5 right-0.5 bg-red-500/90 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
              >
                <X size={9} />
              </button>
            </div>
          ))}
          {isUploading && (
            <div className="w-14 h-14 rounded-xl border border-slate-200 bg-white/80 flex items-center justify-center shrink-0">
              <Loader2 size={14} className="animate-spin text-primary-400" />
            </div>
          )}
        </div>
      )}

      {/* Reply-to banner */}
      {replyTo && (
        <div className="mx-4 px-3 py-2 bg-primary-50 border border-primary-100 rounded-xl flex items-center justify-between gap-2 animate-in slide-in-from-top-1 duration-150">
          <div className="flex items-center gap-1.5 text-xs text-primary-700 font-bold truncate min-w-0">
            <CornerDownRight size={12} className="shrink-0 text-primary-400" />
            <span className="truncate">
              Replying to{' '}
              <span className="font-black">@{replyTo.author_name || replyTo.author_email || 'User'}</span>
            </span>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-primary-300 hover:text-primary-600 transition-colors shrink-0 p-0.5 rounded hover:bg-primary-100">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Input form */}
      <form onSubmit={e => { e.preventDefault(); if (comment.trim() || attachedImages.length > 0) postComment.mutate(); }} className="p-3.5 bg-white border-t border-slate-200 flex gap-2.5 sticky bottom-0">
        <div className="flex-1 relative">
          {/* Mention dropdown */}
          {mentionQuery !== null && (
            <MentionDropdown
              profiles={profiles}
              query={mentionQuery}
              onSelect={insertMention}
            />
          )}

          <input
            ref={inputRef}
            type="text"
            placeholder={
              replyTo
                ? `Reply to @${replyTo.author_name || replyTo.author_email || 'User'}… or paste image`
                : 'Add a comment, type @ to mention… or paste image (Ctrl+V)'
            }
            value={comment}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-sm font-medium placeholder:text-slate-400 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all focus:outline-none focus:bg-white"
          />
          {isUploading && (
            <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-primary-500" />
          )}
        </div>

        <button
          type="submit"
          disabled={(!comment.trim() && attachedImages.length === 0) || postComment.isPending || isUploading}
          className="btn btn-primary px-4 shadow-sm shadow-primary-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {postComment.isPending
            ? <Loader2 size={15} className="animate-spin" />
            : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
}
