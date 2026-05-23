import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Package, Search, X, Plus } from 'lucide-react'
import { partsApi, type PartCategory } from '@/api/parts'
import type { BOMBasketItem } from '@/store/useBOMBasketStore'
import { makeMasterBasketId } from '@/store/useBOMBasketStore'

interface BOMBasketPartPickerModalProps {
  isOpen: boolean
  onClose: () => void
  onAddItem: (item: BOMBasketItem) => void
  projectId: number
}

const CATEGORIES: { id: PartCategory; label: string }[] = [
  { id: 'mechanical_manufacture', label: 'Mech Manufacture' },
  { id: 'mechanical_bought_out', label: 'Mech Bought-Out' },
  { id: 'electrical_manufacture', label: 'Elec Manufacture' },
  { id: 'electrical_bought_out', label: 'Elec Bought-Out' },
  { id: 'pneumatic_bought_out', label: 'Pneumatic' },
]

const DraggablePartCard = ({
  part,
  category,
  projectId,
  onAdd,
}: {
  part: any
  category: PartCategory
  projectId: number
  onAdd: (item: BOMBasketItem) => void
}) => {
  const basketItem: BOMBasketItem = {
    basket_id: makeMasterBasketId(category, part.id),
    project_id: projectId,
    source_type: 'master_part',
    source_project_part_id: null,
    part_type: category,
    part_id: part.id,
    part_number: part.part_number || part.manufacturer_part_number || `PART-${part.id}`,
    description: part.description || 'No description',
    manufacturer_part_number: part.manufacturer_part_number || null,
    image_path: part.image_path || null,
    quantity: 1,
    unit_price: part.base_price || 0,
    discount_percent: part.discount_percent || 0,
    currency: part.currency || 'INR',
    usage_comment: '',
    reference_designator: null,
    notes: null,
    is_temporary: false,
  }

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `master-${category}-${part.id}`,
    data: {
      type: 'master_part',
      data: basketItem,
    },
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.7 : 1,
      }}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-primary-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-primary-600">
            {category.replaceAll('_', ' ')}
          </div>
          <div className="mt-1 text-sm font-black text-slate-900">{basketItem.part_number}</div>
          <div className="mt-1 line-clamp-2 text-xs text-slate-500">{basketItem.description}</div>
        </div>
        <div className="rounded-xl bg-slate-100 p-2 text-slate-500">
          <Package className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
        {basketItem.manufacturer_part_number && (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-medium text-slate-600">
            MPN {basketItem.manufacturer_part_number}
          </span>
        )}
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 font-medium text-emerald-700">
          {basketItem.currency} {basketItem.unit_price.toLocaleString()}
        </span>
        <span className="rounded-full border border-slate-200 bg-white px-2 py-1 font-medium text-slate-600">
          Stock {part.stock_quantity || 0}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex-1 rounded-xl border border-dashed border-primary-300 bg-primary-50 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-primary-700 transition hover:bg-primary-100"
        >
          Drag to Basket
        </button>
        <button
          type="button"
          onClick={() => onAdd(basketItem)}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:bg-slate-800"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>
    </div>
  )
}

const BOMBasketPartPickerModal = ({
  isOpen,
  onClose,
  onAddItem,
  projectId,
}: BOMBasketPartPickerModalProps) => {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<PartCategory | 'all'>('all')

  const { data, isLoading } = useQuery({
    queryKey: ['bom-basket-master-parts'],
    queryFn: async () => {
      const results = await Promise.all(
        CATEGORIES.map(async ({ id }) => ({
          category: id,
          parts: await partsApi.getParts(id),
        })),
      )
      return results
    },
    enabled: isOpen,
  })

  useEffect(() => {
    if (!isOpen) {
      setSearch('')
      setActiveCategory('all')
    }
  }, [isOpen])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (data || [])
      .filter((group) => activeCategory === 'all' || group.category === activeCategory)
      .map((group) => ({
        ...group,
        parts: (group.parts || []).filter((part: any) => {
          if (!query) return true
          return [part.part_number, part.manufacturer_part_number, part.description]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(query))
        }),
      }))
      .filter((group) => group.parts.length > 0)
  }, [activeCategory, data, search])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-6xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_40px_100px_rgba(15,23,42,0.25)]">
        <div className="flex items-start justify-between border-b border-slate-200 bg-slate-50 px-6 py-5">
          <div>
            <h3 className="text-xl font-black tracking-tight text-slate-900">Add From Part Master</h3>
            <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
              Search the catalogue, then drag or add parts into the BOM basket
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-white hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-slate-200 px-6 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative block flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search part no, MPN, description..."
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 outline-none transition focus:border-primary-400 focus:ring-4 focus:ring-primary-100"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveCategory('all')}
                className={`rounded-full px-3 py-2 text-xs font-black uppercase tracking-[0.16em] transition ${
                  activeCategory === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                All
              </button>
              {CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setActiveCategory(category.id)}
                  className={`rounded-full px-3 py-2 text-xs font-black uppercase tracking-[0.16em] transition ${
                    activeCategory === category.id
                      ? 'bg-primary-600 text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-6">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-44 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-8 py-16 text-center">
              <Package className="mx-auto h-10 w-10 text-slate-300" />
              <div className="mt-4 text-sm font-black uppercase tracking-[0.18em] text-slate-900">
                No matching parts
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Try a broader search or switch to a different category.
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {filtered.map((group) => (
                <section key={group.category}>
                  <div className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                    {group.category.replaceAll('_', ' ')} ({group.parts.length})
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {group.parts.map((part: any) => (
                      <DraggablePartCard
                        key={`${group.category}-${part.id}`}
                        part={part}
                        category={group.category}
                        projectId={projectId}
                        onAdd={onAddItem}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default BOMBasketPartPickerModal
