import React, { useEffect, useState } from 'react';
import { X, TrendingUp, Calendar } from 'lucide-react';
import { priceHistoryApi } from '../../api/price-history';
import type { Database } from '../../types/database';

type PriceHistoryRow = Database['public']['Tables']['part_price_history']['Row'];

interface PriceHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  partTable: string;
  partId: number;
  partNumber: string;
}

export default function PriceHistoryModal({
  isOpen,
  onClose,
  partTable,
  partId,
  partNumber,
}: PriceHistoryModalProps) {
  const [history, setHistory] = useState<PriceHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    const fetchHistory = async () => {
      setLoading(true);
      try {
        const data = await priceHistoryApi.getHistory(partTable, partId);
        setHistory(data);
      } catch (err) {
        console.error('Failed to load price history:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [isOpen, partTable, partId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between bg-white sticky top-0 z-10">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 leading-none">Price History</h2>
            <p className="text-xs text-gray-500 mt-1.5 font-medium tracking-wide uppercase">
              {partNumber} • {partTable.replace(/_/g, ' ')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-all duration-200 text-gray-400 hover:text-gray-900"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/30">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 space-y-3">
              <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-sm text-gray-400 font-medium tracking-tight">Loading history...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border-2 border-dashed border-gray-100">
              <TrendingUp className="w-12 h-12 text-gray-100 mb-4" />
              <p className="text-gray-400 font-medium">No price changes recorded yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-5 bg-white border border-gray-100 rounded-2xl hover:border-blue-100 hover:shadow-sm transition-all duration-200 group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                      <TrendingUp className={`w-5 h-5 ${entry.old_price && entry.new_price > entry.old_price ? 'text-red-600' : 'text-green-600'}`} />
                    </div>
                    <div>
                      <div className="text-lg font-bold text-gray-900 tabular-nums">
                        {entry.new_currency} {entry.new_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                      {entry.old_price && (
                        <div className="text-xs text-gray-400 font-medium line-through decoration-gray-300">
                          was {entry.old_currency || entry.new_currency} {entry.old_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right flex flex-col justify-center">
                    <div className="text-xs text-gray-600 font-semibold flex items-center gap-1.5 justify-end">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      {new Date(entry.changed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                    <div className="mt-1 flex flex-col items-end gap-0.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600 uppercase tracking-wider">
                        {entry.change_reason || 'Manual Update'}
                      </span>
                      {entry.changed_by && (
                        <span className="text-[10px] text-gray-400 font-medium lowercase italic">by {entry.changed_by}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-white flex justify-between items-center sticky bottom-0">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">
            Audit Trail • {history.length} records
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-900 border border-gray-900 rounded-xl hover:bg-gray-800 text-white text-sm font-bold transition-all duration-200 active:scale-95"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
