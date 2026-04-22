import React, { useState, useMemo } from 'react'
import { ShoppingCart, X, Trash2, Package, Info, DollarSign, Calculator, ChevronRight, AlertCircle, ShoppingBag } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useDroppable } from '@dnd-kit/core'

interface POBasketItem {
  id: number
  project_part_id: number
  part_number: string
  description: string
  quantity: number
  unit_price: number
  discount_percent: number
  part_type: string
  part_id: number
  po_info?: any
}

interface POBasketProps {
  isOpen: boolean
  onClose: () => void
  items: POBasketItem[]
  onRemoveItem: (id: number) => void
  onUpdateItem: (id: number, updates: Partial<POBasketItem>) => void
  onClearBasket: () => void
  onReleasePO: () => void
  projectCurrency?: string
}

const POBasket = ({
  isOpen,
  onClose,
  items,
  onRemoveItem,
  onUpdateItem,
  onClearBasket,
  onReleasePO,
  projectCurrency = 'INR'
}: POBasketProps) => {
  const [isExpanded, setIsExpanded] = useState(true)
  const { setNodeRef, isOver } = useDroppable({
    id: 'po-basket-drop-zone',
  })

  const totalValue = useMemo(() => {
    return items.reduce((acc, item) => {
      const netPrice = item.unit_price * (1 - (item.discount_percent / 100))
      return acc + (item.quantity * netPrice)
    }, 0)
  }, [items])

  if (!isOpen) return null

  return (
    <div 
      ref={setNodeRef}
      className={`fixed inset-y-0 right-0 w-[450px] bg-white shadow-2xl z-[40] transform transition-all duration-500 ease-out border-l flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'} ${isOver ? 'border-amber-500 border-l-8 ring-4 ring-amber-500/20' : 'border-slate-100'}`}
    >
      {/* Drop overlay indicator */}
      {isOver && (
        <div className="absolute inset-0 bg-amber-500/5 z-50 pointer-events-none flex items-center justify-center">
          <div className="px-6 py-4 bg-amber-500 text-white rounded-3xl shadow-2xl font-black text-sm uppercase tracking-widest animate-bounce">
            Drop to Add to Basket
          </div>
        </div>
      )}
      {/* Header */}
      <div className="p-6 bg-navy-900 text-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary-500 p-2 rounded-xl shadow-lg shadow-primary-500/20">
            <ShoppingBag className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-black italic tracking-tight">PO Basket</h2>
            <p className="text-[10px] font-bold text-navy-400 uppercase tracking-widest">{items.length} Items Selected</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
          <X className="w-5 h-5 text-navy-300" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-20">
            <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-6">
              <ShoppingCart className="w-10 h-10 text-slate-300" />
            </div>
            <p className="font-black text-slate-400 uppercase tracking-widest text-xs">Basket is empty</p>
            <p className="text-[10px] text-slate-400 mt-2 max-w-[200px]">Drag parts here or use checkboxes to start procurement</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={item.id} className="group relative bg-white border border-slate-100 rounded-3xl p-5 hover:border-navy-400 hover:shadow-xl hover:shadow-navy-900/5 transition-all animate-in slide-in-from-right-4 duration-300" style={{ animationDelay: `${idx * 50}ms` }}>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-black text-slate-300 tabular-nums">#{idx + 1}</span>
                      <span className="text-xs font-black text-navy-900 tracking-tight truncate">{item.part_number}</span>
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                  <button 
                    onClick={() => onRemoveItem(item.id)}
                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Qty</label>
                    <input 
                      type="number"
                      value={item.quantity}
                      onChange={(e) => onUpdateItem(item.id, { quantity: parseFloat(e.target.value) || 1 })}
                      className="w-full bg-slate-50 border border-transparent focus:border-navy-400 focus:bg-white rounded-xl px-3 py-2 text-xs font-black text-navy-900 outline-none transition-all tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Price ({projectCurrency})</label>
                    <input 
                      type="number"
                      value={item.unit_price}
                      onChange={(e) => onUpdateItem(item.id, { unit_price: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-50 border border-transparent focus:border-navy-400 focus:bg-white rounded-xl px-3 py-2 text-xs font-black text-navy-900 outline-none transition-all tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Disc %</label>
                    <input 
                      type="number"
                      value={item.discount_percent}
                      onChange={(e) => onUpdateItem(item.id, { discount_percent: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-50 border border-transparent focus:border-navy-400 focus:bg-white rounded-xl px-3 py-2 text-xs font-black text-navy-900 outline-none transition-all tabular-nums text-emerald-600"
                    />
                  </div>
                </div>

                {item.po_info && (
                  <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-xl border border-amber-100 font-bold text-[9px] text-amber-700 uppercase tracking-widest">
                    <AlertCircle className="w-3 h-3" />
                    Already linked to PO #{item.po_info.po_number}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) }
      </div>

      {/* Footer */}
      {items.length > 0 && (
        <div className="p-8 bg-slate-50 border-t border-slate-100 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Estimated Value</p>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-navy-900 italic">{projectCurrency}</span>
                <span className="text-3xl font-black text-navy-900 tabular-nums">
                  {totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <button 
              onClick={onClearBasket}
              className="p-3 text-slate-400 hover:text-red-500 transition-colors"
              title="Clear all items"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>

          <div className="flex gap-4">
            <button
              onClick={onReleasePO}
              className="flex-1 bg-navy-900 hover:bg-navy-800 text-white h-16 rounded-[1.5rem] flex items-center justify-center gap-3 font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-navy-900/10 transition-all active:scale-95 group"
            >
              <ShoppingCart className="w-5 h-5 group-hover:animate-bounce" />
              Process PO Release
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default POBasket
