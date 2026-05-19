import React, { useEffect, useRef } from 'react';
import { Package, Box, Layers } from 'lucide-react';

interface PartQuickViewProps {
  part: any;
  anchorRect: DOMRect;
  onClose: () => void;
}

export default function PartQuickView({ part, anchorRect, onClose }: PartQuickViewProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Position the popover relative to the anchor row
  const top = anchorRect.bottom + window.scrollY + 6;
  const left = anchorRect.left + window.scrollX;

  useEffect(() => {
    // Clamp to viewport right edge after render
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    if (rect.right > window.innerWidth - 12) {
      ref.current.style.left = `${window.innerWidth - rect.width - 12}px`;
    }
  }, []);

  return (
    <div
      ref={ref}
      onMouseLeave={onClose}
      style={{ position: 'fixed', top: anchorRect.bottom + 6, left, zIndex: 9999, maxWidth: 340 }}
      className="bg-white border border-gray-100 rounded-2xl shadow-2xl shadow-gray-200/80 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
    >
      {/* Image */}
      <div className="bg-gray-50 flex items-center justify-center" style={{ height: 160 }}>
        {part.image_path ? (
          <img
            src={part.image_path}
            alt={part.part_number}
            className="max-h-full max-w-full object-contain p-3"
          />
        ) : (
          <Package className="w-14 h-14 text-gray-200" />
        )}
      </div>

      {/* Details */}
      <div className="p-4 space-y-3">
        <div>
          <div className="text-xs font-black text-gray-900 font-mono tracking-tight">{part.part_number}</div>
          {part.manufacturer_part_number && (
            <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest mt-0.5">
              MPN: {part.manufacturer_part_number}
            </div>
          )}
          {part.description && (
            <div className="text-xs text-gray-500 mt-1 leading-snug">{part.description}</div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {part.stock_quantity !== undefined && (
            <Chip icon={<Box className="w-3 h-3" />} label="Stock" value={part.stock_quantity} />
          )}
          {part.base_price !== undefined && (
            <Chip icon={<span className="text-[10px]">₹</span>} label="Base Price" value={`₹${Number(part.base_price).toLocaleString('en-IN')}`} />
          )}
          {part.manufacturer && (
            <Chip icon={<Layers className="w-3 h-3" />} label="Make" value={part.manufacturer} />
          )}
          {part.material && (
            <Chip icon={<Layers className="w-3 h-3" />} label="Material" value={part.material} />
          )}
        </div>

        {part.specifications && (
          <div className="text-[10px] text-gray-400 border-t border-gray-50 pt-2 leading-relaxed line-clamp-3">
            {part.specifications}
          </div>
        )}

        <div className="text-[9px] font-black text-gray-300 uppercase tracking-widest border-t border-gray-50 pt-2">
          Click part number to open full details
        </div>
      </div>
    </div>
  );
}

function Chip({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2">
      <div className="flex items-center gap-1 text-gray-400 mb-0.5">
        {icon}
        <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
      </div>
      <div className="text-xs font-black text-gray-700 truncate">{String(value)}</div>
    </div>
  );
}
