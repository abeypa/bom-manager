import { resolvePartType } from '@/utils/partTypeUtils'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, Edit2, Check, X, ImageIcon, ArrowUpDown, Clock, CheckCircle2, Package, ShoppingCart, GripVertical, AlertTriangle, ShoppingBag } from 'lucide-react'
import { projectsApi } from '@/api/projects'
import { useToast } from '@/context/ToastContext'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { useDraggable } from '@dnd-kit/core'

interface BOMPartsTableProps {
  parts: any[]
  projectId: number
  isLoading?: boolean
  selectedPartIds: Set<number>
  onToggleSelectPart: (id: number) => void
  onToggleSelectAll: (ids: number[]) => void
  onEditPart: (part: any) => void
  onDeletePart: (partId: number) => void
  onImageClick?: (entity: any, type: 'section' | 'subsection' | 'part') => void
}

const DraggableRow = ({ 
  part, 
  density, 
  selectedPartIds, 
  onToggleSelectPart, 
  onImageClick, 
  onEditPart, 
  onDeletePart,
  editingCell,
  tempValue,
  setTempValue,
  saveEdit,
  cancelEdit,
  startEditing,
  updatePartMutation,
  renderPOStatus
}: any) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `part-${part.id}`,
    data: part
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  const { type, ref } = resolvePartType(part)
  const quantity = part.quantity || 0
  const unitPrice = part.unit_price || 0
  const discount = part.discount_percent || 0
  const total = quantity * unitPrice * (1 - (discount / 100))
  const isEditingQty = editingCell?.partId === part.id && editingCell?.field === 'quantity'
  const isEditingPrice = editingCell?.partId === part.id && editingCell?.field === 'unit_price'

  return (
    <tr 
      ref={setNodeRef} 
      style={style}
      className={`table-row-hover group transition-colors ${isDragging ? 'opacity-30 border-2 border-primary-500 border-dashed bg-primary-50/10' : ''}`}
    >
      <td className={`text-center ${density === 'compact' ? 'py-1' : 'py-3'}`}>
        <div className="flex items-center justify-center gap-1">
          <div 
            {...listeners} 
            {...attributes} 
            className="cursor-grab active:cursor-grabbing p-1 text-slate-300 hover:text-navy-900 transition-colors"
            title="Drag to Basket"
          >
            <GripVertical size={14} />
          </div>
          <input 
            type="checkbox" 
            className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
            checked={selectedPartIds.has(part.id)}
            onChange={() => onToggleSelectPart(part.id)}
            aria-label={`Select part ${part.part_ref || part.id}`}
          />
        </div>
      </td>
      <td className={`px-6 ${density === 'compact' ? 'py-1' : 'py-3'}`}>
        <div className="flex items-center gap-2.5">
          {/* Part image thumbnail */}
          <button
            onClick={() => onImageClick?.(part, 'part')}
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all border ${
              part.part_ref?.image_path
                ? 'overflow-hidden border-slate-200 hover:border-navy-400 shadow-sm'
                : 'border-dashed border-slate-200 hover:border-slate-400 text-slate-300 hover:text-slate-500'
            }`}
            title={part.part_ref?.image_path ? 'View image' : 'Add image'}
          >
            {part.part_ref?.image_path ? (
              <img src={part.part_ref.image_path} alt="" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon size={12} />
            )}
          </button>
          <span className="font-mono text-xs tracking-wider text-slate-500">
            {typeof part.part_ref === 'object' ? part.part_ref?.part_number : part.part_ref || ref}
          </span>
        </div>
      </td>
      <td className={`px-6 ${density === 'compact' ? 'py-1' : 'py-3'}`}>
        <div className="flex flex-col gap-0.5 max-w-md">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight truncate">
            {part.part_ref?.manufacturer_part_number || 'N/A'}
          </span>
          <span className="font-semibold text-navy-900 leading-tight">
            {part.description || part.part_ref?.description}
          </span>
        </div>
      </td>
      <td className={`px-6 ${density === 'compact' ? 'py-1' : 'py-3'}`}>
        {renderPOStatus(part)}
      </td>
      <td className={`px-6 ${density === 'compact' ? 'py-1' : 'py-3'}`}>
        <span className={`badge-${type.toLowerCase().replace(/[^a-z]/g, '')} px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-tighter`}>
          {type}
        </span>
      </td>
      
      {/* Quantity - Inline Editable */}
      <td className={`text-right px-6 ${density === 'compact' ? 'py-1' : 'py-3'}`}>
        {isEditingQty ? (
          <div className="flex items-center justify-end gap-1">
            <input
              type="number"
              value={tempValue}
              onChange={(e) => setTempValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit(part.id)
                if (e.key === 'Escape') cancelEdit()
              }}
              className="w-16 text-right border border-primary-400 focus:outline-none focus:border-primary-600 rounded px-2 py-0.5 text-sm m-0"
              autoFocus
              aria-label="Edit quantity"
            />
            <button onClick={() => saveEdit(part.id)} className="text-emerald-600 hover:bg-emerald-50 rounded p-0.5"><Check className="h-4 w-4" /></button>
            <button onClick={cancelEdit} className="text-red-500 hover:bg-red-50 rounded p-0.5"><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <span onClick={() => startEditing(part, 'quantity')} className="cursor-pointer hover:text-primary-600 tabular-nums font-bold text-navy-900 border-b border-dashed border-gray-300 transition-colors">
            {quantity}
          </span>
        )}
      </td>

      {/* Unit Price - Inline Editable */}
      <td className={`text-right px-6 ${density === 'compact' ? 'py-1' : 'py-3'}`}>
        {isEditingPrice ? (
          <div className="flex items-center justify-end gap-1">
            <span className="text-slate-400 text-xs">₹</span>
            <input
              type="number"
              value={tempValue}
              onChange={(e) => setTempValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit(part.id)
                if (e.key === 'Escape') cancelEdit()
              }}
              className="w-24 text-right border border-primary-400 focus:outline-none focus:border-primary-600 rounded px-2 py-0.5 text-sm m-0"
              autoFocus
              aria-label="Edit unit price"
            />
            <button onClick={() => saveEdit(part.id)} className="text-emerald-600 hover:bg-emerald-50 rounded p-0.5"><Check className="h-4 w-4" /></button>
            <button onClick={cancelEdit} className="text-red-500 hover:bg-red-50 rounded p-0.5"><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1.5">
              {part.part_ref?.base_price !== undefined && Math.abs(unitPrice - part.part_ref.base_price) > 0.01 && (
                <button 
                  onClick={() => updatePartMutation.mutate({ id: part.id, unit_price: part.part_ref.base_price })}
                  className="bg-amber-500 p-0.5 rounded text-white shadow-sm hover:bg-emerald-500 transition-colors animate-in zoom-in-50"
                  title={`Price deviation! Latest: ₹${part.part_ref.base_price}. Click to sync.`}
                >
                  <ArrowUpDown className="h-2 w-2" />
                </button>
              )}
              <span onClick={() => startEditing(part, 'unit_price')} className={`cursor-pointer hover:text-primary-600 tabular-nums text-sm border-b border-dashed transition-colors ${
                part.part_ref?.base_price !== undefined && Math.abs(unitPrice - part.part_ref.base_price) > 0.01 
                  ? 'text-amber-600 border-amber-300 font-bold' 
                  : 'text-slate-500 border-gray-300'
              }`}>
                {unitPrice > 0 ? `₹${unitPrice.toLocaleString('en-IN')}` : '—'}
              </span>
            </div>
            {discount > 0 && (
              <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md mt-1 animate-in fade-in slide-in-from-top-1">
                -{discount}%
              </span>
            )}
          </div>
        )}
      </td>

      <td className={`text-right px-6 ${density === 'compact' ? 'py-1' : 'py-3'}`}>
        <div className="flex flex-col items-end">
          {discount > 0 && (
            <span className="text-[10px] text-gray-400 line-through tabular-nums decoration-red-300">
              ₹{(quantity * unitPrice).toLocaleString('en-IN')}
            </span>
          )}
          <span className="font-black tabular-nums text-primary-600">
            {total > 0 ? `₹${total.toLocaleString('en-IN')}` : '—'}
          </span>
        </div>
      </td>
      <td className={`px-6 ${density === 'compact' ? 'py-1' : 'py-3'}`}>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEditPart(part)}
            className="p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-navy-900 border border-transparent hover:border-slate-100 shadow-sm"
            title="Edit part details"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDeletePart(part.id)}
            className="p-1.5 hover:bg-red-50 rounded-lg text-red-300 hover:text-red-500 border border-transparent hover:border-red-100 shadow-sm"
            title="Delete part"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
};

const BOMPartsTable = ({ 
  parts, 
  projectId, 
  isLoading = false,
  selectedPartIds,
  onToggleSelectPart,
  onToggleSelectAll,
  onEditPart,
  onDeletePart,
  onImageClick,
}: BOMPartsTableProps) => {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [editingCell, setEditingCell] = useState<{ partId: number; field: 'quantity' | 'unit_price' } | null>(null)
  const [tempValue, setTempValue] = useState('')
  const [density, setDensity] = useState<'compact' | 'comfortable'>('comfortable')

  const renderPOStatus = (part: any) => {
    const poInfo = part.po_info;
    
    return (
      <div className="flex flex-col gap-1.5 min-w-[100px]">
        {/* EXACT PATTERN START */}
        <Tooltip key={part.id}>
          <TooltipTrigger asChild>
            <div className="flex flex-col gap-1.5 cursor-help">
              {/* PO Status Badge */}
              {poInfo ? (
                <Badge 
                  variant={poInfo.status === 'Draft' ? 'warning' : 'success'}
                  className="gap-1.5 px-2 text-[9px] font-black uppercase tracking-wider w-fit"
                >
                  {poInfo.status === 'Draft' ? <Clock size={10} /> : <CheckCircle2 size={10} />}
                  <span>{poInfo.status === 'Draft' ? 'PENDING PO' : 'RELEASED'}</span>
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1.5 px-2 text-[9px] font-black uppercase tracking-wider w-fit opacity-40">
                  <ShoppingBag size={10} />
                  <span>ORDERING</span>
                </Badge>
              )}

              {/* Stock / Arrival Status Badge */}
              {(() => {
                const requiredQty = part.quantity || 0;
                const isFullyReceived = poInfo && (poInfo.received_qty || 0) >= requiredQty;
                const isMasterAvailable = !poInfo && (part.part_ref?.stock_quantity || 0) >= requiredQty;
                const isInStock = isFullyReceived || isMasterAvailable;

                return (
                  <Badge 
                    variant={isInStock ? 'success' : 'destructive'}
                    className="gap-1.5 px-2 text-[9px] font-black uppercase tracking-wider w-fit"
                  >
                    {isInStock ? <Package size={10} /> : <AlertTriangle size={10} />}
                    <span>{isInStock ? 'ARRIVED' : 'NOT ARRIVED'}</span>
                  </Badge>
                )
              })()}
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs bg-white border-slate-200 shadow-xl p-3 rounded-2xl animate-in fade-in zoom-in duration-200">
            <div className="space-y-1 text-xs">
              <div className="font-bold text-navy-900 mb-1 tracking-wider uppercase text-[9px] opacity-50">Status Intelligence</div>
              <div>PO Number: <span className="font-bold text-navy-600">#{poInfo?.po_number || 'N/A'}</span></div>
              <div>Received for Project: <span className="font-bold text-slate-700">{poInfo?.received_qty || 0} / {part.quantity}</span></div>
              <div>System Status: <span className="capitalize font-bold text-slate-700">{poInfo?.status || 'No PO'}</span></div>
            </div>
          </TooltipContent>
        </Tooltip>
        {/* EXACT PATTERN END */}
      </div>
    );
  };

  const updatePartMutation = useMutation({
    mutationFn: (payload: { id: number; quantity?: number; unit_price?: number }) =>
      projectsApi.updatePartInSection(payload.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project'] })
      showToast('success', 'Part updated successfully') 
      setEditingCell(null)
    },
    onError: () => showToast('error', 'Failed to update part'),
  })

  const startEditing = (part: any, field: 'quantity' | 'unit_price') => {
    setEditingCell({ partId: part.id, field })
    setTempValue(field === 'quantity' ? part.quantity?.toString() || '' : part.unit_price?.toString() || '')
  }

  const saveEdit = (partId: number) => {
    if (!tempValue || !editingCell) return
    const value = parseFloat(tempValue)
    if (isNaN(value)) return

    const payload = editingCell.field === 'quantity'
      ? { id: partId, quantity: value }
      : { id: partId, unit_price: value }

    updatePartMutation.mutate(payload)
  }

  const cancelEdit = () => setEditingCell(null)

  const toggleSelectAll = () => {
    onToggleSelectAll(parts.map(p => p.id))
  }

  const toggleSelectPart = (id: number) => {
    onToggleSelectPart(id)
  }

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedPartIds.size} parts?`)) return
    try {
      for (const id of selectedPartIds) {
        await projectsApi.removePartFromSection(id)
      }
      queryClient.invalidateQueries({ queryKey: ['project'] })
      showToast('success', 'Parts deleted')
    } catch (e: any) {
      showToast('error', e.message)
    }
  }

  const handleSyncWithMaster = async () => {
    if (!selectedPartIds.size) return
    if (!confirm(`Synchronize ${selectedPartIds.size} parts with their latest master prices?`)) return
    
    try {
      showToast('info', 'Synchronizing prices...')
      for (const id of selectedPartIds) {
        const part = parts.find(p => p.id === id)
        if (part && part.part_ref?.base_price !== undefined) {
          await projectsApi.updatePartInSection(id, { unit_price: part.part_ref.base_price })
        }
      }
      queryClient.invalidateQueries({ queryKey: ['project'] })
      showToast('success', 'Prices synchronized with master')
    } catch (e: any) {
      showToast('error', 'Failed to sync prices: ' + e.message)
    }
  }

  if (isLoading) {
    return (
      <div className="px-5 py-8 space-y-2">
        <div className="skeleton h-10 w-full rounded-lg" />
        <div className="skeleton h-10 w-full rounded-lg" />
        <div className="skeleton h-10 w-full rounded-lg" />
      </div>
    )
  }

  if (!parts.length) {
    return (
      <div className="px-5 py-12 text-center text-gray-400 text-sm flex flex-col items-center">
        <div className="text-4xl mb-4 bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center border border-gray-100 shadow-inner">📦</div>
        <p className="font-medium">No parts in this subsection yet</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2 h-7">
          {selectedPartIds.size > 0 && (
            <>
              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{selectedPartIds.size} selected</span>
              <button onClick={handleBulkDelete} className="text-xs text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded-md font-medium transition-colors">Bulk Delete</button>
              <button 
                onClick={handleSyncWithMaster}
                className="text-xs text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-md font-medium transition-colors flex items-center gap-1"
                title="Sync selected parts with latest master prices"
              >
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                Sync with Master
              </button>
            </>
          )}
        </div>
        <div className="table-density-toggle">
          <button onClick={() => setDensity('compact')} className={`text-xs px-2 py-1 rounded ${density === 'compact' ? 'bg-slate-200 font-bold' : 'text-slate-500'}`}>Compact</button>
          <button onClick={() => setDensity('comfortable')} className={`text-xs px-2 py-1 rounded ${density === 'comfortable' ? 'bg-slate-200 font-bold' : 'text-slate-500'}`}>Comfortable</button>
        </div>
      </div>
      <div className="responsive-table-wrapper">
        <TooltipProvider delayDuration={0}>
        <table className="data-table-modern w-full">
          <thead>
            <tr>
              <th className={`w-10 text-center ${density === 'compact' ? 'py-1' : 'py-3'}`}>
                <input 
                  type="checkbox" 
                  className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                  checked={parts.length > 0 && parts.every(p => selectedPartIds.has(p.id))}
                  onChange={toggleSelectAll}
                  aria-label="Select all parts"
                />
              </th>
              <th className={`w-28 text-left px-6 ${density === 'compact' ? 'py-1' : 'py-3'}`}>Part Ref</th>
              <th className={`text-left px-6 ${density === 'compact' ? 'py-1' : 'py-3'}`}>Description</th>
              <th className={`w-36 text-left px-6 ${density === 'compact' ? 'py-1' : 'py-3'}`}>Procurement</th>
              <th className={`w-24 text-left px-6 ${density === 'compact' ? 'py-1' : 'py-3'}`}>Type</th>
              <th className={`w-20 text-right px-6 ${density === 'compact' ? 'py-1' : 'py-3'}`}>Qty</th>
              <th className={`w-32 text-right px-6 ${density === 'compact' ? 'py-1' : 'py-3'}`}>Unit Price</th>
              <th className={`w-32 text-right px-6 ${density === 'compact' ? 'py-1' : 'py-3'}`}>Total</th>
              <th className={`w-16 px-6 ${density === 'compact' ? 'py-1' : 'py-3'}`}></th>
            </tr>
          </thead>
          <tbody className="table-row-stripe">
          {parts.map((part: any) => (
            <DraggableRow
              key={part.id}
              part={part}
              density={density}
              selectedPartIds={selectedPartIds}
              onToggleSelectPart={onToggleSelectPart}
              onImageClick={onImageClick}
              onEditPart={onEditPart}
              onDeletePart={onDeletePart}
              editingCell={editingCell}
              tempValue={tempValue}
              setTempValue={setTempValue}
              saveEdit={saveEdit}
              cancelEdit={cancelEdit}
              startEditing={startEditing}
              updatePartMutation={updatePartMutation}
              renderPOStatus={renderPOStatus}
            />
          ))}
          </tbody>
        </table>
        </TooltipProvider>
      </div>
    </div>
  )
}

export default BOMPartsTable
