import React, { useMemo } from 'react'
import { 
  ShoppingCart, 
  X, 
  Trash2, 
  Package, 
  ChevronRight, 
  ShoppingBag, 
  ArrowRight,
  Info
} from 'lucide-react'
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
  projectCurrency = '₹'
}: POBasketProps) => {
  const { setNodeRef, isOver } = useDroppable({
    id: 'po-basket',
  })

  const totalValue = useMemo(() => {
    return items.reduce((acc, item) => {
      const netPrice = item.unit_price * (1 - (item.discount_percent / 100))
      return acc + (item.quantity * netPrice)
    }, 0)
  }, [items])

  // Sharp corners (0-2px)
  const sharpRadius = 'rounded-[2px]'

  return (
    <>
      {/* Backdrop for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-[35] sm:hidden"
          onClick={onClose}
        />
      )}

      {/* Main Sidebar */}
      <div 
        ref={setNodeRef}
        className={`fixed inset-y-0 right-0 z-40 flex flex-col bg-slate-50 border-l border-slate-200 transition-all duration-300 ease-in-out shadow-2xl
          ${isOpen ? 'translate-x-0 w-full sm:w-[400px]' : 'translate-x-[calc(100%-4px)] w-2'}
          ${isOver ? 'ring-4 ring-primary-500 bg-primary-50/50' : ''}
        `}
        id="po-basket"
      >
        {/* Toggle Button (Chevron) */}
        {!isOpen && (
          <button 
            onClick={onClose}
            className="absolute -left-10 top-1/2 -translate-y-1/2 bg-primary-600 text-white p-2 rounded-l-xl shadow-lg hover:bg-primary-700 transition-colors group flex items-center justify-center min-w-[40px] min-h-[50px] z-50 pointer-events-auto"
          >
            <div className="flex flex-col items-center">
              <ChevronRight className="w-5 h-5" />
              {items.length > 0 && (
                <span className="text-[10px] font-black">{items.length}</span>
              )}
            </div>
          </button>
        )}

        {/* Drop Zone Feedback Overlay */}
        {isOver && (
          <div className="absolute inset-0 z-50 bg-primary-600/90 border-4 border-dashed border-white m-2 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-200 backdrop-blur-sm">
            <div className="bg-white p-6 rounded-full shadow-2xl mb-6 animate-bounce">
              <ShoppingBag className="w-12 h-12 text-primary-600" />
            </div>
            <h3 className="text-2xl font-black text-white uppercase tracking-tighter drop-shadow-md">Drop here to add to PO</h3>
            <p className="text-white/80 text-xs font-bold uppercase tracking-widest mt-2">Releasing BOM to PO</p>
          </div>
        )}
            <p className="text-sm font-bold text-primary-700 mt-2 px-6">Release to add parts to PO Basket</p>
          </div>
        )}

        {/* Header */}
        <div className="shrink-0 p-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`bg-primary-600 p-2 ${sharpRadius} shadow-lg shadow-primary-600/30`}>
              <ShoppingCart className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tighter uppercase italic">PO Basket</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Procurement Management</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className={`p-2 hover:bg-white/10 ${sharpRadius} transition-colors group`}
          >
            <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 custom-scrollbar">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-20 grayscale opacity-60">
              <div className="w-24 h-24 bg-slate-200 rounded-full flex items-center justify-center mb-6 border-4 border-white shadow-inner">
                <ShoppingBag className="w-10 h-10 text-slate-400" />
              </div>
              <h3 className="font-black text-slate-900 uppercase tracking-widest text-xs">Basket is empty</h3>
              <p className="text-[10px] text-slate-500 mt-2 max-w-[200px] font-medium">
                Drag sections, subsections, or individual parts here to start your procurement request.
              </p>
              
              <div className="mt-8 p-4 border border-dashed border-slate-300 rounded-lg text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                <Info className="w-4 h-4 mx-auto mb-2 opacity-50" />
                Drop zone is active
              </div>
            </div>
          ) : (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{items.length} Parts in Queue</span>
                <button 
                  onClick={onClearBasket}
                  className="text-[10px] font-bold text-red-500 uppercase tracking-widest hover:underline"
                >
                  Clear All
                </button>
              </div>

              {items.map((item, idx) => (
                <div 
                  key={item.id} 
                  className={`group relative bg-white border border-slate-200 ${sharpRadius} p-4 hover:border-primary-500 hover:shadow-md transition-all active:scale-[0.98]`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] font-black text-slate-300 uppercase">#{(idx+1).toString().padStart(2, '0')}</span>
                        <span className="text-xs font-black text-slate-900 truncate tracking-tight">{item.part_number}</span>
                      </div>
                      <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest truncate leading-none">
                        {item.description}
                      </p>
                    </div>
                    <button 
                      onClick={() => onRemoveItem(item.id)}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-tighter block mb-1">Quantity</label>
                      <input 
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => onUpdateItem(item.id, { quantity: parseFloat(e.target.value) || 1 })}
                        className={`w-full bg-slate-50 border border-slate-200 focus:border-primary-500 focus:bg-white ${sharpRadius} px-2 py-1.5 text-[11px] font-black text-slate-900 outline-none transition-all tabular-nums`}
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-tighter block mb-1">Unit Price ({projectCurrency})</label>
                      <input 
                        type="number"
                        value={item.unit_price}
                        onChange={(e) => onUpdateItem(item.id, { unit_price: parseFloat(e.target.value) || 0 })}
                        className={`w-full bg-slate-50 border border-slate-200 focus:border-primary-500 focus:bg-white ${sharpRadius} px-2 py-1.5 text-[11px] font-black text-slate-900 outline-none transition-all tabular-nums`}
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-tighter block mb-1">Discount %</label>
                      <input 
                        type="number"
                        value={item.discount_percent}
                        onChange={(e) => onUpdateItem(item.id, { discount_percent: parseFloat(e.target.value) || 0 })}
                        className={`w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white ${sharpRadius} px-2 py-1.5 text-[11px] font-black text-emerald-600 outline-none transition-all tabular-nums`}
                      />
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between">
                    <span className="text-[8px] font-bold text-slate-400 uppercase">Subtotal</span>
                    <span className="text-[11px] font-black text-slate-900 tabular-nums">
                      {projectCurrency}{(item.quantity * item.unit_price * (1 - item.discount_percent/100)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  {item.po_info && (
                    <div className="mt-3 flex items-center gap-2 px-2 py-1 bg-amber-50 rounded-md border border-amber-100 font-bold text-[8px] text-amber-700 uppercase tracking-widest animate-pulse">
                      Already in PO #{item.po_info.po_number}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Summary */}
        {items.length > 0 && (
          <div className="shrink-0 p-6 bg-white border-t border-slate-200 space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Basket Value</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-sm font-black text-slate-400 italic">{projectCurrency}</span>
                  <span className="text-2xl font-black text-slate-900 tabular-nums">
                    {totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{items.length} Items</p>
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Ready for PO</p>
              </div>
            </div>

            <button
              onClick={onReleasePO}
              className={`w-full bg-primary-600 hover:bg-primary-700 text-white h-14 ${sharpRadius} flex items-center justify-center gap-3 font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-primary-600/20 transition-all active:scale-95 group overflow-hidden relative`}
            >
              <div className="absolute inset-y-0 left-0 w-0 bg-white/20 group-hover:w-full transition-all duration-500 ease-out pointer-events-none" />
              <ShoppingBag className="w-4 h-4 group-hover:scale-110 transition-transform" />
              RELEASE TO PO
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
            <p className="text-[9px] text-center text-slate-400 font-bold uppercase tracking-widest">
              This will create line items for a new Purchase Order
            </p>
          </div>
        )}
      </div>
    </>
  )
}

export default POBasket
