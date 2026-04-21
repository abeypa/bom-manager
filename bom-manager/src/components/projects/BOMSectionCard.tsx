import { useState } from 'react'
import { ChevronDown, ChevronUp, Trash2, PlusCircle, Copy, Edit2, ImageIcon } from 'lucide-react'
import BOMSubsectionRow from './BOMSubsectionRow'

interface BOMSectionCardProps {
  section: any
  projectId: number
  collapsed: boolean
  selectedPartIds: Set<number>
  onToggleSelectPart: (id: number) => void
  onToggleSelectAll: (ids: number[]) => void
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onAddSubsection: () => void
  onCopySubsection: (subsection: any) => void
  onAddPart: (subsection: any) => void
  onEditSubsection: (subsection: any) => void
  onDeleteSubsection: (subsectionId: number) => void
  onEditPart: (part: any) => void
  onDeletePart: (partId: number) => void
  onImageClick?: (entity: any, type: 'section' | 'subsection' | 'part') => void
}

const BOMSectionCard = ({
  section,
  projectId,
  collapsed,
  selectedPartIds,
  onToggleSelectPart,
  onToggleSelectAll,
  onToggle,
  onEdit,
  onDelete,
  onAddSubsection,
  onCopySubsection,
  onAddPart,
  onEditSubsection,
  onDeleteSubsection,
  onEditPart,
  onDeletePart,
  onImageClick,
}: BOMSectionCardProps) => {

  return (
    <div className="section-card mb-6">
      {/* Dark Header */}
      <div className="section-card-header group flex items-center justify-between cursor-pointer px-6 py-4" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <button className="text-white/80 hover:text-white" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
            {collapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
          </button>
          {/* Section image thumbnail */}
          {section.image_path && (
            <button
              onClick={(e) => { e.stopPropagation(); onImageClick?.(section, 'section') }}
              className="w-7 h-7 rounded-lg overflow-hidden border border-white/20 hover:border-white/60 transition-all shrink-0"
              title="View image"
            >
              <img src={section.image_path} alt="" className="w-full h-full object-cover" />
            </button>
          )}
          <h3 className="font-semibold text-white">{section.name}</h3>
          <span className="text-xs bg-white/20 text-white px-2.5 py-0.5 rounded-full">
            {section.subsections?.length || 0} subsections
          </span>
        </div>

        <div className="action-group flex items-center gap-1 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onImageClick?.(section, 'section') }}
            className={`p-1 rounded-lg hover:bg-white/10 transition-colors ${section.image_path ? 'text-amber-400 hover:text-amber-300' : 'text-white/80 hover:text-white'}`}
            title={section.image_path ? 'View/Change Image' : 'Add Image'}
          >
            <ImageIcon className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit() }}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10"
            title="Edit Section"
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onCopySubsection(section) }}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10"
            title="Copy Section"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="text-white/80 hover:text-red-400 p-1 rounded-lg hover:bg-white/10"
            title="Delete Section"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {!collapsed && (
        <div className="p-5">
          {section.subsections?.map((sub: any) => (
            <BOMSubsectionRow
              key={sub.id}
              subsection={sub}
              projectId={projectId}
              selectedPartIds={selectedPartIds}
              onToggleSelectPart={onToggleSelectPart}
              onToggleSelectAll={onToggleSelectAll}
              onAddPart={() => onAddPart(sub)}
              onEditSubsection={() => onEditSubsection(sub)}
              onDeleteSubsection={() => onDeleteSubsection(sub.id)}
              onCopySubsection={onCopySubsection}
              onEditPart={onEditPart}
              onDeletePart={onDeletePart}
              onImageClick={onImageClick}
            />
          ))}

          <button
            onClick={onAddSubsection}
            className="mt-4 flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            <PlusCircle className="h-4 w-4" />
            Add new subsection
          </button>
        </div>
      )}
    </div>
  )
}

export default BOMSectionCard
