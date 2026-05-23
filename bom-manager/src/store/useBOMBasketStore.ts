import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type BOMBasketSourceType = 'project_part' | 'master_part' | 'temporary'

export interface BOMBasketItem {
  basket_id: string
  project_id: number
  source_type: BOMBasketSourceType
  source_project_part_id?: number | null
  part_type?: string | null
  part_id?: number | null
  part_number: string
  description: string
  manufacturer_part_number?: string | null
  quantity: number
  unit_price: number
  discount_percent: number
  currency: string
  usage_comment: string
  reference_designator?: string | null
  notes?: string | null
  is_temporary: boolean
}

type BasketMap = Record<string, BOMBasketItem[]>

interface BOMBasketStore {
  currentProjectId: number | null
  basketOpen: boolean
  itemsByProject: BasketMap
  setCurrentProjectId: (projectId: number | null) => void
  setBasketOpen: (open: boolean) => void
  addItems: (projectId: number, items: BOMBasketItem[]) => void
  addTemporaryItem: (
    projectId: number,
    item: Omit<BOMBasketItem, 'basket_id' | 'project_id' | 'source_type' | 'is_temporary'>,
  ) => void
  updateItem: (projectId: number, basketId: string, updates: Partial<BOMBasketItem>) => void
  removeItem: (projectId: number, basketId: string) => void
  clearProjectBasket: (projectId: number) => void
}

const getProjectKey = (projectId: number | null) => String(projectId ?? 'unassigned')

const getItemsForProject = (itemsByProject: BasketMap, projectId: number) =>
  itemsByProject[getProjectKey(projectId)] || []

export const makeProjectBasketId = (projectPartId: number) => `project-part-${projectPartId}`
export const makeMasterBasketId = (partType: string, partId: number) => `master-part-${partType}-${partId}`
export const makeTempBasketId = () => `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const useBOMBasketStore = create<BOMBasketStore>()(
  persist(
    (set, get) => ({
      currentProjectId: null,
      basketOpen: false,
      itemsByProject: {},

      setCurrentProjectId: (projectId) => set({ currentProjectId: projectId }),
      setBasketOpen: (open) => set({ basketOpen: open }),

      addItems: (projectId, items) =>
        set((state) => {
          const key = getProjectKey(projectId)
          const next = [...getItemsForProject(state.itemsByProject, projectId)]

          items.forEach((incoming) => {
            const existing = next.find((item) => item.basket_id === incoming.basket_id)
            if (existing) {
              existing.quantity += incoming.quantity
              existing.unit_price = incoming.unit_price
              existing.discount_percent = incoming.discount_percent
              existing.currency = incoming.currency
              if (incoming.usage_comment && !existing.usage_comment) {
                existing.usage_comment = incoming.usage_comment
              }
              return
            }

            next.push({
              ...incoming,
              project_id: projectId,
            })
          })

          return {
            itemsByProject: {
              ...state.itemsByProject,
              [key]: next,
            },
          }
        }),

      addTemporaryItem: (projectId, item) =>
        set((state) => {
          const key = getProjectKey(projectId)
          return {
            itemsByProject: {
              ...state.itemsByProject,
              [key]: [
                ...getItemsForProject(state.itemsByProject, projectId),
                {
                  ...item,
                  basket_id: makeTempBasketId(),
                  project_id: projectId,
                  source_type: 'temporary',
                  is_temporary: true,
                },
              ],
            },
          }
        }),

      updateItem: (projectId, basketId, updates) =>
        set((state) => {
          const key = getProjectKey(projectId)
          return {
            itemsByProject: {
              ...state.itemsByProject,
              [key]: getItemsForProject(state.itemsByProject, projectId).map((item) =>
                item.basket_id === basketId ? { ...item, ...updates } : item,
              ),
            },
          }
        }),

      removeItem: (projectId, basketId) =>
        set((state) => {
          const key = getProjectKey(projectId)
          return {
            itemsByProject: {
              ...state.itemsByProject,
              [key]: getItemsForProject(state.itemsByProject, projectId).filter(
                (item) => item.basket_id !== basketId,
              ),
            },
          }
        }),

      clearProjectBasket: (projectId) =>
        set((state) => {
          const key = getProjectKey(projectId)
          return {
            itemsByProject: {
              ...state.itemsByProject,
              [key]: [],
            },
          }
        }),
    }),
    {
      name: 'bom-basket-store-v1',
      partialize: (state) => ({
        currentProjectId: state.currentProjectId,
        itemsByProject: state.itemsByProject,
      }),
    },
  ),
)

export const useCurrentBOMBasketItems = () => {
  const projectId = useBOMBasketStore((state) => state.currentProjectId)
  const itemsByProject = useBOMBasketStore((state) => state.itemsByProject)
  if (!projectId) return []
  return getItemsForProject(itemsByProject, projectId)
}
