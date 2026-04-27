import React, { useState } from 'react';
import { PendingPart, pendingPartsApi } from '@/api/pending-parts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRole } from '@/hooks/useRole';
import { useToast } from '@/context/ToastContext';
import { supabase } from '@/lib/supabase';
import {
  Clock, CheckCircle2, XCircle, Link2, MessageSquare,
  ShieldCheck, UserCircle2, Trash2, Pencil,
} from 'lucide-react';
import DiscussionThread from './DiscussionThread.tsx';
import PendingPartFormModal from './PendingPartFormModal.tsx';

export default function PendingPartCard({ part, projectId }: { part: PendingPart; projectId: number }) {
  const { isAdmin } = useRole();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showThread, setShowThread] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Track current user id to show Edit button to creator too
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const canEdit = isAdmin || currentUserId === part.created_by;

  const updateStatus = useMutation({
    mutationFn: ({ status, reason }: { status: 'Approved' | 'Rejected'; reason?: string }) =>
      pendingPartsApi.updatePendingPartStatus(part.id, status, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-parts', projectId] });
      showToast('success', 'Part status updated');
      setIsRejecting(false);
    },
    onError: (err: any) => showToast('error', err.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => pendingPartsApi.deletePendingPart(part.id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['pending-parts', projectId] });
      const previousParts = queryClient.getQueryData<PendingPart[]>(['pending-parts', projectId]);
      if (previousParts) {
        queryClient.setQueryData<PendingPart[]>(
          ['pending-parts', projectId],
          previousParts.filter(p => p.id !== part.id)
        );
      }
      return { previousParts };
    },
    onSuccess: () => showToast('success', 'Pending request deleted permanently'),
    onError: (err: any, _vars, context) => {
      if (context?.previousParts) {
        queryClient.setQueryData(['pending-parts', projectId], context.previousParts);
      }
      showToast('error', 'Delete failed: ' + err.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['pending-parts', projectId] }),
  });

  const handleDelete = () => {
    if (window.confirm('Delete this pending part and all associated comments/images? This action cannot be undone.')) {
      deleteMut.mutate();
    }
  };

  const getStatusBadge = () => {
    switch (part.status) {
      case 'Approved':
        return <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-black uppercase tracking-widest"><CheckCircle2 size={12} /> Approved</span>;
      case 'Rejected':
        return <span className="flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-600 border border-red-200 rounded-full text-xs font-black uppercase tracking-widest"><XCircle size={12} /> Rejected</span>;
      default:
        return <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-600 border border-amber-200 rounded-full text-xs font-black uppercase tracking-widest"><Clock size={12} /> Pending</span>;
    }
  };

  return (
    <>
      <div className="bg-white flex flex-col rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden group hover:border-primary-200 hover:shadow-md transition-all">
        <div className="p-6 flex-1">

          {/* Header row */}
          <div className="flex justify-between items-start mb-4 gap-4">
            <div className="flex-1 min-w-0">
              {/* Badges */}
              <div className="flex flex-wrap items-center gap-3 mb-2">
                {getStatusBadge()}
                <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded-xl text-[10px] uppercase font-black tracking-widest border border-slate-200">
                  {part.category?.replace(/_/g, ' ') || 'General'}
                </span>
              </div>

              {/* Title */}
              <h3 className="text-xl font-bold text-navy-900 group-hover:text-primary-600 transition-colors truncate">
                {part.name}
              </h3>

              {/* Author row */}
              <div className="flex items-center gap-2 mt-2">
                <UserCircle2 className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-700">{part.author_name || part.author_email || 'Unknown Integrator'}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400" title={new Date(part.created_at).toLocaleString()}>
                    Requested {new Date(part.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Assignee chip */}
              {(part.assignee_name || part.assignee_email) && (
                <div className="mt-2 flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-black ring-1 ring-white shrink-0">
                    {(part.assignee_name || part.assignee_email || '?')[0].toUpperCase()}
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">
                    Assigned → {part.assignee_name || part.assignee_email}
                  </span>
                </div>
              )}
            </div>

            {/* Admin / creator actions */}
            <div className="flex flex-col items-end gap-2 shrink-0">
              {/* Edit button */}
              {canEdit && !isRejecting && (
                <button
                  onClick={() => setEditOpen(true)}
                  className="btn btn-ghost text-slate-500 hover:text-primary-600 hover:bg-primary-50 px-3 border-slate-200"
                  title="Edit Part"
                >
                  <Pencil className="w-4 h-4 mr-1.5" />
                  Edit
                </button>
              )}

              {isAdmin && !isRejecting && (
                <>
                  {part.status === 'Pending' && (
                    <>
                      <button
                        onClick={() => updateStatus.mutate({ status: 'Approved' })}
                        disabled={updateStatus.isPending}
                        className="btn bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20 shadow-lg px-4 w-full"
                      >
                        <ShieldCheck className="w-4 h-4 mr-2" />
                        {updateStatus.isPending ? '...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => setIsRejecting(true)}
                        className="btn btn-secondary border-red-100 text-red-600 hover:bg-red-50 hover:border-red-200 px-4 w-full"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  <button
                    onClick={handleDelete}
                    disabled={deleteMut.isPending}
                    className="btn btn-ghost text-slate-400 hover:text-red-500 hover:bg-red-50 w-full px-4 border-dashed border-slate-200"
                    title="Delete Request"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {deleteMut.isPending ? 'Deleting...' : 'Delete'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Rejection flow */}
          {isRejecting ? (
            <div className="bg-red-50 border border-red-100 rounded-2xl p-4 mb-4 animate-in fade-in slide-in-from-top-2">
              <h4 className="text-xs font-black uppercase tracking-widest text-red-600 mb-2">Rejection Reason</h4>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                className="w-full bg-white border border-red-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-red-500/20 mb-3"
                placeholder="Why is this requested part being rejected...?"
                rows={3}
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setIsRejecting(false)} className="btn btn-secondary px-4 py-2">Cancel</button>
                <button onClick={() => updateStatus.mutate({ status: 'Rejected', reason: rejectReason })} className="btn bg-red-600 text-white hover:bg-red-700 px-4 py-2">Confirm Rejection</button>
              </div>
            </div>
          ) : (
            <>
              {/* Description */}
              <p className="text-sm text-slate-600 leading-relaxed mb-6 whitespace-pre-wrap">
                {part.description || <span className="italic text-slate-300">No description provided</span>}
              </p>

              {/* Rejection reason */}
              {part.status === 'Rejected' && part.rejection_reason && (
                <div className="bg-red-50 border border-red-100 p-4 rounded-xl mb-6">
                  <span className="text-[10px] uppercase font-black tracking-widest text-red-500 mb-1 block">Admin Feedback</span>
                  <p className="text-sm font-bold text-red-700">{part.rejection_reason}</p>
                </div>
              )}

              {/* Approval meta */}
              {part.approved_at && part.status !== 'Pending' && (
                <div className={`p-3 rounded-xl mb-6 border flex items-start gap-3 ${part.status === 'Approved' ? 'bg-emerald-50/50 border-emerald-100 text-emerald-800' : 'bg-red-50/50 border-red-100 text-red-800'}`}>
                  {part.status === 'Approved'
                    ? <CheckCircle2 size={16} className="text-emerald-500 mt-0.5" />
                    : <XCircle size={16} className="text-red-500 mt-0.5" />}
                  <div>
                    <span className={`text-[10px] uppercase font-black tracking-widest block mb-0.5 ${part.status === 'Approved' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {part.status} Evaluation
                    </span>
                    <span className="text-xs font-medium">
                      Processed by <span className="font-bold">{part.approver_name || 'Admin'}</span> on{' '}
                      <span className="font-bold">{new Date(part.approved_at).toLocaleString()}</span>
                    </span>
                  </div>
                </div>
              )}

              {/* Images + links */}
              {(part.images?.length > 0 || part.links?.length > 0) && (
                <div className="flex flex-wrap gap-6 border-t border-slate-100 pt-5 mb-2">
                  {part.images?.length > 0 && (
                    <div>
                      <h4 className="text-[9px] uppercase font-black tracking-widest text-slate-400 mb-2">Images</h4>
                      <div className="flex gap-2">
                        {part.images.map((img, i) => (
                          <a key={i} href={img} target="_blank" rel="noreferrer" className="w-12 h-12 rounded-xl border border-slate-200 overflow-hidden hover:border-primary-400 transition-colors block shrink-0 shadow-sm">
                            <img src={img} alt="Preview" className="w-full h-full object-cover" loading="lazy" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {part.links?.length > 0 && (
                    <div>
                      <h4 className="text-[9px] uppercase font-black tracking-widest text-slate-400 mb-2">References</h4>
                      <div className="flex flex-col gap-1.5 flex-wrap max-h-24">
                        {part.links.map((link, i) => (
                          <a key={i} href={link.url} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary-600 hover:text-primary-700 hover:underline flex items-center bg-primary-50/50 px-2 py-1 rounded-lg w-max">
                            <Link2 className="w-3 h-3 mr-1.5 shrink-0" />
                            <span className="truncate max-w-[150px]">{link.label || 'External Link'}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Discussion toggle */}
        <div
          className="bg-slate-50 border-t border-slate-100 p-4 shrink-0 flex justify-between items-center cursor-pointer hover:bg-slate-100 transition-colors mt-auto"
          onClick={() => setShowThread(!showThread)}
        >
          <span className={`text-xs font-black uppercase flex items-center gap-2 ${showThread ? 'text-primary-600' : 'text-slate-500'}`}>
            <MessageSquare size={14} />
            Discussion Thread
          </span>
          <span className="text-xs font-bold text-slate-400">{showThread ? 'Hide Comments' : 'Show Comments'}</span>
        </div>

        {showThread && (
          <div className="border-t border-slate-200">
            <DiscussionThread pendingPartId={part.id} />
          </div>
        )}
      </div>

      {/* Edit modal (in-place, no tab-level state needed) */}
      {editOpen && (
        <PendingPartFormModal
          isOpen={editOpen}
          onClose={() => setEditOpen(false)}
          projectId={projectId}
          editPart={part}
        />
      )}
    </>
  );
}
