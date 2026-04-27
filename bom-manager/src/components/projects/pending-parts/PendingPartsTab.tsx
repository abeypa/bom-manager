import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { pendingPartsApi, PendingPart } from '@/api/pending-parts';
import { Plus, Search, Layers, Clock, CheckCircle2, XCircle } from 'lucide-react';
import PendingPartCard from './PendingPartCard.tsx';
import PendingPartFormModal from './PendingPartFormModal.tsx';

export default function PendingPartsTab({ projectId }: { projectId: number }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [filter, setFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('All');
  const [search, setSearch] = useState('');

  const { data: parts, isLoading } = useQuery<PendingPart[]>({
    queryKey: ['pending-parts', projectId],
    queryFn: () => pendingPartsApi.getPendingParts(projectId),
  });

  const filteredParts = useMemo(() => {
    return (parts || []).filter(part => {
      const matchesFilter = filter === 'All' || part.status === filter;
      const matchesSearch = 
        part.name.toLowerCase().includes(search.toLowerCase()) || 
        (part.description || '').toLowerCase().includes(search.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [parts, filter, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4 bg-white p-4 rounded-3xl border border-slate-200 shadow-sm animate-in slide-in-from-top-4">
        <div className="flex gap-2 bg-slate-50 p-1.5 rounded-2xl overflow-x-auto no-scrollbar">
          {['All', 'Pending', 'Approved', 'Rejected'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f as any)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                filter === f 
                  ? 'bg-white text-navy-900 shadow-sm border border-slate-200' 
                  : 'text-slate-500 hover:text-navy-900 hover:bg-slate-200/50'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <div className="relative group min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary-500 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search requested parts..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
            />
          </div>
          <button onClick={() => setModalOpen(true)} className="btn btn-primary shrink-0">
            <Plus className="w-4 h-4 mr-2" />
            Request Part
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="h-64 bg-slate-100 animate-pulse rounded-2xl border border-slate-200" />
          <div className="h-64 bg-slate-100 animate-pulse rounded-2xl border border-slate-200" />
        </div>
      ) : filteredParts.length === 0 ? (
        <div className="bg-white border border-slate-100 shadow-sm rounded-3xl p-16 text-center">
          <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Layers className="w-12 h-12 text-slate-300" />
          </div>
          <h3 className="text-xl font-black text-navy-900 mb-2">No Requests Found</h3>
          <p className="text-slate-500 max-w-sm mx-auto mb-8 font-medium">
            {search || filter !== 'All' 
              ? "We couldn't track down any matching part requests. Try adjusting your filters." 
              : "No one has requested any new parts for this project yet."}
          </p>
          <button onClick={() => setModalOpen(true)} className="btn btn-primary bg-navy-900 hover:bg-black text-white px-8">
            Submit New Request
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pb-12">
          {filteredParts.map(part => (
            <PendingPartCard key={part.id} part={part} projectId={projectId} />
          ))}
        </div>
      )}

      {modalOpen && (
        <PendingPartFormModal 
          isOpen={modalOpen} 
          onClose={() => setModalOpen(false)} 
          projectId={projectId} 
        />
      )}
    </div>
  );
}
