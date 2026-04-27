import React, { useState } from 'react';
import { PendingPart, PendingPartPriority, pendingPartsApi } from '@/api/pending-parts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRole } from '@/hooks/useRole';
import { useToast } from '@/context/ToastContext';
import { supabase } from '@/lib/supabase';
import {
  Clock, CheckCircle2, XCircle, Link2, MessageSquare,
  Trash2, Pencil, ChevronDown, ChevronUp, AlertTriangle, ArrowUp, Minus, ArrowDown,
} from 'lucide-react';
import DiscussionThread from './DiscussionThread.tsx';
import PendingPartFormModal from './PendingPartFormModal.tsx';

const PRIORITY_CONFIG: Record<PendingPartPriority, { icon: React.ReactNode; label: string; cls: string }> = {
  Urgent: { icon: <AlertTriangle size={11} />, label: 'Urgent', cls: 'bg-red-50 text-red-600 border-red-200' },
  High:   { icon: <ArrowUp size={11} />,       label: 'High',   cls: 'bg-orange-50 text-orange-600 border-orange-200' },
  Medium: { icon: <Minus size={11} />,          label: 'Medium', cls: 'bg-amber-50 text-amber-600 border-amber-200' },
  Low:    { icon: <ArrowDown size={11} />,      label: 'Low',    cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

export default function PendingPartCard({ part, projectId }: { part: PendingPart; projectId: number }) {
  const { isAdmin } = useRole();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showThread, setShowThread] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  React.useEffect(() => {
    supabase.auth.getUser().then((res: any) => {
      setCurrentUserId(res.data.user?.id ?? null);
    });
  }, []);

  const canEdit = isAdmin || currentUserId === part.created_by;

  const deleteMut = useMutation({
    mutationFn: () => pendingPartsApi.deletePendingPart(part.id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['pending-parts', projectId] });
      const prev = queryClient.getQueryData<PendingPart[]>(['pending-parts', projectId]);
      if (prev) queryClient.setQueryData<PendingPart[]>(['pending-parts', projectId], prev.filter(p => p.id !== part.id));
      return { prev };
    },
    onSuccess: () => showToast('success', 'Part deleted permanently'),
    onError: (err: any, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['pending-parts', projectId], ctx.prev);
      showToast('error', 'Delete failed: ' + err.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['pending-parts', projectId] }),
  });

  const handleDelete = () => {
    if (window.confirm('Delete this pending part and all associated comments/images? This cannot be undone.')) {
      deleteMut.mutate();
    }
  };

  // Status badge
  const statusConfig = {
    Approved: { icon: <CheckCircle2 size={11} />, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    Rejected: { icon: <XCircle size={11} />,      cls: 'bg-red-50 text-red-600 border-red-200' },
    Pending:  { icon: <Clock size={11} />,        cls: 'bg-amber-50 text-amber-600 border-amber-200' },
  };
  const st = statusConfig[part.status];
  const pr = PRIORITY_CONFIG[part.priority] || PRIORITY_CONFIG.Medium;
  const initial = (str?: string | null) => (str || '?')[0].toUpperCase();

  return (
    <>
      <div className="bg-white flex flex-col rounded-[1.75rem] border border-slate-200/80 shadow-sm overflow-hidden group hover:border-primary-200 hover:shadow-lg transition-all duration-300">
        <div className="p-5 flex-1">

          {/* Row 1: Priority + Status + Category + Actions */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Priority badge */}
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${pr.cls}`}>
                {pr.icon} {pr.label}
              </span>
              {/* Status badge */}
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${st.cls}`}>
                {st.icon} {part.status}
              </span>
              {/* Category */}
              <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded-xl text-[10px] uppercase font-black tracking-widest border border-slate-200/80">
                {part.category?.replace(/_/g, ' ') || 'General'}
              </span>
            </div>

            {/* Edit + Delete */}
            <div className="flex items-center gap-1.5 shrink-0">
              {canEdit && (
                <button
                  onClick={() => setEditOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-primary-600 hover:bg-primary-50 border border-transparent hover:border-primary-200 rounded-xl transition-all"
                  title="Edit Part"
                >
                  <Pencil size={12} />
                  Edit
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={handleDelete}
                  disabled={deleteMut.isPending}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-100 rounded-xl transition-all disabled:opacity-50"
                  title="Delete"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Title */}
          <h3 className="text-lg font-black text-navy-900 group-hover:text-primary-600 transition-colors leading-snug mb-2.5">
            {part.name}
          </h3>

          {/* Author + Assignee row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-4">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[9px] font-black ring-1 ring-white shrink-0">
                {initial(part.author_name || part.author_email)}
              </div>
              <div>
                <span className="text-[10px] font-black text-slate-700">{part.author_name || part.author_email || 'Unknown'}</span>
                <span className="text-[9px] font-bold text-slate-400 ml-1.5" title={new Date(part.created_at).toLocaleString()}>
                  · {new Date(part.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            </div>
            {(part.assignee_name || part.assignee_email) && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-50 border border-indigo-100 rounded-lg">
                <div className="w-4 h-4 rounded-full bg-indigo-200 text-indigo-700 flex items-center justify-center text-[8px] font-black shrink-0">
                  {initial(part.assignee_name || part.assignee_email)}
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600 truncate max-w-[100px]">
                  {part.assignee_name || part.assignee_email}
                </span>
              </div>
            )}
          </div>

          {/* Description */}
          {part.description && (
            <p className="text-sm text-slate-600 leading-relaxed mb-4 whitespace-pre-wrap">{part.description}</p>
          )}

          {/* Rejection reason */}
          {part.status === 'Rejected' && part.rejection_reason && (
            <div className="bg-red-50/80 border border-red-100 p-3.5 rounded-xl mb-4">
              <span className="text-[9px] uppercase font-black tracking-widest text-red-500 mb-1 block">Admin Feedback</span>
              <p className="text-sm font-semibold text-red-700">{part.rejection_reason}</p>
            </div>
          )}

          {/* Approval meta */}
          {part.approved_at && part.status !== 'Pending' && (
            <div className={`p-3 rounded-xl mb-4 border flex items-start gap-2.5 ${
              part.status === 'Approved' ? 'bg-emerald-50/60 border-emerald-100 text-emerald-800' : 'bg-red-50/60 border-red-100 text-red-800'
            }`}>
              {part.status === 'Approved' ? <CheckCircle2 size={15} className="text-emerald-500 mt-0.5 shrink-0" /> : <XCircle size={15} className="text-red-500 mt-0.5 shrink-0" />}
              <div>
                <span className={`text-[9px] uppercase font-black tracking-widest block mb-0.5 ${part.status === 'Approved' ? 'text-emerald-600' : 'text-red-600'}`}>
                  {part.status} Evaluation
                </span>
                <span className="text-xs font-medium">
                  By <strong>{part.approver_name || 'Admin'}</strong> on{' '}
                  <strong>{new Date(part.approved_at).toLocaleString()}</strong>
                </span>
              </div>
            </div>
          )}

          {/* Images + links */}
          {(part.images?.length > 0 || part.links?.length > 0) && (
            <div className="flex flex-wrap gap-5 border-t border-slate-100 pt-4 mb-1">
              {part.images?.length > 0 && (
                <div>
                  <h4 className="text-[9px] uppercase font-black tracking-widest text-slate-400 mb-2">Images</h4>
                  <div className="flex gap-2">
                    {part.images.map((img, i) => (
                      <a key={i} href={img} target="_blank" rel="noreferrer" className="w-11 h-11 rounded-xl border border-slate-200 overflow-hidden hover:border-primary-400 transition-all block shrink-0 shadow-sm hover:shadow-md">
                        <img src={img} alt="Preview" className="w-full h-full object-cover" loading="lazy" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {part.links?.length > 0 && (
                <div>
                  <h4 className="text-[9px] uppercase font-black tracking-widest text-slate-400 mb-2">References</h4>
                  <div className="flex flex-col gap-1.5">
                    {part.links.map((link, i) => (
                      <a key={i} href={link.url} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary-600 hover:text-primary-700 hover:underline flex items-center bg-primary-50/60 px-2 py-1 rounded-lg w-max max-w-[180px]">
                        <Link2 className="w-3 h-3 mr-1.5 shrink-0 opacity-60" />
                        <span className="truncate">{link.label || 'External Link'}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Discussion toggle */}
        <button
          type="button"
          className={`flex items-center justify-between px-5 py-3 border-t text-left w-full transition-all duration-200 ${
            showThread ? 'bg-primary-50/60 border-primary-100 text-primary-600' : 'bg-slate-50/80 border-slate-100 text-slate-500 hover:bg-slate-100/80'
          }`}
          onClick={() => setShowThread(!showThread)}
        >
          <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
            <MessageSquare size={13} />
            Discussion
          </span>
          {showThread ? <ChevronUp size={14} className="opacity-60" /> : <ChevronDown size={14} className="opacity-40" />}
        </button>

        {showThread && (
          <div className="border-t border-slate-100 animate-in slide-in-from-top-1 duration-200">
            <DiscussionThread pendingPartId={part.id} projectId={projectId} partStatus={part.status} />
          </div>
        )}
      </div>

      {editOpen && (
        <PendingPartFormModal isOpen={editOpen} onClose={() => setEditOpen(false)} projectId={projectId} editPart={part} />
      )}
    </>
  );
}
