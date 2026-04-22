import { create } from 'zustand'

export interface BasketItem {
  id: number
  project_part_id: number
  part_number: string
  description: string
  quantity: number
  unit_price: number
  discount_percent: number
  part_type?: string
  part_id?: number
  po_info?: any
  part_ref?: any
}

interface POBasketStore {
  basketItems: BasketItem[]
  basketOpen: boolean
  poModalOpen: boolean
  projectId: number | null

  // Actions
  setBasketOpen: (open: boolean) => void
  setPoModalOpen: (open: boolean) => void
  addToBasket: (parts: any[]) => void
  removeFromBasket: (id: number) => void
  updateItem: (id: number, updates: Partial<BasketItem>) => void
  clearBasket: () => void
  setProjectId: (id: number | null) => void
}

export const usePOBasketStore = create<POBasketStore>((set, get) => ({
  basketItems: [],
  basketOpen: true, // Default to true as per recent requirement
  poModalOpen: false,
  projectId: null,

  setBasketOpen: (open) => set({ basketOpen: open }),
  setPoModalOpen: (open) => set({ poModalOpen: open }),

  addToBasket: (partsToAdd) => {
    set(state => {
      const next = [...state.basketItems]
      partsToAdd.forEach(p => {
        const existing = next.find(item => item.id === p.id)
        if (existing) {
          existing.quantity = (existing.quantity || 1) + (p.quantity || 1)
        } else {
          next.push({
            ...p,
            id: p.id,
            project_part_id: p.id,
            part_number: p.part_ref?.part_number || p.part_ref || 'N/A',
            description: p.description || p.part_ref?.description || 'N/A',
            quantity: p.quantity || 1,
            unit_price: p.unit_price || 0,
            discount_percent: p.discount_percent || 0
          })
        }
      })
      return { basketItems: next, basketOpen: true }
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
