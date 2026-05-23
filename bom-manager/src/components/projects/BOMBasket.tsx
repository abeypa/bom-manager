import { useMemo, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Package,
  Plus,
  ShoppingBag,
  Tag,
  Trash2,
  Wrench,
  X,
} from 'lucide-react'
import BOMBasketPartPickerModal from '@/components/projects/BOMBasketPartPickerModal'
import {
  type BOMBasketItem,
  useBOMBasketStore,
  useCurrentBOMBasketItems,
} from '@/store/useBOMBasketStore'

interface BOMBasketProps {
  projectId: number | null
  projectCurrency?: string
}

const defaultTemporaryDraft = {
  part_number: '',
  description: '',
  quantity: 1,
  unit_price: 0,
  discount_percent: 0,
  currency: 'INR',
  usage_comment: '',
  reference_designator: '',
  manufacturer_part_number: '',
  notes: '',
}

const sourceBadgeClass: Record<BOMBasketItem['source_type'], string> = {
  project_part: 'border-primary-200 bg-primary-50 text-primary-700',
  master_part: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  temporary: 'border-amber-200 bg-amber-50 text-amber-700',
}

const sourceLabel: Record<BOMBasketItem['source_type'], string> = {
  project_part: 'From project BOM',
  master_part: 'From part master',
  temporary: 'Temporary item',
}

