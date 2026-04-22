import React, { useState, useMemo } from 'react'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { 
  GripVertical, 
  ChevronRight, 
  ChevronDown, 
  Layers, 
  Folder, 
  FileText, 
  PlusCircle,
  ImageIcon,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ShoppingBag,
  Package,
  Edit2,
  Trash2,
  ShoppingCart,
  Copy,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'

interface TreeItemProps {
  id: string | number
  level: number
  children?: React.ReactNode
  label: string
  type: 'section' | 'subsection' | 'part'
  data: any
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
  label: _label, 
  type, 
  data, 
  isExpanded, 
  onToggle,
  onEdit,
  onDelete,
  onCopy,
  onAddChild,
  onImageClick,
  isSelected,
  onSelect
}: TreeItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: id.toString() })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    paddingLeft: `${level * 24}px`
  }

  // CORRECT subsection name logic using requested fields
  const getDisplayName = () => {
    if (type === 'subsection') {
      return data.name || data.title || data.section_name || 'UNTITLED SUBSECTION'
    }
    return data.name || data.description || 'Untitled'
  }

  // Checkbox sub-component
  const RenderCheckbox = () => onSelect ? (
    <div className="flex items-center pr-1 scale-110">
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(e) => onSelect(e.target.checked)}
        className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600 cursor-pointer shadow-sm"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  ) : null

  // Action Tools sub-component
  const RenderActions = () => (
    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-300 pr-2">
      {onImageClick && (
        <button onClick={onImageClick} title="View Image" className="p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-amber-500 shadow-sm border border-transparent hover:border-slate-100 transition-all">
          <ImageIcon size={13} />
        </button>
      )}
      {onAddChild && (
        <button onClick={onAddChild} title="Add Child" className="p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-primary-600 shadow-sm border border-transparent hover:border-slate-100 transition-all">
          <PlusCircle size={13} />
        </button>
      )}
      {onCopy && (
        <button onClick={onCopy} title="Copy Subsection" className="p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-navy-900 shadow-sm border border-transparent hover:border-slate-100 transition-all">
          <Copy size={13} />
        </button>
      )}
      {onEdit && (
        <button onClick={onEdit} title="Edit" className="p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-navy-900 shadow-sm border border-transparent hover:border-slate-100 transition-all">
          <Edit2 size={13} />
        </button>
      )}
      {onDelete && (
        <button onClick={onDelete} title="Delete" className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600 shadow-sm border border-transparent hover:border-red-100 transition-all">
          <Trash2 size={13} />
        </button>
      )}
    </div>
  )

  // ── SUBSECTION RENDER ─────────────────────────────────────
  if (type === 'subsection') {
    return (
      <div ref={setNodeRef} style={style} className="group select-none">
        <div 
          className="subsection-header flex items-center gap-3 py-2 px-4 bg-gray-50 border-b hover:bg-slate-100/80 transition-all cursor-pointer mt-1 rounded-xl"
          onClick={onToggle}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div 
              className="p-1 text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing"
              {...attributes} 
              {...listeners}
            >
              <GripVertical size={14} />
            </div>
            
            <RenderCheckbox />
            
            <Folder className="h-5 w-5 text-amber-600" />
            <span className="font-semibold text-base text-slate-900 truncate">
              {getDisplayName()}
            </span>
            
            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
          </div>
          
          <RenderActions />
        </div>
        
        {isExpanded && children && (
          <div className="relative animate-in slide-in-from-top-2 duration-300 pl-4">
            <div className="absolute left-[-4px] top-0 bottom-4 w-[1px] bg-slate-200/60 ml-[23px] rounded-full" />
            {children}
          </div>
        )}
      </div>
    )
  }

  // ── SECTION / PART RENDER ─────────────────────────────────────
  return (
    <div ref={setNodeRef} style={style} className="group select-none">
      <div className={`
        flex items-center gap-2 py-2 px-2 rounded-xl transition-all duration-300
        ${level === 0 ? 'mt-6 bg-slate-50/30' : 'mt-1'} 
        ${isSelected ? 'bg-primary-50/80 border-l-2 border-primary-500 shadow-sm' : 'hover:bg-slate-100/50'}
      `}>
        <div 
          className="p-1 hover:bg-white rounded-lg text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing"
          {...attributes} 
          {...listeners}
        >
          <GripVertical size={14} />
        </div>

        {type === 'section' && (
          <button 
            onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
            className="p-1 hover:bg-white rounded-lg text-slate-400 hover:text-primary-600"
          >
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        )}

        <div className="flex items-center gap-3 flex-1 min-w-0">
          <RenderCheckbox />
          
          <div className="shrink-0 flex items-center justify-center w-6 h-6 bg-white rounded-lg shadow-sm border border-slate-100">
            {type === 'section' ? <Layers className="w-4 h-4 text-primary-600" /> : <FileText className="w-3.5 h-3.5 text-slate-400" />}
          </div>

          <div className="flex flex-col min-w-0 flex-1">
            <span className={`
              text-sm tracking-tight truncate 
              ${type === 'section' ? 'font-black text-navy-900 uppercase tracking-widest' : 'font-bold text-slate-600'}
            `}>
              {getDisplayName()}
            </span>

            {type === 'part' && (
              <div className="flex items-center gap-3 mt-1.5 overflow-x-auto no-scrollbar">
                <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 shrink-0">
                  {data.part_ref?.part_number || 'No PN'} • QTY: {data.quantity}
                </span>

                {(() => {
                  const poInfo = data.po_info;
                  const hasPendingPO = poInfo && poInfo.status === 'Draft';
                  const isReleased = poInfo && poInfo.status !== 'Draft';
                  const requiredQty = data.quantity || 0;
                  const receivedQty = poInfo?.received_qty || 0;
                  const notArrived = (poInfo && receivedQty < requiredQty) || (!poInfo && (data.part_ref?.stock_quantity || 0) < requiredQty);
                  const poNumber = poInfo?.po_number || 'N/A';
                  const systemStatus = poInfo?.status || 'No PO';

                  return (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1.5 cursor-help shrink-0">
                          {hasPendingPO && (
                            <Badge variant="secondary" className="bg-amber-500 text-white text-[9px] px-2 py-0.5 font-black uppercase tracking-widest">
                              <Clock size={8} className="mr-1.5" />
                              PENDING PO
                            </Badge>
                          )}
                          {isReleased && (
                            <Badge variant="success" className="bg-emerald-600 text-white text-[9px] px-2 py-0.5 font-black uppercase tracking-widest">
                              <CheckCircle2 size={8} className="mr-1.5" />
                              RELEASED
                            </Badge>
                          )}
                          {!poInfo && (
                            <Badge variant="secondary" className="bg-slate-100 text-slate-400 text-[9px] px-2 py-0.5 font-black uppercase tracking-widest opacity-60">
                              <ShoppingBag size={8} className="mr-1.5" />
                              ORDERING
                            </Badge>
                          )}
                          {notArrived && (
                            <Badge variant="destructive" className="text-[9px] px-2 py-0.5 font-black uppercase tracking-widest">
                              <AlertTriangle size={8} className="mr-1.5" />
                              NOT ARRIVED
                            </Badge>
                          )}
                          {!notArrived && (
                            <Badge variant="success" className="bg-emerald-600 text-white text-[9px] px-2 py-0.5 font-black uppercase tracking-widest">
                              <Package size={8} className="mr-1.5" />
                              ARRIVED
                            </Badge>
                          )}
                        </div>
                      </TooltipTrigger>

                      <TooltipContent side="right" className="max-w-xs bg-white border-slate-200 shadow-2xl p-4 rounded-2xl animate-in fade-in zoom-in-95 duration-300">
                        <div className="space-y-2.5 text-xs">
                          <div className="border-b border-slate-100 pb-2 flex items-center justify-between">
                            <span className="text-[10px] font-black text-navy-900/40 uppercase">Status Analysis</span>
                          </div>
                          <div className="flex justify-between">
                            <strong className="text-navy-900/60 uppercase text-[9px]">PO REF</strong> 
                            <span className="font-black text-navy-600 bg-navy-50 px-1.5 rounded">#{poNumber}</span>
                          </div>
                          <div className="flex justify-between">
                            <strong className="text-navy-900/60 uppercase text-[9px]">Received</strong> 
                            <span className="font-black text-slate-700">{receivedQty} / {requiredQty}</span>
                          </div>
                          <div className="flex justify-between">
                            <strong className="text-navy-900/60 uppercase text-[9px]">Status</strong> 
                            <span className="capitalize font-black text-slate-700">{systemStatus}</span>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        <RenderActions />
      </div>

      {isExpanded && children && (
        <div className="relative animate-in slide-in-from-top-2 duration-300">
          <div className="absolute left-[-12px] top-0 bottom-4 w-[1px] bg-slate-200/60 ml-[23px] rounded-full" />
          {children}
        </div>
      )}
    </div>
  )
}

interface BOMTreeViewProps {
  project: any
  projectId: number
  onEditSection: (section: any) => void
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
}

export default function BOMTreeView({
  project,
  projectId: _projectId,
  onEditSection,
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
  onAddSelectedToBasket
}: BOMTreeViewProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(project.sections?.map((s: any) => `section-${s.id}`)))

  const allContainerIds = useMemo(() => {
    const ids: string[] = []
    project.sections?.forEach((s: any) => {
      ids.push(`section-${s.id}`)
      s.subsections?.forEach((sub: any) => ids.push(`sub-${sub.id}`))
    })
    return ids
  }, [project.sections])

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }

  const expandAll = () => setExpandedNodes(new Set(allContainerIds))
  const collapseAll = () => setExpandedNodes(new Set())

  return (
    <div className="bg-white rounded-[2rem] border border-slate-100 shadow-2xl shadow-navy-900/5 overflow-hidden">
      <div className="bg-slate-50/80 px-8 py-5 border-b border-slate-200/60 flex items-center justify-between gap-6 flex-wrap backdrop-blur-md">
        <div className="flex items-center gap-6">
          <h3 className="text-xs font-black text-navy-900 tracking-[0.3em] uppercase flex items-center gap-3">
            <div className="w-1.5 h-6 bg-primary-500 rounded-full" />
            BOM Registry Hierarchy
          </h3>
          
          <div className="flex items-center bg-white p-1 rounded-xl shadow-sm border border-slate-200/50">
            <button onClick={expandAll} className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-black uppercase text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all">
              <Maximize2 size={12} /> Expand All
            </button>
            <div className="w-px h-4 bg-slate-200 mx-1" />
            <button onClick={collapseAll} className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-black uppercase text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
              <Minimize2 size={12} /> Collapse All
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {selectedPartIds.size > 0 && onAddSelectedToBasket && (
            <button
              onClick={onAddSelectedToBasket}
              className="btn h-9 bg-primary-600 hover:bg-primary-700 text-white border-none text-[10px] px-5 font-black uppercase tracking-widest shadow-lg shadow-primary-500/25 transition-all"
            >
              <ShoppingCart className="w-3.5 h-3.5 mr-2" />
              Add Selected ({selectedPartIds.size})
            </button>
          )}
        </div>
      </div>

      <div className="p-8 lg:p-12">
        <TooltipProvider delayDuration={0}>
          <SortableContext 
            items={project.sections?.map((s: any) => `section-${s.id}`) || []} 
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-4">
              {project.sections?.map((section: any) => (
                <TreeItem
                  key={`section-${section.id}`}
                  id={`section-${section.id}`}
                  level={0}
                  label={section.name}
                  type="section"
                  data={section}
                  isExpanded={expandedNodes.has(`section-${section.id}`)}
                  onToggle={() => toggleNode(`section-${section.id}`)}
                  onEdit={() => onEditSection(section)}
                  onDelete={() => onDeleteSection(section.id)}
                  onAddChild={() => onAddSubsection(section.id)}
                  onImageClick={() => onImageClick(section, 'section')}
                >
                  <SortableContext 
                    items={section.subsections?.map((sub: any) => `sub-${sub.id}`) || []} 
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="mt-2 space-y-1">
                      {section.subsections?.map((sub: any) => (
                        <TreeItem
                          key={`sub-${sub.id}`}
                          id={`sub-${sub.id}`}
                          level={1}
                          label={sub.name}
                          type="subsection"
                          data={sub}
                          isExpanded={expandedNodes.has(`sub-${sub.id}`)}
                          onToggle={() => toggleNode(`sub-${sub.id}`)}
                          onEdit={() => onEditSubsection(sub)}
                          onDelete={() => onDeleteSubsection(sub.id)}
                          onCopy={() => onCopySubsection(sub)}
                          onAddChild={() => onAddPart(sub)}
                          onImageClick={() => onImageClick(sub, 'subsection')}
                          isSelected={sub.parts.length > 0 && sub.parts.every((p: any) => selectedPartIds.has(p.id))}
                          onSelect={(_checked) => {
                            const ids = sub.parts.map((p: any) => p.id)
                            onToggleSelectAll(ids)
                          }}
                        >
                          <SortableContext 
                            items={sub.parts.map((part: any) => `part-${part.id}`) || []} 
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="mt-2 space-y-1">
                              {sub.parts.map((part: any) => (
                                <TreeItem
                                  key={`part-${part.id}`}
                                  id={`part-${part.id}`}
                                  level={2}
                                  label={part.description || part.part_ref?.description || 'Unnamed Part'}
                                  type="part"
                                  data={part}
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
      </div>
    </div>
  )
}
