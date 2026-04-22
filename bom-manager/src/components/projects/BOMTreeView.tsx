import React, { useState } from 'react'
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
  label, 
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

  const getIcon = () => {
    if (type === 'section') return <Layers className="w-4 h-4 text-primary-600" />
    if (type === 'subsection') return <Folder className="w-4 h-4 text-amber-500" />
    return <FileText className="w-4 h-4 text-slate-400" />
  }

  return (
    <div ref={setNodeRef} style={style} className="group select-none">
      <div className={`flex items-center gap-2 py-2 px-1 hover:bg-slate-50/80 rounded-xl transition-all duration-200 ${level === 0 ? 'mt-4' : 'mt-1'} ${isSelected ? 'bg-primary-50/50' : ''}`}>
        <div 
          className="p-1 hover:bg-white rounded-lg text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing transition-colors"
          {...attributes} 
          {...listeners}
        >
          <GripVertical size={14} />
        </div>

        {type !== 'part' && (
          <button 
            onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
            className="p-1 hover:bg-white rounded-lg text-slate-400 transition-colors"
          >
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        )}

        <div className="flex items-center gap-3 flex-1 min-w-0">
          {onSelect && (
            <div className="flex items-center pr-1 scale-110">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => onSelect(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600 cursor-pointer"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
          <div className="shrink-0">
            {getIcon()}
          </div>
          <div className="flex flex-col min-w-0">
            <span className={`text-sm tracking-tight truncate ${type === 'section' ? 'font-black text-navy-900 uppercase' : (type === 'subsection' ? 'font-black text-slate-800 uppercase' : 'font-bold text-slate-700')}`}>
              {label}
            </span>
            {type === 'part' && (
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] font-mono text-slate-400">
                  {data.part_ref?.part_number || 'No PN'} • QTY: {data.quantity}
                </span>

                {/* ✅ ONLY CORRECT PATTERN — ONE Tooltip per part row */}
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
                        <div className="flex items-center gap-2 cursor-help">
                          {/* Badges stay exactly as they are - with user requested clean labels */}
                          {hasPendingPO && (
                            <Badge variant="secondary" className="bg-amber-500 text-white text-[9px] px-1.5 py-0.5 font-bold uppercase tracking-wider">
                              <Clock size={8} className="mr-1" />
                              PENDING PO
                            </Badge>
                          )}
                          {isReleased && (
                            <Badge variant="success" className="bg-emerald-600 text-white text-[9px] px-1.5 py-0.5 font-bold uppercase tracking-wider">
                              <CheckCircle2 size={8} className="mr-1" />
                              RELEASED
                            </Badge>
                          )}
                          {!poInfo && (
                            <Badge variant="secondary" className="bg-slate-100 text-slate-400 text-[9px] px-1.5 py-0.5 font-bold uppercase tracking-wider opacity-60">
                              <ShoppingBag size={8} className="mr-1" />
                              ORDERING
                            </Badge>
                          )}
                          {notArrived && (
                            <Badge variant="destructive" className="text-[9px] px-1.5 py-0.5 font-bold uppercase tracking-wider">
                              <AlertTriangle size={8} className="mr-1" />
                              NOT ARRIVED
                            </Badge>
                          )}
                          {!notArrived && (
                            <Badge variant="success" className="bg-emerald-600 text-white text-[9px] px-1.5 py-0.5 font-bold uppercase tracking-wider">
                              <Package size={8} className="mr-1" />
                              ARRIVED
                            </Badge>
                          )}
                        </div>
                      </TooltipTrigger>

                      <TooltipContent 
                        side="right" 
                        className="max-w-xs bg-white border-slate-200 shadow-xl p-3 rounded-2xl animate-in fade-in zoom-in-95 duration-200 z-50 overflow-hidden"
                        avoidCollisions={true}
                      >
                        <div className="space-y-2 text-xs">
                          <div className="border-b border-slate-100 pb-1 mb-1">
                            <span className="text-[9px] font-black text-navy-900/40 uppercase tracking-[0.1em]">Status intelligence</span>
                          </div>
                          <div><strong className="text-navy-900">PO Number:</strong> <span className="font-bold text-navy-600">#{poNumber}</span></div>
                          <div><strong className="text-navy-900">Received for Project:</strong> <span className="font-bold text-slate-700">{receivedQty} / {requiredQty}</span></div>
                          <div><strong className="text-navy-900">System Status:</strong> <span className="capitalize font-bold text-slate-700">{systemStatus}</span></div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pr-2">
          {onImageClick && (
            <button onClick={onImageClick} title="View Image" className="p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-amber-500 shadow-sm border border-transparent hover:border-slate-100">
              <ImageIcon size={13} />
            </button>
          )}
          {onAddChild && (
            <button onClick={onAddChild} title="Add Child" className="p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-primary-600 shadow-sm border border-transparent hover:border-slate-100">
              <PlusCircle size={13} />
            </button>
          )}
          {onCopy && (
            <button onClick={onCopy} title="Copy Subsection" className="p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-navy-900 shadow-sm border border-transparent hover:border-slate-100">
              <Copy size={13} />
            </button>
          )}
          {onEdit && (
            <button onClick={onEdit} title="Edit" className="p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-navy-900 shadow-sm border border-transparent hover:border-slate-100">
              <Edit2 size={13} />
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} title="Delete" className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600 shadow-sm border border-transparent hover:border-red-100">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {isExpanded && children && (
        <div className="relative">
          <div className="absolute left-[-12px] top-0 bottom-4 w-[1px] bg-slate-100 ml-[23px]" style={{ left: `${level * 24}px` }} />
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

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-navy-900/5 overflow-hidden">
      <div className="bg-slate-50/50 px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-black text-navy-900 tracking-[0.2em] uppercase">BOM Registry Hierarchy</h3>
          
          {selectedPartIds.size > 0 && onAddSelectedToBasket && (
            <button
              onClick={onAddSelectedToBasket}
              className="btn h-7 bg-primary-600 hover:bg-primary-700 text-white border-none text-[10px] px-3 font-black uppercase tracking-wider shadow-sm animate-in zoom-in duration-200"
            >
              <ShoppingCart className="w-3 h-3 mr-1.5" />
              Add Selected ({selectedPartIds.size})
            </button>
          )}
        </div>
      </div>

      <div className="p-8">
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
                    <div className="mt-1">
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
                          onSelect={(checked) => {
                            const ids = sub.parts.map((p: any) => p.id)
                            onToggleSelectAll(ids)
                          }}
                        >
                          <SortableContext 
                            items={sub.parts.map((part: any) => `part-${part.id}`) || []} 
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="mt-1">
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
