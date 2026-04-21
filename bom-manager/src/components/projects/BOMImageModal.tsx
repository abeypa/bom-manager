/**
 * BOMImageModal — Reusable image viewer/uploader for Sections, Subsections, and Parts.
 *
 * Features:
 * - View existing image in full-size modal with zoom
 * - Upload new image via file picker, drag-and-drop, or clipboard paste
 * - Uses existing Supabase Storage (bom_assets bucket)
 * - Returns the public URL via onSave callback
 */
import { useState, useRef, useCallback } from 'react'
import { X, Upload, Image as ImageIcon, Clipboard, Trash2, ZoomIn, ZoomOut, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface BOMImageModalProps {
  isOpen: boolean
  onClose: () => void
  currentImageUrl: string | null
  entityType: 'section' | 'subsection' | 'part'
  entityName: string
  onSave: (imageUrl: string | null) => Promise<void>
}

export default function BOMImageModal({
  isOpen,
  onClose,
  currentImageUrl,
  entityType,
  entityName,
  onSave,
}: BOMImageModalProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zoomed, setZoomed] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  if (!isOpen) return null

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Only image files are allowed')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be under 10MB')
      return
    }
    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setError(null)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileSelect(file)
  }

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile()
        if (file) handleFileSelect(file)
        break
      }
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFileSelect(file)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => setDragOver(false), [])

  const handleUploadAndSave = async () => {
    if (!selectedFile) return

    setUploading(true)
    setError(null)

    try {
      const ext = selectedFile.name.split('.').pop() || 'png'
      const fileName = `${entityType}/${Math.random().toString(36).substring(2)}-${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('bom_assets')
        .upload(fileName, selectedFile, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('bom_assets')
        .getPublicUrl(fileName)

      await onSave(publicUrl)
      setSelectedFile(null)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleRemoveImage = async () => {
    if (!confirm('Remove this image?')) return
    setUploading(true)
    try {
      await onSave(null)
      setPreviewUrl(null)
      setSelectedFile(null)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to remove image')
    } finally {
      setUploading(false)
    }
  }

  const entityLabel = entityType.charAt(0).toUpperCase() + entityType.slice(1)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-navy-900/60 backdrop-blur-sm">
      <div
        className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200"
        onPaste={handlePaste}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-navy-900 rounded-xl shadow-lg">
              <ImageIcon className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-black text-navy-900 tracking-tight">
                {entityLabel} Image
              </h2>
              <p className="text-[9px] font-bold text-tertiary uppercase tracking-widest truncate max-w-[200px]">
                {entityName}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-icon btn-ghost">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Image Preview / Drop Zone */}
          {previewUrl ? (
            <div className="relative group">
              <div
                className={`relative bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden transition-all ${
                  zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'
                }`}
                onClick={() => setZoomed(!zoomed)}
              >
                <img
                  src={previewUrl}
                  alt={entityName}
                  className={`w-full transition-transform duration-300 ${
                    zoomed ? 'scale-150 origin-center' : 'max-h-80 object-contain mx-auto'
                  }`}
                />
              </div>
              {/* Zoom indicator */}
              <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-lg px-2 py-1 shadow-sm border border-slate-100">
                {zoomed ? <ZoomOut size={12} /> : <ZoomIn size={12} />}
                <span className="text-[8px] font-black text-slate-500 uppercase">{zoomed ? 'Zoom Out' : 'Zoom In'}</span>
              </div>
            </div>
          ) : (
            <div
              ref={dropZoneRef}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all ${
                dragOver
                  ? 'border-navy-400 bg-navy-50/50 scale-[1.02]'
                  : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
              }`}
            >
              <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm border border-slate-100">
                <Upload size={24} className="text-slate-300" />
              </div>
              <p className="text-sm font-bold text-navy-900 mb-1">Drop image here</p>
              <p className="text-[10px] text-tertiary font-bold">
                or click below • paste from clipboard (Ctrl+V)
              </p>
            </div>
          )}

          {/* File Picker */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleInputChange}
            className="hidden"
          />

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn btn-secondary flex-1 flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest"
            >
              <Upload size={13} />
              Browse File
            </button>
            <button
              onClick={() => {
                navigator.clipboard.read().then(items => {
                  for (const item of items) {
                    const imageType = item.types.find(t => t.startsWith('image/'))
                    if (imageType) {
                      item.getType(imageType).then(blob => {
                        const file = new File([blob], `paste-${Date.now()}.png`, { type: imageType })
                        handleFileSelect(file)
                      })
                    }
                  }
                }).catch(() => {
                  setError('Clipboard access denied. Try Ctrl+V instead.')
                })
              }}
              className="btn btn-secondary flex items-center gap-2 text-[10px] uppercase tracking-widest"
            >
              <Clipboard size={13} />
              Paste
            </button>
            {(previewUrl || currentImageUrl) && (
              <button
                onClick={handleRemoveImage}
                disabled={uploading}
                className="btn btn-secondary flex items-center gap-2 text-[10px] uppercase tracking-widest text-red-500 hover:text-red-600 hover:bg-red-50"
              >
                <Trash2 size={13} />
                Remove
              </button>
            )}
          </div>

          {/* Selected file info */}
          {selectedFile && (
            <div className="flex items-center gap-3 p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl">
              <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                <ImageIcon size={14} className="text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-navy-900 truncate">{selectedFile.name}</p>
                <p className="text-[9px] text-tertiary font-bold">{(selectedFile.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs font-bold text-red-600">
              {error}
            </div>
          )}

          {/* Save / Cancel */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="btn btn-secondary flex-1 uppercase tracking-widest text-[10px]"
            >
              Cancel
            </button>
            {selectedFile && (
              <button
                onClick={handleUploadAndSave}
                disabled={uploading}
                className="btn btn-primary btn-lg flex-[2] text-[10px] tracking-[0.15em] disabled:opacity-40"
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    UPLOAD & SAVE
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
