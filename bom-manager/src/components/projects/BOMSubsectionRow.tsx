import { Trash2, PlusCircle, Copy, ImageIcon } from 'lucide-react'
import BOMPartsTable from './BOMPartsTable'

interface BOMSubsectionRowProps {
  subsection: any
  projectId: number
  selectedPartIds: Set<number>
  onToggleSelectPart: (id: number) => void
  onToggleSelectAll: (ids: number[]) => void
  onAddPart: () => void
  onEditSubsection: () => void
  onDeleteSubsection: () => void
  onCopySubsection: (subsection: any) => void
  onEditPart: (partId: any) => void
  onDeletePart: (partId: number) => void
  onImageClick?: (entity: any, type: 'section' | 'subsection' | 'part') => void
}

const BOMSubsectionRow = ({
  subsection,
  projectId,
  selectedPartIds,
  onToggleSelectPart,
  onToggleSelectAll,
  onAddPart,
  onEditSubsection,
  onDeleteSubsection,
  onCopySubsection,
  onEditPart,
  onDeletePart,
  onImageClick,
}: BOMSubsectionRowProps) => {
  return (
    <div className="subsection-row rounded-2xl mb-8 border border-slate-100 shadow-sm transition-all hover:shadow-md bg-white">
      {/* Subsection Header */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-3 bg-white border-b border-slate-50">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex-shrink-0">
            <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
            <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-25" />
          </div>
          {/* Subsection image thumbnail */}
          {subsection.image_path && (
            <button
              onClick={() => onImageClick?.(subsection, 'subsection')}
              className="w-8 h-8 rounded-lg overflow-hidden border border-slate-200 hover:border-navy-400 transition-all shrink-0 shadow-sm"
              title="View image"
            >
              <img src={subsection.image_path} alt="" className="w-full h-full object-cover" />
            </button>
          )}
          <div className="min-w-0">
            <h4 
              className="font-black text-navy-900 text-sm sm:text-base flex items-center gap-2 sm:gap-4 cursor-pointer hover:text-primary-600 transition-colors"
              onClick={onEditSubsection}
            >
              <span className="truncate">{subsection.name || subsection.section_name || 'Unnamed Subsection'}</span>
              <span className="flex-shrink-0 px-2 sm:px-3 py-0.5 text-[10px] font-black tracking-widest uppercase bg-slate-50 text-slate-400 rounded-lg border border-slate-100">
                {subsection.parts?.length || 0} ITEMS
              </span>
            </h4>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onAddPart}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-600 hover:text-white hover:bg-primary-600 rounded-lg transition-all border border-primary-200 hover:border-primary-700"
          >
            <PlusCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Add item</span>
            <span className="sm:hidden">Add</span>
          </button>

          <div className="flex items-center gap-1 pl-2 ml-2 border-l border-slate-200">
            <button
              onClick={() => onImageClick?.(subsection, 'subsection')}
              className={`p-1.5 rounded-lg transition-colors ${subsection.image_path ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-50' : 'text-slate-400 hover:text-navy-900 hover:bg-slate-100'}`}
              title={subsection.image_path ? 'View/Change Image' : 'Add Image'}
            >
              <ImageIcon className="h-4 w-4" />
            </button>

            <button
              onClick={() => onCopySubsection(subsection)}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-navy-900 transition-colors"
              title="Duplicate subsection"
            >
              <Copy className="h-4 w-4" />
            </button>

            <button
              onClick={onDeleteSubsection}
              className="p-1.5 hover:bg-red-50 rounded-lg text-red-400 hover:text-red-600 transition-colors"
              title="Delete subsection"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Parts Table */}
      <BOMPartsTable 
        parts={subsection.parts || []} 
        projectId={projectId} 
        selectedPartIds={selectedPartIds}
        onToggleSelectPart={onToggleSelectPart}
        onToggleSelectAll={onToggleSelectAll}
        onEditPart={onEditPart}
        onDeletePart={onDeletePart}
        onImageClick={onImageClick}
      />
    </div>
  )
}

export default BOMSubsectionRow