const BOMBasket = ({ projectId, projectCurrency = 'INR' }: BOMBasketProps) => {
  const items = useCurrentBOMBasketItems()
  const basketOpen = useBOMBasketStore((state) => state.basketOpen)
  const setBasketOpen = useBOMBasketStore((state) => state.setBasketOpen)
  const addItems = useBOMBasketStore((state) => state.addItems)
  const addTemporaryItem = useBOMBasketStore((state) => state.addTemporaryItem)
  const updateItem = useBOMBasketStore((state) => state.updateItem)
  const removeItem = useBOMBasketStore((state) => state.removeItem)
  const clearProjectBasket = useBOMBasketStore((state) => state.clearProjectBasket)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [showTemporaryForm, setShowTemporaryForm] = useState(false)
  const [tempDraft, setTempDraft] = useState(defaultTemporaryDraft)
  const [nativeDragOver, setNativeDragOver] = useState(false)

  const { setNodeRef, isOver } = useDroppable({
    id: 'bom-basket',
  })

  const isDropActive = isOver || nativeDragOver

  const totalValue = useMemo(
    () =>
      items.reduce((sum, item) => {
        const effectivePrice = item.unit_price * (1 - item.discount_percent / 100)
        return sum + item.quantity * effectivePrice
      }, 0),
    [items],
  )

  const summary = useMemo(
    () => ({
      projectItems: items.filter((item) => item.source_type === 'project_part').length,
      masterItems: items.filter((item) => item.source_type === 'master_part').length,
      temporaryItems: items.filter((item) => item.source_type === 'temporary').length,
    }),
    [items],
  )

  const handleAddTemporary = () => {
    if (!projectId) return
    if (!tempDraft.part_number.trim() || !tempDraft.description.trim()) return

    addTemporaryItem(projectId, {
      part_type: null,
      part_id: null,
      source_project_part_id: null,
      part_number: tempDraft.part_number.trim(),
      description: tempDraft.description.trim(),
      manufacturer_part_number: tempDraft.manufacturer_part_number.trim() || null,
      quantity: Math.max(1, tempDraft.quantity || 1),
      unit_price: Math.max(0, tempDraft.unit_price || 0),
      discount_percent: Math.max(0, tempDraft.discount_percent || 0),
      currency: tempDraft.currency || projectCurrency,
      usage_comment: tempDraft.usage_comment.trim(),
      reference_designator: tempDraft.reference_designator.trim() || null,
      notes: tempDraft.notes.trim() || null,
    })

    setTempDraft(defaultTemporaryDraft)
    setShowTemporaryForm(false)
    setBasketOpen(true)
  }

  return (
    <>
      <div
        ref={setNodeRef}
        id="bom-basket"
        onDragOver={(event) => {
          const hasMasterPayload = Array.from(event.dataTransfer?.types || []).includes('application/x-bom-master-part')
          if (!hasMasterPayload) return
          event.preventDefault()
          setNativeDragOver(true)
        }}
        onDragLeave={() => setNativeDragOver(false)}
        onDrop={(event) => {
          const payload = event.dataTransfer?.getData('application/x-bom-master-part')
          setNativeDragOver(false)
          if (!payload || !projectId) return

          event.preventDefault()

          try {
            const item = JSON.parse(payload) as BOMBasketItem
            addItems(projectId, [{ ...item, project_id: projectId }])
            setBasketOpen(true)
          } catch (error) {
            console.error('Failed to parse dropped BOM basket item', error)
          }
        }}
        className={`fixed inset-y-0 right-0 z-[120] flex flex-col border-l border-slate-800 bg-slate-950 text-white shadow-[-24px_0_80px_rgba(15,23,42,0.45)] transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]
          ${basketOpen ? 'translate-x-0 w-full sm:w-[430px]' : 'translate-x-[calc(100%-12px)] w-3'}
          ${isDropActive ? 'ring-4 ring-emerald-400 ring-inset' : ''}
        `}
      >
        {!basketOpen && (
          <button
            type="button"
            onClick={() => setBasketOpen(true)}
            className="absolute -left-14 top-1/2 flex -translate-y-1/2 flex-col items-center gap-4 rounded-l-2xl border border-slate-700 bg-slate-950 p-3 text-white shadow-[-12px_0_24px_rgba(15,23,42,0.3)] transition hover:bg-emerald-600"
          >
            <ChevronLeft className="h-5 w-5" />
            <div className="relative">
              <ClipboardList className="h-5 w-5" />
              {items.length > 0 && (
                <span className="absolute -right-3 -top-3 flex h-5 w-5 items-center justify-center rounded-full border-2 border-slate-950 bg-red-500 text-[10px] font-black text-white">
                  {items.length}
                </span>
              )}
            </div>
          </button>
        )}

        <div className="border-b border-slate-800 bg-slate-900/90 px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-2.5">
                <ShoppingBag className="h-5 w-5 text-emerald-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[13px] font-black uppercase tracking-[0.18em] text-white">BOM Basket</h2>
                  {items.length > 0 && (
                    <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-black text-white">
                      {items.length}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Draft BOM planning, comments, and cost estimate
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setBasketOpen(false)}
              className="rounded-xl p-2 text-slate-400 transition hover:bg-white/5 hover:text-white"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 px-3 py-3 text-center">
              <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Project</div>
              <div className="mt-1 text-lg font-black text-white">{summary.projectItems}</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900 px-3 py-3 text-center">
              <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Master</div>
              <div className="mt-1 text-lg font-black text-white">{summary.masterItems}</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900 px-3 py-3 text-center">
              <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Temp</div>
              <div className="mt-1 text-lg font-black text-white">{summary.temporaryItems}</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!projectId}
              onClick={() => setPickerOpen(true)}
              className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] transition ${
                projectId
                  ? 'bg-emerald-500 text-white hover:bg-emerald-400'
                  : 'cursor-not-allowed bg-slate-800 text-slate-500'
              }`}
            >
              <Package className="h-3.5 w-3.5" />
              Add From Master
            </button>
            <button
              type="button"
              disabled={!projectId}
              onClick={() => setShowTemporaryForm((value) => !value)}
              className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] transition ${
                projectId
                  ? 'border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500'
                  : 'cursor-not-allowed border-slate-800 bg-slate-900 text-slate-500'
              }`}
            >
              <Wrench className="h-3.5 w-3.5" />
              Temporary Item
            </button>
          </div>

          {!projectId && (
            <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-xs font-medium text-amber-100">
              Open a project first to set the target for this BOM basket. Then come back here and drag parts in from Part Master.
            </div>
          )}

          {showTemporaryForm && (
            <div className="mt-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-amber-300">
                Add temporary draft item
              </div>
              <div className="grid gap-3">
                <input
                  type="text"
                  value={tempDraft.part_number}
                  onChange={(e) => setTempDraft((draft) => ({ ...draft, part_number: e.target.value }))}
                  placeholder="Temporary code / part number"
                  className="h-11 rounded-2xl border border-slate-700 bg-slate-950 px-4 text-sm text-white outline-none transition focus:border-amber-300"
                />
                <textarea
                  value={tempDraft.description}
                  onChange={(e) => setTempDraft((draft) => ({ ...draft, description: e.target.value }))}
                  placeholder="Description"
                  rows={2}
                  className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-300"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    min="1"
                    value={tempDraft.quantity}
                    onChange={(e) => setTempDraft((draft) => ({ ...draft, quantity: Number(e.target.value) || 1 }))}
                    placeholder="Qty"
                    className="h-11 rounded-2xl border border-slate-700 bg-slate-950 px-4 text-sm text-white outline-none transition focus:border-amber-300"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={tempDraft.unit_price}
                    onChange={(e) => setTempDraft((draft) => ({ ...draft, unit_price: Number(e.target.value) || 0 }))}
                    placeholder="Unit price"
                    className="h-11 rounded-2xl border border-slate-700 bg-slate-950 px-4 text-sm text-white outline-none transition focus:border-amber-300"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={tempDraft.currency}
                    onChange={(e) => setTempDraft((draft) => ({ ...draft, currency: e.target.value.toUpperCase() }))}
                    placeholder="Currency"
                    className="h-11 rounded-2xl border border-slate-700 bg-slate-950 px-4 text-sm text-white outline-none transition focus:border-amber-300"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={tempDraft.discount_percent}
                    onChange={(e) =>
                      setTempDraft((draft) => ({ ...draft, discount_percent: Number(e.target.value) || 0 }))
                    }
                    placeholder="Discount %"
                    className="h-11 rounded-2xl border border-slate-700 bg-slate-950 px-4 text-sm text-white outline-none transition focus:border-amber-300"
                  />
                </div>
                <input
                  type="text"
                  value={tempDraft.usage_comment}
                  onChange={(e) => setTempDraft((draft) => ({ ...draft, usage_comment: e.target.value }))}
                  placeholder="Where will it be used?"
                  className="h-11 rounded-2xl border border-slate-700 bg-slate-950 px-4 text-sm text-white outline-none transition focus:border-amber-300"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleAddTemporary}
                    className="flex-1 rounded-2xl bg-amber-400 px-3 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-950 transition hover:bg-amber-300"
                  >
                    Add Temporary Item
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowTemporaryForm(false)
                      setTempDraft(defaultTemporaryDraft)
                    }}
                    className="rounded-2xl border border-slate-700 px-3 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-300 transition hover:border-slate-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {isDropActive && (
          <div className="mx-4 mt-4 rounded-3xl border-2 border-dashed border-emerald-300 bg-emerald-500/10 px-4 py-6 text-center">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">
              Drop here to add into BOM basket
            </div>
            <div className="mt-2 text-sm text-emerald-100">
              Use this draft area to collect parts, add usage comments, and estimate cost.
            </div>
          </div>
        )}

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center rounded-3xl border border-dashed border-slate-800 bg-slate-900/40 px-8 text-center">
              <ClipboardList className="h-10 w-10 text-slate-600" />
              <div className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-white">
                Draft basket is empty
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Drag a part from the project tree or add parts from Part Master.
              </p>
            </div>
          ) : (
            items.map((item, index) => {
              const effectivePrice = item.unit_price * (1 - item.discount_percent / 100)
              const lineTotal = item.quantity * effectivePrice

              return (
                <div
                  key={item.basket_id}
                  className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg shadow-black/10"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">
                          #{String(index + 1).padStart(2, '0')}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${sourceBadgeClass[item.source_type]}`}
                        >
                          {sourceLabel[item.source_type]}
                        </span>
                        {item.is_temporary && (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-700">
                            Temp
                          </span>
                        )}
                      </div>
                      <div className="mt-2 text-sm font-black text-white">{item.part_number}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.description}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => projectId && removeItem(projectId, item.basket_id)}
                      className="rounded-xl p-2 text-slate-500 transition hover:bg-red-500/10 hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                        Quantity
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                      onChange={(e) =>
                        projectId &&
                        updateItem(projectId, item.basket_id, {
                          quantity: Math.max(1, Number(e.target.value) || 1),
                        })
                        }
                        className="h-11 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 text-sm font-bold text-white outline-none transition focus:border-primary-400"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                        Unit Price
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unit_price}
                      onChange={(e) =>
                        projectId &&
                        updateItem(projectId, item.basket_id, {
                          unit_price: Math.max(0, Number(e.target.value) || 0),
                        })
                        }
                        className="h-11 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 text-sm font-bold text-white outline-none transition focus:border-primary-400"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                        Currency
                      </label>
                      <input
                        type="text"
                        value={item.currency}
                      onChange={(e) =>
                        projectId &&
                        updateItem(projectId, item.basket_id, {
                          currency: e.target.value.toUpperCase(),
                        })
                        }
                        className="h-11 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 text-sm font-bold text-white outline-none transition focus:border-primary-400"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                        Discount %
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={item.discount_percent}
                      onChange={(e) =>
                        projectId &&
                        updateItem(projectId, item.basket_id, {
                          discount_percent: Math.max(0, Number(e.target.value) || 0),
                        })
                        }
                        className="h-11 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 text-sm font-bold text-white outline-none transition focus:border-primary-400"
                      />
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                      Where to be used
                    </label>
                    <input
                      type="text"
                      value={item.usage_comment}
                      onChange={(e) =>
                        projectId &&
                        updateItem(projectId, item.basket_id, {
                          usage_comment: e.target.value,
                        })
                      }
                      placeholder="Example: Conveyor guard LH side"
                      className="h-11 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 text-sm text-white outline-none transition focus:border-primary-400"
                    />
                  </div>

                  <div className="mt-3">
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                      Notes
                    </label>
                    <textarea
                      rows={2}
                      value={item.notes || ''}
                      onChange={(e) =>
                        projectId &&
                        updateItem(projectId, item.basket_id, {
                          notes: e.target.value,
                        })
                      }
                      placeholder="Optional detail, vendor option, scope note..."
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-primary-400"
                    />
                  </div>

                  <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                      <Tag className="h-3.5 w-3.5" />
                      Estimated line total
                    </div>
                    <div className="text-sm font-black text-white">
                      {item.currency} {lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="border-t border-slate-800 bg-slate-900 px-5 py-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Estimated project cost</div>
              <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">
                Draft basket total across {items.length} line{items.length === 1 ? '' : 's'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-black tracking-tight text-white">
                {projectCurrency} {totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={!projectId}
            onClick={() => projectId && clearProjectBasket(projectId)}
            className="mt-4 w-full rounded-2xl border border-slate-700 px-3 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-300 transition hover:border-red-300 hover:text-red-300"
          >
            Clear BOM Basket
          </button>
        </div>
      </div>

      <BOMBasketPartPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        projectId={projectId || 0}
        onAddItem={(item) => {
          if (!projectId) return
          addItems(projectId, [item])
          setBasketOpen(true)
        }}
      />
    </>
  )
}

export default BOMBasket
