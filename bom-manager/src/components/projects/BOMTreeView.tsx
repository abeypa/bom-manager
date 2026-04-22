import React, { useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { 
  GripVertical, 
  ChevronRight, 
  ChevronDown, 
  Layers, 
  Package, 
  Puzzle,
  Edit2,
  Trash2,
  Copy,
  PlusCircle,
  ImageIcon
} from 'lucide-react'
import { projectsApi } from '@/api/projects'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/context/ToastContext'

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
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    marginLeft: `${level * 24}px`,
  }

  const getIcon = () => {
    switch (type) {
      case 'section': return <Layers className="h-4 w-4 text-navy-600" />
      case 'subsection': return <Package className="h-4 w-4 text-emerald-600" />
      case 'part': return <Puzzle className="h-4 w-4 text-amber-600" />
    }
  }

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <div className="flex items-center gap-2 py-2 px-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100 mb-1">
        <div 
          {...attributes} 
          {...listeners} 
          className="p-1 text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <GripVertical size={14} />
        </div>

        {type !== 'part' && (
          <button 
            onClick={onToggle}
            className="p-1 hover:bg-slate-200 rounded text-slate-400 transition-colors"
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
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
            <span className={`text-sm tracking-tight truncate ${type === 'section' ? 'font-black text-navy-900 uppercase' : 'font-bold text-slate-700'}`}>
              {label}
            </span>
            {type === 'part' && (
              <span className="text-[10px] font-mono text-slate-400">
                {data.part_ref?.part_number || 'No PN'} • QTY: {data.quantity}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pr-2">
          {onImageClick && (
            <button onClick={onImageClick} className="p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-amber-500 shadow-sm border border-transparent hover:border-slate-100">
              <ImageIcon size={13} />
            </button>
          )}
          {onAddChild && (
            <button onClick={onAddChild} className="p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-primary-600 shadow-sm border border-transparent hover:border-slate-100">
              <PlusCircle size={13} />
            </button>
          )}
          {onCopy && (
            <button onClick={onCopy} className="p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-navy-900 shadow-sm border border-transparent hover:border-slate-100">
              <Copy size={13} />
            </button>
          )}
          {onEdit && (
            <button onClick={onEdit} className="p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-navy-900 shadow-sm border border-transparent hover:border-slate-100">
              <Edit2 size={13} />
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600 shadow-sm border border-transparent hover:border-red-100">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {isExpanded && children && (
        <div className="relative">
          {/* Vertical connection line */}
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
}

export default function BOMTreeView({
  project,
  projectId,
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
  onToggleSelectAll
}: BOMTreeViewProps) {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(project.sections?.map((s: any) => `section-${s.id}`)))

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const reorderSections = useMutation({
    mutationFn: (ids: number[]) => projectsApi.reorderSections(projectId, ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project', projectId] }),
  })

  const moveSubsection = useMutation({
    mutationFn: ({ subId, targetSectionId, newOrder }: { subId: number, targetSectionId: number, newOrder: number[] }) => 
      projectsApi.reorderSubsections(targetSectionId, newOrder),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project', projectId] }),
  })

  const movePart = useMutation({
    mutationFn: ({ partId, targetSubId, newOrder }: { partId: number, targetSubId: number, newOrder: number[] }) => 
      projectsApi.reorderProjectParts(targetSubId, newOrder),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project', projectId] }),
  })

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = active.id.toString()
    const overId = over.id.toString()

    // 1. Reordering Sections
    if (activeId.startsWith('section-') && overId.startsWith('section-')) {
      const activeDataId = parseInt(activeId.split('-')[1])
      const overDataId = parseInt(overId.split('-')[1])
      const oldIndex = project.sections.findIndex((s: any) => s.id === activeDataId)
      const newIndex = project.sections.findIndex((s: any) => s.id === overDataId)
      const newSections = arrayMove(project.sections, oldIndex, newIndex)
      await reorderSections.mutateAsync(newSections.map((s: any) => s.id))
      showToast('success', 'Section order updated')
    }

    // 2. Reordering/Moving Subsections
    if (activeId.startsWith('sub-') && (overId.startsWith('sub-') || overId.startsWith('section-'))) {
      const subId = parseInt(activeId.split('-')[1])
      let targetSectionId: number
      let newIndex: number

      if (overId.startsWith('section-')) {
        targetSectionId = parseInt(overId.split('-')[1])
        newIndex = 0 // Drop at start of section
      } else {
        const overSubId = parseInt(overId.split('-')[1])
        const targetSub = project.sections.flatMap((s: any) => s.subsections).find((s: any) => s.id === overSubId)
        targetSectionId = targetSub.section_id
        const section = project.sections.find((s: any) => s.id === targetSectionId)
        newIndex = section.subsections.findIndex((s: any) => s.id === overSubId)
      }

      const currentSection = project.sections.find((s: any) => s.subsections.some((sub: any) => sub.id === subId))
      const targetSection = project.sections.find((s: any) => s.id === targetSectionId)
      
      let newSubOrder = [...targetSection.subsections]
      const oldIndex = newSubOrder.findIndex(s => s.id === subId)
      
      if (oldIndex !== -1) {
        // Move within same section
        newSubOrder = arrayMove(newSubOrder, oldIndex, newIndex)
      } else {
        // Move to different section
        const subToMove = currentSection.subsections.find((s: any) => s.id === subId)
        newSubOrder.splice(newIndex, 0, subToMove)
      }

      await moveSubsection.mutateAsync({ 
        subId, 
        targetSectionId, 
        newOrder: newSubOrder.map(s => s.id) 
      })
      showToast('success', 'Subsection moved')
    }

    // 3. Reordering/Moving Parts
    if (activeId.startsWith('part-') && (overId.startsWith('part-') || overId.startsWith('sub-'))) {
      const partId = parseInt(activeId.split('-')[1])
      let targetSubId: number
      let newIndex: number

      if (overId.startsWith('sub-')) {
        targetSubId = parseInt(overId.split('-')[1])
        newIndex = 0
      } else {
        const overPartId = parseInt(overId.split('-')[1])
        const targetPart = project.sections.flatMap((s: any) => s.subsections).flatMap((sub: any) => sub.parts).find((p: any) => p.id === overPartId)
        targetSubId = targetPart.project_section_id
        const subsection = project.sections.flatMap((s: any) => s.subsections).find((sub: any) => sub.id === targetSubId)
        newIndex = subsection.parts.findIndex((p: any) => p.id === overPartId)
      }

      const currentSub = project.sections.flatMap((s: any) => s.subsections).find((sub: any) => sub.parts.some((p: any) => p.id === partId))
      const targetSub = project.sections.flatMap((s: any) => s.subsections).find((sub: any) => sub.id === targetSubId)

      let newPartOrder = [...targetSub.parts]
      const oldIndex = newPartOrder.findIndex(p => p.id === partId)

      if (oldIndex !== -1) {
        newPartOrder = arrayMove(newPartOrder, oldIndex, newIndex)
      } else {
        const partToMove = currentSub.parts.find((p: any) => p.id === partId)
        newPartOrder.splice(newIndex, 0, partToMove)
      }

      await movePart.mutateAsync({ 
        partId, 
        targetSubId, 
        newOrder: newPartOrder.map(p => p.id) 
      })
      showToast('success', 'Part moved')
    }
  }

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-navy-900/5 overflow-hidden">
      <div className="bg-slate-50/50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-xs font-black text-navy-900 tracking-[0.2em] uppercase">BOM Registry Hierarchy</h3>
        <div className="flex gap-2">
          <button 
            onClick={() => {
              const allIds = project.sections.flatMap((s: any) => [
                `section-${s.id}`,
                ...s.subsections.map((sub: any) => `sub-${sub.id}`)
              ])
              setExpandedNodes(new Set(allIds))
            }}
            className="text-[9px] font-black text-primary-600 uppercase tracking-widest hover:underline"
          >
            Expand All
          </button>
          <button 
            onClick={() => setExpandedNodes(new Set())}
            className="text-[9px] font-black text-slate-400 uppercase tracking-widest hover:underline"
          >
            Collapse All
          </button>
        </div>
      </div>

      <div className="p-6">
        <SortableContext 
          items={project.sections.map((s: any) => `section-${s.id}`)} 
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1">
            {project.sections.map((section: any) => (
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
                  items={section.subsections.map((sub: any) => `sub-${sub.id}`)} 
                  strategy={verticalListSortingStrategy}
                >
                  <div className="mt-1">
                    {section.subsections.map((sub: any) => (
                      <TreeItem
                        key={`sub-${sub.id}`}
                        id={`sub-${sub.id}`}
                        level={1}
                        label={sub.name || sub.section_name}
                        type="subsection"
                        data={sub}
                        isExpanded={expandedNodes.has(`sub-${sub.id}`)}
                        onToggle={() => toggleNode(`sub-${sub.id}`)}
                        onEdit={() => onEditSubsection(sub)}
                        onDelete={() => onDeleteSubsection(sub.id)}
                        onCopy={() => onCopySubsection(sub)}
                        onAddChild={() => onAddPart(sub)}
                        onImageClick={() => onImageClick(sub, 'subsection')}
                        isSelected={sub.parts.every((p: any) => selectedPartIds.has(p.id)) && sub.parts.length > 0}
                        onSelect={(checked) => {
                          const ids = sub.parts.map((p: any) => p.id)
                          onToggleSelectAll(ids)
                        }}
                      >
                        <SortableContext 
                          items={sub.parts.map((part: any) => `part-${part.id}`)} 
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
      </div>
    </div>
  )
}
