import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { projectsApi } from '@/api/projects'
import {
  ArrowLeft,
  Plus,
  Settings,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Package,
  Clock,
  User,
  Calendar,
  Layers,
  ShoppingCart,
  ShoppingBag,
  FileDown,
  Trash2,
  Edit2,
  Copy,
  PlusCircle,
  ChevronDown,
  ChevronUp,
  ClipboardList,
} from 'lucide-react'

import ProjectSectionModal from '@/components/projects/ProjectSectionModal'
import ProjectSubsectionModal from '@/components/projects/ProjectSubsectionModal'
import { ProjectAddPartModal } from '@/components/projects/ProjectAddPartModal'
import { ProjectEditPartModal } from '@/components/projects/ProjectEditPartModal'
import CreatePOFromBOMModal from '@/components/projects/CreatePOFromBOMModal'
import ProjectSectionCopyModal from '@/components/projects/ProjectSectionCopyModal'
import ProjectDocumentsTab from '@/components/projects/ProjectDocumentsTab'
import JobOrderTab from '@/components/projects/JobOrderTab'

// New modular components
import BOMSectionCard from '@/components/projects/BOMSectionCard'
import BOMTreeView from '@/components/projects/BOMTreeView'
import BOMImageModal from '@/components/projects/BOMImageModal'
import ProjectSidebar from '@/components/projects/ProjectSidebar'
import { resolvePartType } from '@/utils/partTypeUtils'
import { partsApi } from '@/api/parts'
import BOMDraggableSection from '@/components/projects/BOMDraggableSection'
import AdvancedFilterBar from '@/components/ui/AdvancedFilterBar'
import POBasket from '@/components/projects/POBasket'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'

import { purchaseOrdersApi } from '@/api/purchase-orders'
import { useRole } from '@/hooks/useRole'
import { useToast } from '@/context/ToastContext'
import exportUtils from '@/utils/export'

