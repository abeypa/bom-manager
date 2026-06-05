import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Edit2,
  FileText,
  Folder,
  GripVertical,
  ImageIcon,
  Layers,
  Maximize2,
  Minimize2,
  Package,
  PlusCircle,
  Search,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  X as CloseIcon,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'

const Highlight = ({ text, queries = [] }: { text: any; queries?: string[] }) => {
  const str = String(text || '')

  if (!queries.length || !str || queries.every((q) => !q)) return <>{str}</>

  const activeQueries = queries
    .filter((q) => q && q.trim().length > 0)
    .map((q) => q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

  if (activeQueries.length === 0) return <>{str}</>

  const regex = new RegExp(`(${activeQueries.join('|')})`, 'gi')
  const parts = str.split(regex)

  return (
    <>
      {parts.map((part, i) =>
        activeQueries.some(
          (q) =>
            part.toLowerCase() === q.toLowerCase() || new RegExp(q, 'gi').test(part)
        ) ? (
          <mark
            key={i}
            className="rounded bg-amber-200/80 px-0.5 font-semibold text-slate-900"
          >
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  )
}

const getDisplayName = (type: 'section' | 'subsection' | 'part', data: any, fallback: string) => {
  if (type === 'subsection') {
    return data.name || data.title || data.section_name || 'Untitled subsection'
  }

  if (type === 'part') {
    return (
      data.globalDescription ||
      data.description ||
      data.part_ref?.description ||
      data.name ||
      fallback ||
      'Untitled part'
    )
  }

  return data.name || data.description || fallback || 'Untitled section'
}

const getPartStatusMeta = (part: any) => {
  const poInfo = part.po_info
  const requiredQty = part.quantity || 0
  const receivedQty = poInfo?.received_qty || 0
  const stockQty = part.part_ref?.stock_quantity || 0
  const hasPendingPO = poInfo?.status === 'Draft'
  const isReleased = Boolean(poInfo && poInfo.status !== 'Draft')
  const notArrived =
    (poInfo && receivedQty < requiredQty) || (!poInfo && stockQty < requiredQty)

  if (notArrived) {
    return {
      badgeClass:
        'border-amber-200 bg-amber-50 text-amber-700',
      icon: AlertTriangle,
      label: hasPendingPO ? 'Pending receipt' : 'Short supply',
      detailLabel: poInfo?.status || 'No PO',
      poNumber: poInfo?.po_number || 'N/A',
      receivedQty,
      requiredQty,
    }
  }

  return {
    badgeClass:
      isReleased || stockQty >= requiredQty
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-slate-200 bg-slate-100 text-slate-600',
    icon: isReleased ? CheckCircle2 : Package,
    label: isReleased ? 'Released' : 'Available',
    detailLabel: poInfo?.status || 'Stock ready',
    poNumber: poInfo?.po_number || 'N/A',
    receivedQty,
    requiredQty,
  }
}

interface TreeItemProps {
  id: string | number
  level: number
  children?: ReactNode
  label: string
  type: 'section' | 'subsection' | 'part'
  data: any
  searchQuery?: string
  bulkSearchIds?: string[]
  isExpanded?: boolean
  onToggle?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onCopy?: () => void
  onAddChild?: () => void
  onImageClick?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
}

const TreeItem = ({
  id,
  level,
  children,
  label,
  type,
  data,
  searchQuery = '',
  bulkSearchIds = [],
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  onCopy,
  onAddChild,
  onImageClick,
  isSelected,
  onSelect,
}: TreeItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: id.toString(),
      data: { type, data },
    })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }

  const displayName = getDisplayName(type, data, label)
  const erpId = data.beperp_part_no || data.part_ref?.beperp_part_no || ''
  const partNumber = data.part_ref?.part_number || ''
  const quantity = data.quantity || 0
  const isBulkMatch =
    type === 'part' &&
    bulkSearchIds.length > 0 &&
    bulkSearchIds.some(
      (q) =>
        String(erpId).toLowerCase().includes(q.toLowerCase()) ||
        String(partNumber).toLowerCase().includes(q.toLowerCase())
    )

  const indentClass =
    level === 0 ? '' : level === 1 ? 'ml-6 border-l border-slate-200/80 pl-4' : 'ml-12'

  const rowClass =
    type === 'section'
      ? 'rounded-2xl border border-slate-200 bg-white shadow-sm'
      : type === 'subsection'
        ? 'rounded-xl border border-slate-200/80 bg-slate-50/70'
        : 'rounded-xl border border-slate-200/70 bg-white'

  const stateClass = isSelected
    ? 'border-primary-300 bg-primary-50/70 ring-1 ring-primary-200'
    : isBulkMatch
      ? 'border-amber-300 bg-amber-50/70 ring-1 ring-amber-200'
      : 'hover:border-slate-300 hover:bg-slate-50/90'

  const renderCheckbox = () =>
    onSelect ? (
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(e) => onSelect(e.target.checked)}
        className="h-4 w-4 cursor-pointer rounded border-slate-300 text-primary-600 focus:ring-primary-500"
        onClick={(e) => e.stopPropagation()}
      />
    ) : null

  const renderImagePreview = () => {
    const imageUrl = type === 'part' ? data.part_ref?.image_path : data.image_path
    if (!imageUrl) return null

    return (
      <TooltipContent side="right" className="border-0 bg-transparent p-0 shadow-none">
        <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
          <img src={imageUrl} alt="Preview" className="h-48 w-48 rounded-xl object-contain" />
        </div>
      </TooltipContent>
    )
  }

  const renderActions = () => (
    <div className="flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
      {onImageClick && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onImageClick}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white hover:text-amber-600"
            >
              <ImageIcon size={14} />
            </button>
          </TooltipTrigger>
          {renderImagePreview()}
        </Tooltip>
      )}
      {onAddChild && (
        <button
          onClick={onAddChild}
          title="Add child"
          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white hover:text-primary-600"
        >
          <PlusCircle size={14} />
        </button>
      )}
      {onCopy && (
        <button
          onClick={onCopy}
          title="Copy"
          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
        >
          <Copy size={14} />
        </button>
      )}
      {onEdit && (
        <button
          onClick={onEdit}
          title="Edit"
          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
        >
          <Edit2 size={14} />
        </button>
      )}
      {onDelete && (
        <button
          onClick={onDelete}
          title="Delete"
          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  )

  if (type === 'part') {
    const status = getPartStatusMeta(data)
    const StatusIcon = status.icon

    return (
      <div ref={setNodeRef} style={style} className={indentClass}>
        <div
          className={`group mb-2 flex items-start gap-3 px-4 py-3 transition-all duration-200 ${rowClass} ${stateClass}`}
        >
          <div
            className="mt-0.5 rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={14} />
          </div>

          <div className="mt-0.5">{renderCheckbox()}</div>

          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500">
            <FileText className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">
                  <Highlight text={displayName} queries={[searchQuery, ...bulkSearchIds]} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                  {partNumber && (
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-slate-600">
                      <Highlight
                        text={partNumber}
                        queries={[searchQuery, ...bulkSearchIds]}
                      />
                    </span>
                  )}
                  <span className="rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-slate-600">
                    Qty {quantity}
                  </span>
                  {erpId && (
                    <span className="rounded-md border border-primary-100 bg-primary-50/60 px-2 py-1 font-mono text-primary-700">
                      ERP{' '}
                      <Highlight text={erpId} queries={[searchQuery, ...bulkSearchIds]} />
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${status.badgeClass}`}
                >
                  <StatusIcon size={11} className="mr-1.5" />
                  {status.label}
                </Badge>
                {renderActions()}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
              <span>Status: {status.detailLabel}</span>
              <span>PO: {status.poNumber}</span>
              <span>
                Received: {status.receivedQty} / {status.requiredQty}
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const childCount =
    type === 'section' ? data.subsections?.length || 0 : data.parts?.length || 0
  const Icon = type === 'section' ? Layers : Folder
  const itemLabel = type === 'section' ? 'subsections' : 'parts'

  return (
    <div ref={setNodeRef} style={style} className={indentClass}>
      <div
        className={`group mb-3 overflow-hidden transition-all duration-200 ${rowClass} ${stateClass}`}
      >
        <div
          className={`flex items-center gap-3 px-4 py-3.5 ${
            type === 'section' ? 'bg-white' : 'bg-transparent'
          }`}
        >
          <div
            className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-white hover:text-slate-600"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={14} />
          </div>

          {type === 'subsection' && <div>{renderCheckbox()}</div>}

          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggle?.()
            }}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
            <Icon className="h-4 w-4" />
          </div>

          <button onClick={onToggle} className="min-w-0 flex-1 text-left">
            <div className="truncate text-sm font-semibold text-slate-900">
              <Highlight text={displayName} queries={[searchQuery, ...bulkSearchIds]} />
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
              <span>{childCount} {itemLabel}</span>
              {type === 'section' && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                  Top level
                </span>
              )}
            </div>
          </button>

          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600"
            >
              {childCount} {itemLabel}
            </Badge>
            {renderActions()}
          </div>
        </div>

        {isExpanded && children && (
          <div className="border-t border-slate-200/80 px-2 pb-2 pt-3">{children}</div>
        )}
      </div>
    </div>
  )
}

interface BOMTreeViewProps {
  project: any
  projectId: number
  onEditSection: (section: any) => void
  onCopySection: (section: any) => void
  onDeleteSection: (sectionId: number) => void
  onAddSubsection: (sectionId: number) => void
  onEditSubsection: (sub: any) => void
  onDeleteSubsection: (subId: number) => void
  onCopySubsection: (sub: any) => void
  onAddPart: (sub: any) => void
  onEditPart: (part: any) => void
  onDeletePart: (partId: number) => void
  onImageClick: (entity: any, type: 'section' | 'subsection' | 'part') => void
  selectedPartIds: Set<number>
  onToggleSelectPart: (id: number) => void
  onToggleSelectAll: (ids: number[]) => void
  onAddSelectedToBasket?: () => void
  onClearSelection?: () => void
}

export default function BOMTreeView({
  project,
  projectId: _projectId,
  onEditSection,
  onCopySection,
  onDeleteSection,
  onAddSubsection,
  onEditSubsection,
  onDeleteSubsection,
  onCopySubsection,
  onAddPart,
  onEditPart,
  onDeletePart,
  onImageClick,
  selectedPartIds,
  onToggleSelectPart,
  onToggleSelectAll,
  onAddSelectedToBasket,
  onClearSelection,
}: BOMTreeViewProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    new Set(project.sections?.map((s: any) => `section-${s.id}`))
  )
  const [tempSearch, setTempSearch] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [tempErpSearch, setTempErpSearch] = useState('')
  const [erpSearchQuery, setErpSearchQuery] = useState('')
  const [bulkSearchRaw, setBulkSearchRaw] = useState('')
  const [bulkSearchIds, setBulkSearchIds] = useState<string[]>([])

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(tempSearch), 300)
    return () => clearTimeout(timer)
  }, [tempSearch])

  useEffect(() => {
    const timer = setTimeout(() => setErpSearchQuery(tempErpSearch), 300)
    return () => clearTimeout(timer)
  }, [tempErpSearch])

  useEffect(() => {
    const timer = setTimeout(() => {
      const ids = bulkSearchRaw
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0)

      setBulkSearchIds(Array.from(new Set(ids)))
    }, 400)

    return () => clearTimeout(timer)
  }, [bulkSearchRaw])

  const filteredSections = useMemo(() => {
    if (!searchQuery && !erpSearchQuery && bulkSearchIds.length === 0) return project.sections || []

    const sQuery = searchQuery.toLowerCase()
    const eQuery = erpSearchQuery.toLowerCase()
    const bQueries = bulkSearchIds.map((id) => id.toLowerCase())

    return (project.sections || [])
      .map((section: any) => {
        const filteredSubsections = (section.subsections || [])
          .map((sub: any) => {
            const filteredParts = (sub.parts || []).filter((part: any) => {
              const partErpId = String(
                part.beperp_part_no || part.part_ref?.beperp_part_no || ''
              ).toLowerCase()
              const partNumber = String(part.part_ref?.part_number || '').toLowerCase()
              const partDesc = String(
                part.description || part.part_ref?.description || ''
              ).toLowerCase()
              const partName = String(part.name || '').toLowerCase()

              const matchesBulk =
                bQueries.length === 0 ||
                bQueries.some((q) => partErpId.includes(q) || partNumber.includes(q))

              const matchesErp = !erpSearchQuery || partErpId.includes(eQuery)
              const matchesGlobal =
                !searchQuery ||
                partDesc.includes(sQuery) ||
                partNumber.includes(sQuery) ||
                partName.includes(sQuery) ||
                partErpId.includes(sQuery)

              return matchesBulk && matchesErp && matchesGlobal
            })

            const subName = String(sub.name || sub.section_name || '').toLowerCase()
            const subNameMatches = !searchQuery || subName.includes(sQuery)

            if (filteredParts.length > 0 || subNameMatches) {
              return { ...sub, parts: filteredParts }
            }

            return null
          })
          .filter(Boolean)

        const sectionNameMatches =
          !searchQuery || String(section.name || '').toLowerCase().includes(sQuery)

        if (filteredSubsections.length > 0 || sectionNameMatches) {
          return { ...section, subsections: filteredSubsections }
        }

        return null
      })
      .filter(Boolean)
  }, [project.sections, searchQuery, erpSearchQuery, bulkSearchIds])

  useEffect(() => {
    if (bulkSearchIds.length === 0) return

    const matchingPartIds: number[] = []

    filteredSections.forEach((section: any) => {
      section.subsections?.forEach((sub: any) => {
        sub.parts?.forEach((part: any) => {
          if (!selectedPartIds.has(part.id)) {
            matchingPartIds.push(part.id)
          }
        })
      })
    })

    if (matchingPartIds.length > 0) {
      onToggleSelectAll(matchingPartIds)
    }
  }, [bulkSearchIds, filteredSections, onToggleSelectAll, selectedPartIds])

  useEffect(() => {
    if (!searchQuery && !erpSearchQuery && bulkSearchIds.length === 0) return

    const nextExpanded = new Set<string>()

    filteredSections.forEach((section: any) => {
      nextExpanded.add(`section-${section.id}`)
      section.subsections?.forEach((sub: any) => {
        if (sub.parts?.length > 0) {
          nextExpanded.add(`sub-${sub.id}`)
        }
      })
    })

    setExpandedNodes(nextExpanded)
  }, [searchQuery, erpSearchQuery, bulkSearchIds, filteredSections])

  const allContainerIds = useMemo(() => {
    const ids: string[] = []

    project.sections?.forEach((section: any) => {
      ids.push(`section-${section.id}`)
      section.subsections?.forEach((sub: any) => ids.push(`sub-${sub.id}`))
    })

    return ids
  }, [project.sections])

  const summary = useMemo(() => {
    const sections = project.sections || []
    const subsectionCount = sections.reduce(
      (count: number, section: any) => count + (section.subsections?.length || 0),
      0
    )
    const partCount = sections.reduce(
      (count: number, section: any) =>
        count +
        (section.subsections || []).reduce(
          (subCount: number, sub: any) => subCount + (sub.parts?.length || 0),
          0
        ),
      0
    )

    return {
      sections: sections.length,
      subsections: subsectionCount,
      parts: partCount,
      filteredSections: filteredSections.length,
    }
  }, [filteredSections.length, project.sections])

  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }

  const clearSearches = () => {
    setTempSearch('')
    setTempErpSearch('')
    setBulkSearchRaw('')
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
      <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold tracking-[0.18em] text-slate-900 uppercase">
                  Project Structure
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Structured BOM explorer with search, bulk selection, and drag ordering.
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
                {summary.sections} sections
              </div>
              <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
                {summary.subsections} subsections
              </div>
              <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
                {summary.parts} parts
              </div>
              {(searchQuery || erpSearchQuery || bulkSearchIds.length > 0) && (
                <div className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700">
                  {summary.filteredSections} matching sections
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setExpandedNodes(new Set(allContainerIds))}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
            >
              <Maximize2 size={13} />
              Expand all
            </button>
            <button
              onClick={() => setExpandedNodes(new Set())}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
            >
              <Minimize2 size={13} />
              Collapse all
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1fr)]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, description, part no..."
              value={tempSearch}
              onChange={(e) => setTempSearch(e.target.value)}
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-10 text-sm text-slate-700 outline-none transition focus:border-primary-400 focus:ring-4 focus:ring-primary-100"
            />
            {tempSearch && (
              <button
                onClick={() => setTempSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                <CloseIcon size={14} />
              </button>
            )}
          </label>

          <label className="relative block">
            <Layers className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filter ERP ID"
              value={tempErpSearch}
              onChange={(e) => setTempErpSearch(e.target.value)}
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-10 text-sm text-slate-700 outline-none transition focus:border-primary-400 focus:ring-4 focus:ring-primary-100"
            />
            {tempErpSearch && (
              <button
                onClick={() => setTempErpSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                <CloseIcon size={14} />
              </button>
            )}
          </label>

          <label className="relative block">
            <PlusCircle className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Bulk ERP IDs, comma separated"
              value={bulkSearchRaw}
              onChange={(e) => setBulkSearchRaw(e.target.value)}
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-24 text-sm text-slate-700 outline-none transition focus:border-primary-400 focus:ring-4 focus:ring-primary-100"
            />
            {(tempSearch || tempErpSearch || bulkSearchRaw) && (
              <button
                onClick={clearSearches}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                Clear
              </button>
            )}
          </label>
        </div>

        {selectedPartIds.size > 0 && (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-900 px-4 py-3 text-white md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10">
                <ShoppingBag className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold">{selectedPartIds.size} parts selected</div>
                <div className="text-xs text-slate-300">
                  Selected items can be moved to the procurement basket in one step.
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={onAddSelectedToBasket}
                className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-600"
              >
                <ShoppingCart size={13} />
                Add to basket
              </button>
              <button
                onClick={onClearSelection}
                className="rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/10 hover:text-white"
              >
                Clear selection
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 md:p-6">
        {filteredSections.length === 0 && (searchQuery || erpSearchQuery || bulkSearchIds.length > 0) ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm">
              <Search className="h-7 w-7 text-slate-300" />
            </div>
            <h4 className="mt-5 text-lg font-semibold text-slate-900">No matching items</h4>
            <p className="mt-2 max-w-sm text-sm text-slate-500">
              Try a broader search term or clear the ERP filters to see more of the BOM.
            </p>
            <button
              onClick={clearSearches}
              className="mt-6 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <TooltipProvider delayDuration={0}>
            <SortableContext
              items={filteredSections.map((section: any) => `section-${section.id}`)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {filteredSections.map((section: any) => (
                  <TreeItem
                    key={`section-${section.id}`}
                    id={`section-${section.id}`}
                    level={0}
                    label={section.name}
                    type="section"
                    data={section}
                    searchQuery={erpSearchQuery || searchQuery}
                    bulkSearchIds={bulkSearchIds}
                    isExpanded={expandedNodes.has(`section-${section.id}`)}
                    onToggle={() => toggleNode(`section-${section.id}`)}
                    onEdit={() => onEditSection(section)}
                    onCopy={() => onCopySection(section)}
                    onDelete={() => onDeleteSection(section.id)}
                    onAddChild={() => onAddSubsection(section.id)}
                    onImageClick={() => onImageClick(section, 'section')}
                  >
                    <SortableContext
                      items={section.subsections?.map((sub: any) => `sub-${sub.id}`) || []}
                      strategy={verticalListSortingStrategy}
                    >
                      <div>
                        {section.subsections?.map((sub: any) => (
                          <TreeItem
                            key={`sub-${sub.id}`}
                            id={`sub-${sub.id}`}
                            level={1}
                            label={sub.name || sub.section_name}
                            type="subsection"
                            data={sub}
                            searchQuery={erpSearchQuery || searchQuery}
                            bulkSearchIds={bulkSearchIds}
                            isExpanded={expandedNodes.has(`sub-${sub.id}`)}
                            onToggle={() => toggleNode(`sub-${sub.id}`)}
                            onEdit={() => onEditSubsection(sub)}
                            onDelete={() => onDeleteSubsection(sub.id)}
                            onCopy={() => onCopySubsection(sub)}
                            onAddChild={() => onAddPart(sub)}
                            onImageClick={() => onImageClick(sub, 'subsection')}
                            isSelected={
                              sub.parts.length > 0 &&
                              sub.parts.every((part: any) => selectedPartIds.has(part.id))
                            }
                            onSelect={() => {
                              const ids = sub.parts.map((part: any) => part.id)
                              onToggleSelectAll(ids)
                            }}
                          >
                            <SortableContext
                              items={sub.parts.map((part: any) => `part-${part.id}`) || []}
                              strategy={verticalListSortingStrategy}
                            >
                              <div>
                                {sub.parts.map((part: any) => (
                                  <TreeItem
                                    key={`part-${part.id}`}
                                    id={`part-${part.id}`}
                                    level={2}
                                    label={
                                      part.description ||
                                      part.part_ref?.description ||
                                      'Unnamed part'
                                    }
                                    type="part"
                                    data={part}
                                    searchQuery={erpSearchQuery || searchQuery}
                                    bulkSearchIds={bulkSearchIds}
                                    onEdit={() => onEditPart(part)}
                                    onDelete={() => onDeletePart(part.id)}
                                    onImageClick={() => onImageClick(part, 'part')}
                                    isSelected={selectedPartIds.has(part.id)}
                                    onSelect={() => onToggleSelectPart(part.id)}
                                  />
                                ))}
                              </div>
                            </SortableContext>
                          </TreeItem>
                        ))}
                      </div>
                    </SortableContext>
                  </TreeItem>
                ))}
              </div>
            </SortableContext>
          </TooltipProvider>
        )}
      </div>
    </div>
  )
}
