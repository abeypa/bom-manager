import React, { useState } from 'react';
import { PendingPart, pendingPartsApi } from '@/api/pending-parts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRole } from '@/hooks/useRole';
import { useToast } from '@/context/ToastContext';
import { Clock, CheckCircle2, XCircle, Link2, MessageSquare, ShieldCheck } from 'lucide-react';
import DiscussionThread from './DiscussionThread.tsx';

export default function PendingPartCard({ part }: { part: PendingPart }) {
  const { isAdmin } = useRole();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showThread, setShowThread] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  const updateStatus = useMutation({
    mutationFn: ({ status, reason }: { status: 'Approved' | 'Rejected', reason?: string }) => 
      pendingPartsApi.updatePendingPartStatus(part.id, status, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-parts', part.project_id] });
      showToast('success', 'Part status updated');
      setIsRejecting(false);
    },
    onError: (err: any) => showToast('error', err.message)
  });

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
    <div className="bg-white flex flex-col rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden group hover:border-primary-200 hover:shadow-md transition-all">
      <div className="p-6 flex-1">
        <div className="flex justify-between items-start mb-4 gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-2">
              {getStatusBadge()}
              <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded-xl text-[10px] uppercase font-black tracking-widest border border-slate-200">
                {part.category?.replace(/_/g, ' ') || 'General'}
              </span>
            </div>
            <h3 className="text-xl font-bold text-navy-900 group-hover:text-primary-600 transition-colors">
              {part.name}
            </h3>
            <p className="text-xs font-bold text-slate-400 mt-1">Requested by {part.author_email || 'Unknown'}</p>
          </div>
          {isAdmin && part.status === 'Pending' && !isRejecting && (
            <div className="flex flex-col items-end gap-2 shrink-0">
              <button 
                onClick={() => updateStatus.mutate({ status: 'Approved' })}
                className="btn bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20 shadow-lg px-4 w-full"
              >
                <ShieldCheck className="w-4 h-4 mr-2" />
                Approve
              </button>
              <button 
                onClick={() => setIsRejecting(true)}
                className="btn btn-secondary border-red-100 text-red-600 hover:bg-red-50 hover:border-red-200 px-4 w-full"
              >
                Reject
              </button>
            </div>
          )}
        </div>

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
            <p className="text-sm text-slate-600 leading-relaxed mb-6 whitespace-pre-wrap">
              {part.description || <span className="italic text-slate-300">No description provided</span>}
            </p>

            {part.status === 'Rejected' && part.rejection_reason && (
              <div className="bg-red-50 border border-red-100 p-4 rounded-xl mb-6">
                <span className="text-[10px] uppercase font-black tracking-widest text-red-500 mb-1 block">Admin Feedback</span>
                <p className="text-sm font-bold text-red-700">{part.rejection_reason}</p>
              </div>
            )}

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
      
      <div className="bg-slate-50 border-t border-slate-100 p-4 shrink-0 flex justify-between items-center cursor-pointer hover:bg-slate-100 transition-colors mt-auto" onClick={() => setShowThread(!showThread)}>
         <span className={`text-xs font-black uppercase flex items-center gap-2 ${showThread ? "text-primary-600" : "text-slate-500"}`}>
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
  );
}