const ProjectDetails = () => {
  const { id } = useParams()
  const projectId = parseInt(id!)
  const { isAdmin } = useRole()
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  // ── Modal state ─────────────────────────────────────────────
  const [sectionModal, setSectionModal] = useState<{
    open: boolean
    editing: any | null
  }>({ open: false, editing: null })

  const [subsectionModal, setSubsectionModal] = useState<{
    open: boolean
    sectionId: number
    sectionName: string
    editing: any | null
  }>({ open: false, sectionId: 0, sectionName: '', editing: null })

  const [addPartModal, setAddPartModal] = useState<{
    open: boolean
    subsectionId: number
    subsectionName: string
  }>({ open: false, subsectionId: 0, subsectionName: '' })

  const [editPartModal, setEditPartModal] = useState<{
    open: boolean
    part: any | null
  }>({ open: false, part: null })

  const [poModal, setPoModal] = useState(false)
  const [copyModal, setCopyModal] = useState<{
    open: boolean
    subsectionId: number
    subsectionName: string
  } | null>(null)

  const [selectedPartIds, setSelectedPartIds] = useState<Set<number>>(new Set())
  const [activeTab, setActiveTab] = useState<'bom' | 'documents' | 'jo' | 'pos'>('bom')
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set())
  const [imageModal, setImageModal] = useState<{
    open: boolean
    entity: any | null
    type: 'section' | 'subsection' | 'part'
  }>({ open: false, entity: null, type: 'section' })

  // ── Procurement Basket state ────────────────────────────────
  const [basketOpen, setBasketOpen] = useState(false)
  const [basketItems, setBasketItems] = useState<any[]>([])
  const [activeDragItem, setActiveDragItem] = useState<any | null>(null)

  // ── Data ────────────────────────────────────────────────────
  const { data: project, isLoading, error: projectError } = useQuery<any>({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.getProject(projectId),
    retry: false,
  })

  useEffect(() => {
    if (project?.name) {
      document.title = `${project.name} | Project Registry`
    }
  }, [project?.name])

  const { data: projectPOs } = useQuery({
    queryKey: ['project-pos', projectId],
    queryFn: () => purchaseOrdersApi.getProjectPurchaseOrders(projectId),
    enabled: !!projectId,
  })

  // ── DND & Actions ───────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const updateSectionOrder = useMutation({
    mutationFn: (newOrder: number[]) => projectsApi.reorderSections(projectId, newOrder),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project', projectId] }),
  })

  const handleExport = () => {
    if (!project) return
    try {
      exportUtils.generateHTMLReport(
        project.name, 
        `PROJ-${project.project_number}`, 
        project.sections || []
      )
      showToast('success', 'BOM Export Generated')
    } catch (err: any) {
      showToast('error', 'Export failed: ' + err.message)
    }
  }

  // ── Helpers ─────────────────────────────────────────────────
  const toggleSection = (sectionId: number) => {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }

  const handleDeleteSection = async (sectionId: number) => {
    const section = project?.sections?.find((s: any) => s.id === sectionId)
    const hasSubsections = section?.subsections?.length > 0
    if (hasSubsections) {
      showToast('error', 'Cannot delete a section that contains subsections. Delete subsections first.')
      return
    }
    if (confirm('Delete this section?')) {
      try {
        await projectsApi.deleteSection(sectionId)
        queryClient.invalidateQueries({ queryKey: ['project', projectId] })
        showToast('success', 'Section deleted')
      } catch (e: any) {
        showToast('error', e.message)
      }
    }
  }

  const handleDeleteSubsection = async (subsectionId: number) => {
    if (confirm('Delete this subsection? All parts in it will be removed.')) {
      try {
        await projectsApi.deleteSubsection(subsectionId)
        queryClient.invalidateQueries({ queryKey: ['project', projectId] })
        showToast('success', 'Subsection deleted')
      } catch (e: any) {
        showToast('error', e.message)
      }
    }
  }

  const handleDeletePart = async (partId: number) => {
    if (confirm('Remove this part from the BOM?')) {
      try {
        await projectsApi.removePartFromSection(partId)
        queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      } catch (e: any) {
        showToast('error', e.message)
      }
    }
  }

  const handleEditSection = (section: any) => setSectionModal({ open: true, editing: section })
  const handleAddSubsection = (sectionId: number) => setSubsectionModal({ open: true, sectionId, sectionName: '', editing: null })
  const handleEditSubsection = (sub: any) => setSubsectionModal({ open: true, sectionId: sub.section_id, sectionName: sub.section_name, editing: sub })
  const handleCopySubsection = (sub: any) => setCopyModal({ open: true, subsectionId: sub.id, subsectionName: sub.section_name })
  const handleAddPart = (sub: any) => setAddPartModal({ open: true, subsectionId: sub.id, subsectionName: sub.section_name })
  const handleEditPart = (part: any) => setEditPartModal({ open: true, part })

  const handleImageClick = (entity: any, type: 'section' | 'subsection' | 'part') => {
    setImageModal({ open: true, entity, type })
  }

  const handleImageSave = async (imageUrl: string | null) => {
    if (!imageModal.entity) return
    const { entity, type } = imageModal
    try {
      if (type === 'section') {
        await projectsApi.updateSection(entity.id, { image_path: imageUrl } as any)
      } else if (type === 'subsection') {
        await projectsApi.updateSubsection(entity.id, { image_path: imageUrl })
      } else if (type === 'part' && entity.part_ref) {
        // Update the master part's image_path
        await partsApi.updatePart(entity.part_type, entity.part_id, { image_path: imageUrl })
      }
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      showToast('success', 'Image updated')
    } catch (err: any) {
      showToast('error', 'Failed to update image: ' + err.message)
      throw err
    }
  }
  
  const handleSelectPart = (id: number) => {
    setSelectedPartIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAll = (ids: number[]) => {
    setSelectedPartIds(prev => {
      const next = new Set(prev)
      const allIncluded = ids.every(id => next.has(id))
      
      if (allIncluded) {
        ids.forEach(id => next.delete(id))
      } else {
        ids.forEach(id => next.add(id))
      }
      return next
    })
  }

  // ── Basket Actions ──────────────────────────────────────────
  const addToBasket = (partsToAdd: any[]) => {
    setBasketItems(prev => {
      const next = [...prev]
      partsToAdd.forEach(p => {
        if (!next.find(item => item.id === p.id)) {
          next.push({
            ...p,
            part_number: p.part_ref?.part_number || p.part_ref || 'N/A',
            description: p.description || p.part_ref?.description || 'N/A'
          })
        }
      })
      return next
    })
    setBasketOpen(true)
    showToast('success', `${partsToAdd.length} items added to PO Basket`)
  }

  const removeFromBasket = (id: number) => {
    setBasketItems(prev => prev.filter(item => item.id !== id))
  }

  const updateBasketItem = (id: number, updates: any) => {
    setBasketItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item))
  }

  const handleDragEnd = (event: any) => {
    const { active, over } = event
    setActiveDragItem(null)

    if (over && (over.id === 'po-basket-drop-zone' || over.id === 'po-basket-sidebar')) {
      // Find the dragged part in the project data
      let draggedPart = null
      project?.sections?.forEach((s: any) => {
        s.subsections?.forEach((sub: any) => {
          const p = sub.parts?.find((part: any) => `part-${part.id}` === active.id)
          if (p) draggedPart = p
        })
      })

      if (draggedPart) {
        addToBasket([draggedPart])
      }
    }
  }

  const handleDragStart = (event: any) => {
    const { active } = event
    // Extract part ID and find it
    let draggedPart = null
    project?.sections?.forEach((s: any) => {
      s.subsections?.forEach((sub: any) => {
        const p = sub.parts?.find((part: any) => `part-${part.id}` === active.id)
        if (p) draggedPart = p
      })
    })
    setActiveDragItem(draggedPart)
  }

  // ── Loading / Error ─────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="max-w-[1600px] mx-auto px-6 py-8 page-container page-enter">
        <div className="flex items-center gap-4 mb-8">
          <div className="skeleton-text w-48 h-8 rounded" />
        </div>
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          <div className="w-80 h-96 skeleton rounded-xl" />
          <div className="flex-1 space-y-6">
            <div className="h-32 skeleton rounded-xl" />
            <div className="h-32 skeleton rounded-xl" />
          </div>
        </div>
      </div>
    )
  }

  if (projectError || !project) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <div className="bg-red-50 text-red-600 p-8 rounded-2xl inline-block mb-4 border border-red-100">
          <h2 className="text-xl font-bold">Project not found</h2>
          <p className="mt-2 text-red-500">The project you're looking for doesn't exist or has been deleted.</p>
          <Link to="/projects" className="mt-6 inline-flex items-center gap-2 text-red-600 font-bold hover:underline">
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container page-enter">
      {/* Header */}
      <header className="page-header">
        <div className="flex items-center gap-4">
          <Link to="/projects" className="btn btn-secondary flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Link>
          <div>
            <h1 className="page-title">{project.name}</h1>
            <p className="text-sm text-tertiary font-mono italic">REF #{project.project_number} • {project.status || 'DESIGN'}</p>
          </div>
        </div>

        <div className="flex gap-2">
          {selectedPartIds.size > 0 && isAdmin && (
            <button
              onClick={() => {
                const parts = []
                project?.sections?.forEach((s: any) => {
                  s.subsections?.forEach((sub: any) => {
                    sub.parts?.forEach((p: any) => {
                      if (selectedPartIds.has(p.id)) parts.push(p)
                    })
                  })
                })
                addToBasket(parts)
                setSelectedPartIds(new Set())
              }}
              className="btn bg-navy-900 hover:bg-black text-white shadow-lg shadow-navy-900/20 px-6 animate-in slide-in-from-right duration-300"
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              ADD TO BASKET ({selectedPartIds.size})
            </button>
          )}
          <button 
            onClick={() => setBasketOpen(!basketOpen)}
            className={`btn ${basketItems.length > 0 ? 'bg-primary-500 text-white shadow-primary-500/20' : 'btn-secondary'} relative`}
          >
            <ShoppingBag className="h-4 w-4 mr-2" />
            PO BASKET
            {basketItems.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-white">
                {basketItems.length}
              </span>
            )}
          </button>
          <button 
            onClick={handleExport}
            className="btn btn-secondary border-navy-100 text-navy-900"
          >
            <FileDown className="h-4 w-4 mr-2" />
            EXPORT BOM
          </button>
          <button 
            onClick={() => setSectionModal({ open: true, editing: null })}
            className="btn btn-primary shadow-lg shadow-primary-600/20"
          >
            <Plus className="h-4 w-4 mr-2" />
            ADD SECTION
          </button>
        </div>
      </header>

      {/* Tab Bar */}
      <div className="tab-bar mb-8">
        <button
          onClick={() => setActiveTab('bom')}
          className={`tab-item ${activeTab === 'bom' ? 'active' : ''}`}
        >
          📋 BOM Hierarchy
        </button>
        <button
          onClick={() => setActiveTab('documents')}
          className={`tab-item ${activeTab === 'documents' ? 'active' : ''}`}
        >
          <FileText className="h-4 w-4 inline mr-1" />
          Documents
        </button>
        <button
          onClick={() => setActiveTab('jo')}
          className={`tab-item ${activeTab === 'jo' ? 'active' : ''}`}
        >
          <ClipboardList className="h-4 w-4 inline mr-1" />
          Job Orders
        </button>
        <button
          onClick={() => setActiveTab('pos')}
          className={`tab-item ${activeTab === 'pos' ? 'active' : ''}`}
        >
          <ShoppingCart className="h-4 w-4 inline mr-1" />
          Purchase Orders
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Sidebar */}
        <ProjectSidebar 
          project={project} 
          projectPOs={projectPOs || []}
          onCreatePO={() => setPoModal(true)}
        />

        {/* Content Area */}
        <div className="flex-1 w-full min-w-0">
          {activeTab === 'bom' && (
            <div className="space-y-6">
              <AdvancedFilterBar onFilterChange={(filters) => console.log('Filters', filters)} />
              
              {!project.sections?.length ? (
                <div className="empty-state">
                  <div className="bg-white w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-sm border border-slate-100">
                    <Layers className="h-10 w-10 text-navy-400" />
                  </div>
                  <h3 className="section-title mb-2">No sections defined</h3>
                  <p className="text-secondary max-w-sm mb-8">
                    Start building your bill of materials by adding your first project section.
                  </p>
                  <button
                    onClick={() => setSectionModal({ open: true, editing: null })}
                    className="btn btn-primary px-8"
                  >
                    ADD FIRST SECTION
                  </button>
                </div>
              ) : (
                <div className="space-y-8">
                  <BOMTreeView
                    project={project}
                    projectId={projectId}
                    onEditSection={handleEditSection}
                    onDeleteSection={handleDeleteSection}
                    onAddSubsection={handleAddSubsection}
                    onEditSubsection={handleEditSubsection}
                    onDeleteSubsection={handleDeleteSubsection}
                    onCopySubsection={handleCopySubsection}
                    onAddPart={handleAddPart}
                    onEditPart={handleEditPart}
                    onDeletePart={handleDeletePart}
                    onImageClick={handleImageClick}
                    selectedPartIds={selectedPartIds}
                    onToggleSelectPart={handleSelectPart}
                    onToggleSelectAll={handleSelectAll}
                  />

                  {/* Orphaned subsections */}
                  {project.orphaned_subsections && project.orphaned_subsections.length > 0 && (
                    <div className="card bg-amber-50/50 border-amber-200 p-8">
                      <div className="flex items-center gap-3 mb-4">
                        <Package className="h-5 w-5 text-amber-600" />
                        <h3 className="font-black text-amber-800 uppercase tracking-widest text-xs">
                          Unassigned Subsections ({project.orphaned_subsections.length})
                        </h3>
                      </div>
                      <p className="text-sm text-amber-700/80 mb-6 font-medium">
                        These subsections exist but are not assigned to any Section. Please create a Section and edit these subsections to assign them.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {project.orphaned_subsections.map((sub: any) => (
                          <div key={sub.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-amber-100 shadow-sm">
                            <span className="text-sm font-bold text-navy-900">{sub.name || sub.section_name}</span>
                            <span className="badge badge-amber">{sub.parts?.length || 0} parts</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Documents Tab ───────────────────────────────────── */}
          {activeTab === 'documents' && (
            <ProjectDocumentsTab projectId={projectId} />
          )}

          {/* ── Job Order Tab ───────────────────────────────────── */}
          {activeTab === 'jo' && (
            <JobOrderTab 
              projectId={projectId} 
              projectNumber={project.project_number} 
            />
          )}

          {/* ── POs Tab ───────────────────────────────────── */}
          {activeTab === 'pos' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900 flex items-center pt-2">
                <ShoppingCart className="h-5 w-5 mr-2 text-primary-600" />
                Project Purchase Orders
              </h2>
              {!projectPOs || projectPOs.length === 0 ? (
                <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
                  <ShoppingCart className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                  <h3 className="text-sm font-bold text-gray-900">No POs Generated</h3>
                  <p className="text-sm text-gray-500 mt-1 max-w-xs mx-auto">
                    Select parts from the BOM to generate Purchase Orders.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {projectPOs.map((po: any) => (
                    <div key={po.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 hover:border-primary-200 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="bg-primary-50 p-3 rounded-xl">
                            <FileText className="h-5 w-5 text-primary-600" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-primary-600 font-mono">
                                {po.po_number}
                              </span>
                              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${
                                po.status === 'Received' ? 'bg-green-50 text-green-700 border-green-200' :
                                'bg-gray-50 text-gray-600 border-gray-200'
                              }`}>
                                {po.status}
                              </span>
                            </div>
                            <p className="text-sm font-bold text-gray-900 mt-0.5">
                              {(po as any).suppliers?.name || '—'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black text-gray-900 tabular-nums">
                            ₹{po.grand_total?.toLocaleString()}
                          </p>
                          <p className="text-[10px] text-gray-400 font-bold uppercase">
                            {po.total_items} items
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <DndContext 
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* Actual Drag Overlay for better UX */}
        <DragOverlay>
          {activeDragItem ? (
            <div className="bg-white border-2 border-navy-500 rounded-2xl p-4 shadow-2xl opacity-80 scale-95 pointer-events-none flex items-center gap-3">
              <div className="bg-navy-900 p-2 rounded-xl">
                 <Package className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-xs font-black text-navy-900">{activeDragItem.part_ref?.part_number || activeDragItem.part_ref}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[150px]">
                  {activeDragItem.description || activeDragItem.part_ref?.description}
                </p>
              </div>
            </div>
          ) : null}
        </DragOverlay>

        <POBasket 
          isOpen={basketOpen}
          onClose={() => setBasketOpen(false)}
          items={basketItems}
          onRemoveItem={removeFromBasket}
          onUpdateItem={updateBasketItem}
          onClearBasket={() => setBasketItems([])}
          onReleasePO={() => setPoModal(true)}
        />
      </DndContext>

      {/* ── Modals ────────────────────────────────────────── */}
      <ProjectSectionModal
        isOpen={sectionModal.open}
        onClose={() => setSectionModal({ open: false, editing: null })}
        projectId={projectId}
        sectionToEdit={sectionModal.editing}
        onDelete={handleDeleteSection}
      />

      <ProjectSubsectionModal
        isOpen={subsectionModal.open}
        onClose={() => setSubsectionModal({ open: false, sectionId: 0, sectionName: '', editing: null })}
        projectId={projectId}
        sectionId={subsectionModal.sectionId}
        sectionName={subsectionModal.sectionName}
        subsectionToEdit={subsectionModal.editing}
        onDelete={handleDeleteSubsection}
      />

      <ProjectAddPartModal
        isOpen={addPartModal.open}
        onClose={() => setAddPartModal({ open: false, subsectionId: 0, subsectionName: '' })}
        projectId={projectId}
        sectionId={addPartModal.subsectionId}
        sectionName={addPartModal.subsectionName}
      />

      {editPartModal.part && (
        <ProjectEditPartModal
          isOpen={editPartModal.open}
          onClose={() => setEditPartModal({ open: false, part: null })}
          projectId={projectId}
          projectPart={editPartModal.part}
        />
      )}

      {poModal && (
        <CreatePOFromBOMModal
          isOpen={poModal}
          onClose={() => {
            setPoModal(false)
            setBasketItems([]) // Clear basket on success (or keep if desired)
            setSelectedPartIds(new Set())
          }}
          project={project}
          selectedPartIds={basketItems.map(item => item.id)}
        />
      )}

      {copyModal && (
        <ProjectSectionCopyModal
          isOpen={copyModal.open}
          onClose={() => setCopyModal(null)}
          sectionId={copyModal.subsectionId}
          sectionName={copyModal.subsectionName}
          currentProjectId={projectId}
        />
      )}

      {imageModal.open && imageModal.entity && (
        <BOMImageModal
          isOpen={imageModal.open}
          onClose={() => setImageModal({ open: false, entity: null, type: 'section' })}
          currentImageUrl={
            imageModal.type === 'part'
              ? imageModal.entity.part_ref?.image_path || null
              : imageModal.entity.image_path || null
          }
          entityType={imageModal.type}
          entityName={
            imageModal.type === 'section' ? imageModal.entity.name :
            imageModal.type === 'subsection' ? (imageModal.entity.section_name || imageModal.entity.name) :
            (imageModal.entity.part_ref?.part_number || `Part #${imageModal.entity.part_id}`)
          }
          onSave={handleImageSave}
        />
      )}

    </div>
  )
}

export default ProjectDetails
