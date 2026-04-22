import React, { useMemo } from 'react'
import { 
  ShoppingCart, 
  X, 
  Trash2, 
  Package, 
  ChevronRight, 
  ShoppingBag, 
  ArrowRight,
  Info,
  ChevronLeft
} from 'lucide-react'
import { useDroppable } from '@dnd-kit/core'
import { usePOBasketStore } from '@/store/usePOBasketStore'

interface POBasketProps {
  projectCurrency?: string
}

const POBasket = ({
  projectCurrency = '₹'
}: POBasketProps) => {
  const { 
    basketItems: items, 
    basketOpen: isOpen, 
    setBasketOpen,
    removeFromBasket,
    updateItem,
    clearBasket,
    setPoModalOpen
  } = usePOBasketStore()

  const { setNodeRef, isOver } = useDroppable({
    id: 'po-basket',
  })

  const totalValue = useMemo(() => {
    return items.reduce((acc, item) => {
      const netPrice = item.unit_price * (1 - (item.discount_percent / 100))
      return acc + (item.quantity * netPrice)
    }, 0)
  }, [items])

  return (
    <>
      {/* Main Sidebar Container */}
      <div 
        ref={setNodeRef}
        className={`fixed inset-y-0 right-0 z-[100] flex flex-col bg-slate-900 border-l border-slate-800 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] shadow-[-20px_0_50px_rgba(0,0,0,0.5)]
          ${isOpen ? 'translate-x-0 w-full sm:w-[320px]' : 'translate-x-[calc(100%-12px)] w-3'}
          ${isOver ? 'ring-4 ring-primary-500 ring-inset' : ''}
        `}
        id="po-basket"
      >
        {/* Persistent Side Handle (Visible when closed) */}
        {!isOpen && (
          <button 
            onClick={() => setBasketOpen(true)}
            className="absolute -left-12 top-1/2 -translate-y-1/2 bg-slate-900 text-white p-3 rounded-l-2xl shadow-[-10px_0_20px_rgba(0,0,0,0.3)] border border-slate-700 flex flex-col items-center gap-4 hover:bg-primary-600 transition-all group pointer-events-auto"
          >
            <ChevronLeft className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <div className="relative">
              <ShoppingBag className="w-5 h-5 text-primary-400 group-hover:text-white" />
              {items.length > 0 && (
                <span className="absolute -top-3 -right-3 bg-red-600 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-slate-900 shadow-md">
                  {items.length}
                </span>
              )}
            </div>
          </button>
        )}

        {/* Header */}
        <div className="shrink-0 p-5 bg-slate-800/50 border-b border-slate-700/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary-600/20 p-2.5 rounded-xl border border-primary-500/30">
              <ShoppingCart className="w-5 h-5 text-primary-400 shadow-lg shadow-primary-500/20" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[13px] font-black text-white uppercase tracking-[0.1em]">PO Basket</h2>
                {items.length > 0 && (
                  <span className="bg-primary-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg shadow-primary-600/30">
                    {items.length}
                  </span>
                )}
              </div>
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5 leading-none">Procurement Queue</p>
            </div>
          </div>
          <button 
            onClick={() => setBasketOpen(false)}
            className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-all hover:rotate-90 group"
          >
            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* Drag-Over Feedback Overlay */}
        {isOver && (
          <div className="absolute inset-0 z-[110] bg-primary-600/95 border-4 border-dashed border-white/40 m-2 rounded-xl flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-300 backdrop-blur-md shadow-2xl">
            <div className="bg-white p-8 rounded-full shadow-2xl mb-8 animate-bounce ring-8 ring-white/10">
              <ShoppingBag className="w-16 h-16 text-primary-600" />
            </div>
            <h3 className="text-2xl font-black text-white uppercase tracking-tight drop-shadow-lg px-6 leading-tight">
              DROP HERE TO ADD TO PO BASKET
            </h3>
            <p className="text-white/80 text-[10px] font-black uppercase tracking-[0.2em] mt-6 px-12 leading-relaxed opacity-80">
              Releasing item(s) into procurement queue
            </p>
          </div>
        )}

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 custom-scrollbar bg-slate-900/50">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-10 grayscale opacity-40">
              <div className="w-24 h-24 bg-slate-800 rounded-full flex items-center justify-center mb-8 border-4 border-slate-700/50 shadow-2xl relative">
                <ShoppingBag className="w-10 h-10 text-slate-500" />
                <div className="absolute inset-0 border-2 border-dashed border-slate-600 rounded-full animate-[spin_20s_linear_infinite]" />
              </div>
              <h3 className="font-black text-white uppercase tracking-[0.2em] text-xs">Basket is Empty</h3>
              <p className="text-[10px] text-slate-500 mt-4 font-bold leading-relaxed uppercase tracking-widest">
                Drag parts from the tree to begin building your PO.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div 
                  key={item.id} 
                  className="bg-slate-800/40 border border-slate-700/50 p-4 rounded-2xl hover:border-primary-500/50 hover:bg-slate-800/60 transition-all group relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-1 h-full bg-primary-600/30 group-hover:bg-primary-600 transition-all" />
                  
                  <div className="flex justify-between items-start mb-4">
                    <div className="min-w-0 pr-4">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[9px] font-black text-slate-600 uppercase">#{(idx+1).toString().padStart(2, '0')}</span>
                        <p className="text-[10px] font-black text-primary-400 uppercase tracking-[0.1em] truncate">
                          {item.part_number}
                        </p>
                      </div>
                      <h4 className="text-xs font-bold text-slate-200 line-clamp-2 leading-relaxed">
                        {item.description}
                      </h4>
                    </div>
                    <button 
                      onClick={() => removeFromBasket(item.id)}
                      className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-700/30">
                    <div className="space-y-2">
                       <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Quantity</p>
                       <input 
                        type="number" 
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, { quantity: parseInt(e.target.value) || 1 })}
                        className="w-full bg-slate-950 border border-slate-700 text-white text-xs font-black px-3 py-2.5 rounded-xl focus:ring-2 focus:ring-primary-500/40 outline-none transition-all tabular-nums"
                      />
                    </div>
                    <div className="space-y-2 text-right">
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Subtotal</p>
                      <p className="text-sm font-black text-white tabular-nums tracking-tight">
                        {projectCurrency}{((item.unit_price * (1 - (item.discount_percent / 100))) * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fixed Footer Summary Area */}
        <div className="shrink-0 p-6 bg-slate-800/90 border-t border-slate-700 backdrop-blur-lg">
          <div className="flex items-center justify-between mb-8">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Grand Total</p>
              <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest leading-none italic">
                {items.length} positions selected
              </p>
            </div>
            <div className="text-right">
              <span className="text-3xl font-black text-white tabular-nums tracking-tighter shadow-sm">
                {projectCurrency}{totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button 
              disabled={items.length === 0}
              onClick={() => setPoModalOpen(true)}
              className={`w-full py-4.5 rounded-2xl flex items-center justify-center gap-3 font-black uppercase text-xs tracking-[0.15em] shadow-2xl transition-all active:scale-[0.97]
                ${items.length === 0 
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed opacity-50' 
                  : 'bg-primary-600 hover:bg-primary-500 text-white shadow-primary-600/30'
                }
              `}
            >
              <ArrowRight className="w-4 h-4" />
              Process PO Release
            </button>
            
            <button 
              onClick={clearBasket}
              className="w-full py-3 text-[10px] font-black text-slate-500 uppercase tracking-[0.25em] hover:text-red-400 transition-colors"
            >
              Clear Procurement Queue
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export default POBasket
