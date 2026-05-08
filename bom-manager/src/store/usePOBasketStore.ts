import { create } from 'zustand'

export interface BasketItem {
  id: number
  project_part_id: number
  bomItemId?: number
  part_number: string
  partRef?: string
  description: string
  globalDescription?: string
  manufacturerPartNo?: string
  quantity: number
  unit_price: number
  unitPrice?: number
  discount_percent: number
  snapshotDiscount?: number
  currency?: string
  part_type?: string
  part_id?: number
  po_info?: Record<string, unknown>
  part_ref?: Record<string, unknown> | string
}

export type AddToBasketInput = Partial<BasketItem> & {
  id: number
  quantity?: number
  unit_price?: number
}

interface POBasketStore {
  basketItems: BasketItem[]
  basketOpen: boolean
  poModalOpen: boolean
  projectId: number | null

  // Actions
  setBasketOpen: (open: boolean) => void
  setPoModalOpen: (open: boolean) => void
  addToBasket: (parts: AddToBasketInput[]) => void
  removeFromBasket: (id: number) => void
  updateItem: (id: number, updates: Partial<BasketItem>) => void
  clearBasket: () => void
  setProjectId: (id: number | null) => void
}

export const usePOBasketStore = create<POBasketStore>((set) => ({
  basketItems: [],
  basketOpen: false, // Default to hidden
  poModalOpen: false,
  projectId: null,

  setBasketOpen: (open) => set({ basketOpen: open }),
  setPoModalOpen: (open) => set({ poModalOpen: open }),

  addToBasket: (partsToAdd) => {
    set(state => {
      const next = [...state.basketItems]
      partsToAdd.forEach(p => {
        if (!p) return
        const existing = next.find(item => item.id === p.id)
        if (existing) {
          existing.quantity = (existing.quantity || 1) + (p.quantity || 1)
        } else {
          const ref = p.part_ref as any
          const refPartNo = typeof ref === 'string' ? ref : ref?.part_number
          const refDesc = typeof ref === 'object' ? ref?.description : undefined
          const refMfg = typeof ref === 'object' ? ref?.manufacturer_part_number : undefined
          next.push({
            ...p,
            id: p.id,
            project_part_id: p.id,
            bomItemId: p.id,
            part_number: p.part_number || refPartNo || 'N/A',
            partRef: p.partRef || refPartNo || 'N/A',
            description: p.description || refDesc || 'N/A',
            globalDescription: p.globalDescription || p.description || refDesc || 'N/A',
            manufacturerPartNo: p.manufacturerPartNo || refMfg || '',
            quantity: p.quantity || 1,
            unit_price: p.unit_price || 0,
            unitPrice: p.unit_price || 0,
            discount_percent: p.discount_percent || 0,
            snapshotDiscount: p.snapshotDiscount || p.discount_percent || 0,
            currency: p.currency || 'INR',
          } as BasketItem)
        }
      })
      // Keep basket status as is (do not auto-open)
      return { basketItems: next }
    })
  },

  removeFromBasket: (id) => set(state => ({
    basketItems: state.basketItems.filter(item => item.id !== id)
  })),

  updateItem: (id, updates) => set(state => ({
    basketItems: state.basketItems.map(item => item.id === id ? { ...item, ...updates } : item)
  })),

  clearBasket: () => set({ basketItems: [] }),
  
  setProjectId: (id) => {
    // If project ID changes, we could choose to clear the basket or keep it
    // The requirement says "persist even when navigating away from the Projects section entirely"
    // and "only be cleared when PO released or manually cleared".
    // So we keep the items across project changes unless specifically asked.
    set({ projectId: id })
  }
}))
