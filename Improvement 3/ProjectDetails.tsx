import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
  FileDown,
  Trash2,
  Edit2,
  Copy,
  PlusCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

import ProjectSectionModal from '@/components/projects/ProjectSectionModal'
import ProjectSubsectionModal from '@/components/projects/ProjectSubsectionModal'
import ProjectAddPartModal from '@/components/projects/ProjectAddPartModal'
import ProjectEditPartModal from '@/components/projects/ProjectEditPartModal'
import CreatePOFromBOMModal from '@/components/projects/CreatePOFromBOMModal'
import ProjectSectionCopyModal from '@/components/projects/ProjectSectionCopyModal'
import SectionExportButton from '@/components/projects/SectionExportButton'
import { purchaseOrdersApi } from '@/api/purchase-orders'
import { useRole } from '@/hooks/useRole'
import { useToast } from '@/context/ToastContext'

const resolvePartType = (p: any) => {
  if (p.mechanical_manufacture_id) return { type: 'MECH-MFG', ref: p.mechanical_manufacture }
  if (p.mechanical_bought_out_part_id) return { type: 'MECH-BOP', ref: p.mechanical_bought_out }
  if (p.electrical_manufacture_id) return { type: 'ELEC-MFG', ref: p.electrical_manufacture }
  if (p.electrical_bought_out_part_id) return { type: 'ELEC-BOP', ref: p.electrical_bought_out }
  if (p.pneumatic_bought_out_part_id) return { type: 'PNEU-BOP', ref: p.pneumatic_bought_out }
  return { type: 'UNKNOWN', ref: null }
}

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
  const [activeTab, setActiveTab] = useState<'bom' | 'pos'>('bom')
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set())

  // ── Data ────────────────────────────────────────────────────
  const { data: project, isLoading } = useQuery<any>({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.getProject(projectId),
  })

  const { data: projectPOs } = useQuery({
    queryKey: ['project-pos', projectId],
    queryFn: () => purchaseOrdersApi.getProjectPurchaseOrders(projectId),
    enabled: !!projectId,
  })

  // ── Helpers ─────────────────────────────────────────────────
  const toggleSection = (sectionId: number) => {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }

  const togglePartSelection = (partId: number) => {
    setSelectedPartIds(prev => {
      const next = new Set(prev)
      if (next.has(partId)) next.delete(partId)
      else next.add(partId)
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

  const handleRemovePart = async (partId: number) => {
    if (confirm('Remove this part from the BOM?')) {
      try {
        await projectsApi.removePartFromSection(partId)
        queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      } catch (e: any) {
        showToast('error', e.message)
      }
    }
  }

  const totalPartsCount = project?.sections?.reduce(
    (acc: number, sec: any) =>
      acc +
      (sec.subsections || []).reduce(
        (a2: number, sub: any) => a2 + (sub.parts?.length || 0),
        0
      ),
    0
  ) ?? 0

  const totalSubsectionsCount = project?.sections?.reduce(
    (acc: number, sec: any) => acc + (sec.subsections?.length || 0),
    0
  ) ?? 0

  // ── Loading / Error ─────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex flex-col justify-center items-center p-12 text-center">
        <Layers className="mx-auto h-12 w-12 text-gray-300" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">Project not found</h3>
        <Link to="/projects" className="mt-4 text-primary-600 hover:text-primary-700 flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to Projects
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            to="/projects"
            className="p-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm"
          >
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </Link>
          <nav className="flex items-center space-x-2 text-sm">
            <Link to="/projects" className="font-medium text-gray-500 hover:text-gray-700">
              Projects
            </Link>
            <ChevronRight className="h-4 w-4 text-gray-400" />
            <span className="font-bold text-gray-900">{project.project_name}</span>
          </nav>
        </div>
        <button
          onClick={async () => {
            try {
              const parts: any[] = []
              project.sections?.forEach((sec: any) => {
                sec.subsections?.forEach((sub: any) => {
                  sub.parts?.forEach((p: any) => {
                    const resolved = resolvePartType(p)
                    parts.push({
                      PartNumber: resolved.ref?.part_number,
                      Description: resolved.ref?.description || '',
                      SectionName: sec.name,
                      SubsectionName: sub.section_name,
                      quantity: p.quantity,
                      unit_price: p.unit_price,
                    })
                  })
                })
              })
              const blob = new Blob([JSON.stringify(parts, null, 2)], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `${project.project_name}_BOM.json`
              a.click()
              URL.revokeObjectURL(url)
              showToast('success', 'BOM exported')
            } catch {
              showToast('error', 'Export failed')
            }
          }}
          className="flex items-center gap-2 px-5 py-2.5 border border-blue-100 text-blue-600 text-xs font-black rounded-2xl hover:bg-blue-50 transition-all uppercase tracking-widest"
        >
          <FileDown className="h-4 w-4" />
          Export BOM
        </button>
      </div>

      {/* ── Project Info + Stats ───────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-3 space-y-4">

          {/* Project card */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8">
            <div className="flex justify-between items-start mb-4">
              <span className="text-[10px] font-black text-primary-600 bg-primary-50 border border-primary-100 px-3 py-1 rounded-full uppercase tracking-widest">
                {project.project_number}
              </span>
              <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full border ${
                project.status === 'completed' ? 'bg-green-50 text-green-700 border-green-100' :
                project.status === 'on_hold' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                'bg-blue-50 text-blue-700 border-blue-100'
              }`}>
                {project.status?.replace('_', ' ')}
              </span>
            </div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight uppercase mb-2">
              {project.project_name}
            </h1>
            {project.customer && (
              <div className="flex items-center text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
                <User className="h-3.5 w-3.5 mr-1.5" /> {project.customer}
              </div>
            )}
            {project.description && (
              <p className="text-xs text-gray-500 italic leading-relaxed border-l-4 border-primary-100 pl-3">
                {project.description}
              </p>
            )}
          </div>

          {/* Hierarchy stats */}
          <div className="bg-gray-900 rounded-3xl p-8 text-white">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-6">
              BOM Hierarchy
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase">
                  <FolderOpen className="h-4 w-4" /> Sections
                </div>
                <span className="text-2xl font-black tabular-nums">{project.sections?.length || 0}</span>
              </div>
              <div className="h-px bg-gray-800" />
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase">
                  <Layers className="h-4 w-4" /> Subsections
                </div>
                <span className="text-2xl font-black tabular-nums">{totalSubsectionsCount}</span>
              </div>
              <div className="h-px bg-gray-800" />
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase">
                  <Package className="h-4 w-4" /> Parts
                </div>
                <span className="text-2xl font-black tabular-nums">{totalPartsCount}</span>
              </div>
            </div>
          </div>

          {/* PO generation panel */}
          {selectedPartIds.size > 0 && (
            <div className="bg-white border-2 border-primary-200 border-t-4 border-t-primary-600 rounded-2xl p-6 animate-in slide-in-from-bottom-4 duration-300">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-primary-100 p-2 rounded-lg">
                  <PlusCircle className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-gray-900 uppercase tracking-tight">
                    {selectedPartIds.size} Parts Selected
                  </h4>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                    Ready for procurement
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPoModal(true)}
                className="w-full flex items-center justify-center px-4 py-3 bg-primary-600 text-white text-xs font-black rounded-xl shadow-lg shadow-primary-200 hover:bg-primary-700 transition-all active:scale-95"
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                Generate Purchase Order
              </button>
              <button
                onClick={() => setSelectedPartIds(new Set())}
                className="w-full mt-3 text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors uppercase tracking-widest"
              >
                Clear Selection
              </button>
            </div>
          )}
        </div>

        {/* ── Right Column ─────────────────────────────────── */}
        <div className="xl:col-span-9 space-y-6">

          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('bom')}
              className={`flex items-center px-6 py-4 text-sm font-black uppercase tracking-widest border-b-2 transition-all ${
                activeTab === 'bom'
                  ? 'border-primary-600 text-primary-600 bg-primary-50/50'
                  : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Layers className="h-4 w-4 mr-2" />
              Bill of Materials
            </button>
            <button
              onClick={() => setActiveTab('pos')}
              className={`flex items-center px-6 py-4 text-sm font-black uppercase tracking-widest border-b-2 transition-all ${
                activeTab === 'pos'
                  ? 'border-primary-600 text-primary-600 bg-primary-50/50'
                  : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              }`}
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Purchase Orders
              {projectPOs && projectPOs.length > 0 && (
                <span className="ml-2 bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full text-[10px]">
                  {projectPOs.length}
                </span>
              )}
            </button>
          </div>

          {/* ── BOM Tab ───────────────────────────────────── */}
          {activeTab === 'bom' && (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight flex items-center gap-2">
                  <FolderOpen className="h-6 w-6 text-primary-600" />
                  Project Sections
                </h2>
                <button
                  onClick={() => setSectionModal({ open: true, editing: null })}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-[10px] font-black rounded-2xl shadow-xl shadow-gray-200 hover:bg-gray-800 transition-all active:scale-95 uppercase tracking-widest"
                >
                  <PlusCircle className="h-4 w-4" />
                  Add Section
                </button>
              </div>

              {/* Empty state */}
              {(!project.sections || project.sections.length === 0) && (
                <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-16 text-center">
                  <FolderOpen className="mx-auto h-14 w-14 text-gray-200 mb-4" />
                  <h3 className="text-sm font-bold text-gray-900 mb-1">No Sections Yet</h3>
                  <p className="text-sm text-gray-500 max-w-xs mx-auto mb-6">
                    Create your first Section (e.g. "Mechanical Assembly") to start organizing your BOM.
                  </p>
                  <button
                    onClick={() => setSectionModal({ open: true, editing: null })}
                    className="inline-flex items-center px-5 py-3 bg-primary-600 text-white text-xs font-black rounded-xl hover:bg-primary-700 shadow-lg shadow-primary-200 transition-all"
                  >
                    <Plus className="h-4 w-4 mr-2" /> Add First Section
                  </button>
                </div>
              )}

              {/* ── Section list ─────────────────────────── */}
              <div className="space-y-6">
                {(project.sections || []).map((section: any) => {
                  const isCollapsed = collapsedSections.has(section.id)
                  const subsections: any[] = section.subsections || []

                  return (
                    <div
                      key={section.id}
                      className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden"
                    >
                      {/* Section header */}
                      <div className="px-8 py-5 bg-gray-900 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <button
                            onClick={() => toggleSection(section.id)}
                            className="text-gray-400 hover:text-white transition-colors"
                          >
                            {isCollapsed
                              ? <ChevronDown className="h-5 w-5" />
                              : <ChevronUp className="h-5 w-5" />}
                          </button>
                          <FolderOpen className="h-5 w-5 text-primary-400" />
                          <span className="text-white font-black text-lg uppercase tracking-tight">
                            {section.name}
                          </span>
                          <span className="text-gray-500 text-xs font-bold uppercase tracking-widest">
                            {subsections.length} subsection{subsections.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              setSubsectionModal({
                                open: true,
                                sectionId: section.id,
                                sectionName: section.name,
                                editing: null,
                              })
                            }
                            className="flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-[10px] font-black rounded-xl transition-all uppercase tracking-widest"
                          >
                            <Plus className="h-4 w-4" />
                            Add Subsection
                          </button>
                          <button
                            onClick={() => setSectionModal({ open: true, editing: section })}
                            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                            title="Edit Section"
                          >
                            <Settings className="h-4 w-4" />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteSection(section.id)}
                              className="p-2 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                              title="Delete Section"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Subsections */}
                      {!isCollapsed && (
                        <div className="divide-y divide-gray-50">
                          {subsections.length === 0 ? (
                            <div className="px-8 py-10 text-center">
                              <Layers className="mx-auto h-10 w-10 text-gray-200 mb-3" />
                              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
                                No subsections yet
                              </p>
                              <button
                                onClick={() =>
                                  setSubsectionModal({
                                    open: true,
                                    sectionId: section.id,
                                    sectionName: section.name,
                                    editing: null,
                                  })
                                }
                                className="inline-flex items-center px-5 py-2.5 bg-primary-600 text-white text-[10px] font-black rounded-xl hover:bg-primary-700 transition-all"
                              >
                                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Subsection
                              </button>
                            </div>
                          ) : (
                            subsections.map((sub: any) => (
                              <div key={sub.id} className="group">
                                {/* Subsection header */}
                                <div className="px-8 py-4 flex items-center justify-between bg-gray-50/50 border-b border-gray-100 group-hover:bg-gray-50 transition-colors">
                                  <div className="flex items-center gap-3">
                                    <Layers className="h-4 w-4 text-primary-500" />
                                    <div>
                                      <span className="text-sm font-black text-gray-900 uppercase tracking-tight">
                                        {sub.section_name}
                                      </span>
                                      {sub.description && (
                                        <span className="ml-3 text-xs text-gray-400 italic">
                                          {sub.description}
                                        </span>
                                      )}
                                    </div>
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border uppercase ${
                                      sub.status === 'completed'
                                        ? 'bg-green-50 text-green-700 border-green-100'
                                        : sub.status === 'in_progress'
                                        ? 'bg-primary-50 text-primary-700 border-primary-100'
                                        : 'bg-gray-50 text-gray-600 border-gray-200'
                                    }`}>
                                      {sub.status?.replace('_', ' ')}
                                    </span>
                                    <span className="text-[10px] font-bold text-gray-400">
                                      {sub.parts?.length || 0} parts
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <SectionExportButton
                                      sectionName={sub.section_name}
                                      parts={sub.parts || []}
                                      projectName={project.project_name}
                                    />
                                    <button
                                      onClick={() =>
                                        setCopyModal({
                                          open: true,
                                          subsectionId: sub.id,
                                          subsectionName: sub.section_name,
                                        })
                                      }
                                      className="p-2 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                                      title="Copy subsection"
                                    >
                                      <Copy className="h-4 w-4" />
                                    </button>
                                    <button
                                      onClick={() =>
                                        setAddPartModal({
                                          open: true,
                                          subsectionId: sub.id,
                                          subsectionName: sub.section_name,
                                        })
                                      }
                                      className="p-2 text-primary-400 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all"
                                      title="Add part"
                                    >
                                      <Plus className="h-4 w-4" />
                                    </button>
                                    <button
                                      onClick={() =>
                                        setSubsectionModal({
                                          open: true,
                                          sectionId: section.id,
                                          sectionName: section.name,
                                          editing: sub,
                                        })
                                      }
                                      className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
                                      title="Edit subsection"
                                    >
                                      <Settings className="h-4 w-4" />
                                    </button>
                                    {isAdmin && (
                                      <button
                                        onClick={() => handleDeleteSubsection(sub.id)}
                                        className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                        title="Delete subsection"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Parts table */}
                                {(sub.parts || []).length > 0 ? (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                      <thead>
                                        <tr className="bg-white border-b border-gray-50">
                                          <th className="px-6 py-3 w-8">
                                            <input
                                              type="checkbox"
                                              className="h-4 w-4 text-primary-600 border-gray-300 rounded"
                                              checked={sub.parts.every((p: any) => selectedPartIds.has(p.id))}
                                              onChange={e => {
                                                const next = new Set(selectedPartIds)
                                                if (e.target.checked) sub.parts.forEach((p: any) => next.add(p.id))
                                                else sub.parts.forEach((p: any) => next.delete(p.id))
                                                setSelectedPartIds(next)
                                              }}
                                            />
                                          </th>
                                          <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Part Number</th>
                                          <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Description</th>
                                          <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Qty</th>
                                          <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Unit Price</th>
                                          <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Total</th>
                                          <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Type</th>
                                          <th className="px-4 py-3 w-16" />
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-50">
                                        {sub.parts.map((p: any) => {
                                          const pData = resolvePartType(p)
                                          const isSelected = selectedPartIds.has(p.id)
                                          const total =
                                            (p.unit_price || 0) *
                                            (p.quantity || 0) *
                                            (1 - (p.discount_percent || 0) / 100)
                                          return (
                                            <tr
                                              key={p.id}
                                              className={`hover:bg-gray-50/50 transition-colors ${isSelected ? 'bg-primary-50/30' : ''}`}
                                            >
                                              <td className="px-6 py-3">
                                                <input
                                                  type="checkbox"
                                                  className="h-4 w-4 text-primary-600 border-gray-300 rounded"
                                                  checked={isSelected}
                                                  onChange={() => togglePartSelection(p.id)}
                                                />
                                              </td>
                                              <td className="px-4 py-3">
                                                <span className="text-sm font-bold text-gray-900 font-mono">
                                                  {pData.ref?.part_number || '—'}
                                                </span>
                                                {p.reference_designator && (
                                                  <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-mono">
                                                    {p.reference_designator}
                                                  </span>
                                                )}
                                              </td>
                                              <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">
                                                {pData.ref?.description || '—'}
                                              </td>
                                              <td className="px-4 py-3 text-sm font-bold text-gray-900 tabular-nums text-right">
                                                {p.quantity}
                                              </td>
                                              <td className="px-4 py-3 text-xs text-gray-500 tabular-nums text-right">
                                                ₹{(p.unit_price || 0).toLocaleString()}
                                              </td>
                                              <td className="px-4 py-3 text-sm font-bold text-gray-900 tabular-nums text-right">
                                                ₹{total.toFixed(2)}
                                              </td>
                                              <td className="px-4 py-3">
                                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase ${
                                                  pData.type.includes('MFG')
                                                    ? 'bg-blue-50 text-blue-600'
                                                    : 'bg-amber-50 text-amber-600'
                                                }`}>
                                                  {pData.type}
                                                </span>
                                              </td>
                                              <td className="px-4 py-3">
                                                <div className="flex items-center gap-1">
                                                  <button
                                                    onClick={() => setEditPartModal({ open: true, part: p })}
                                                    className="p-1.5 text-gray-300 hover:text-primary-600 transition-colors"
                                                  >
                                                    <Edit2 className="h-3.5 w-3.5" />
                                                  </button>
                                                  <button
                                                    onClick={() => handleRemovePart(p.id)}
                                                    className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                                                  >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                  </button>
                                                </div>
                                              </td>
                                            </tr>
                                          )
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <div className="px-8 py-6 text-center border-b border-gray-50">
                                    <p className="text-xs text-gray-400 font-medium">
                                      No parts added yet.{' '}
                                      <button
                                        onClick={() =>
                                          setAddPartModal({
                                            open: true,
                                            subsectionId: sub.id,
                                            subsectionName: sub.section_name,
                                          })
                                        }
                                        className="text-primary-600 font-bold hover:underline"
                                      >
                                        Add a part
                                      </button>
                                    </p>
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Orphaned subsections (no section_id) */}
              {project.orphaned_subsections && project.orphaned_subsections.length > 0 && (
                <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-6">
                  <h3 className="text-sm font-black text-amber-800 uppercase tracking-widest mb-2">
                    ⚠ Unassigned Subsections ({project.orphaned_subsections.length})
                  </h3>
                  <p className="text-xs text-amber-700 mb-4">
                    These subsections exist but are not assigned to any Section. Please create a Section and edit these subsections to assign them.
                  </p>
                  <div className="space-y-2">
                    {project.orphaned_subsections.map((sub: any) => (
                      <div key={sub.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-amber-100">
                        <span className="text-sm font-bold text-gray-900">{sub.section_name}</span>
                        <span className="text-xs text-gray-400">{sub.parts?.length || 0} parts</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
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

      {/* ── Modals ─────────────────────────────────────────── */}

      {/* Section modal (create/edit) */}
      <ProjectSectionModal
        isOpen={sectionModal.open}
        onClose={() => setSectionModal({ open: false, editing: null })}
        projectId={projectId}
        sectionToEdit={sectionModal.editing}
        onDelete={handleDeleteSection}
      />

      {/* Subsection modal (create/edit) */}
      <ProjectSubsectionModal
        isOpen={subsectionModal.open}
        onClose={() =>
          setSubsectionModal({ open: false, sectionId: 0, sectionName: '', editing: null })
        }
        projectId={projectId}
        sectionId={subsectionModal.sectionId}
        sectionName={subsectionModal.sectionName}
        subsectionToEdit={subsectionModal.editing}
        onDelete={handleDeleteSubsection}
      />

      {/* Add Part modal */}
      <ProjectAddPartModal
        isOpen={addPartModal.open}
        onClose={() => setAddPartModal({ open: false, subsectionId: 0, subsectionName: '' })}
        projectId={projectId}
        sectionId={addPartModal.subsectionId}
        sectionName={addPartModal.subsectionName}
      />

      {/* Edit Part modal */}
      <ProjectEditPartModal
        isOpen={editPartModal.open}
        onClose={() => setEditPartModal({ open: false, part: null })}
        projectId={projectId}
        projectPart={editPartModal.part}
      />

      {/* Generate PO modal */}
      <CreatePOFromBOMModal
        isOpen={poModal}
        onClose={() => {
          setPoModal(false)
          setSelectedPartIds(new Set())
        }}
        project={project}
        selectedPartIds={Array.from(selectedPartIds)}
      />

      {/* Copy Subsection modal */}
      {copyModal && (
        <ProjectSectionCopyModal
          isOpen={copyModal.open}
          onClose={() => setCopyModal(null)}
          sectionId={copyModal.subsectionId}
          sectionName={copyModal.subsectionName}
          currentProjectId={projectId}
        />
      )}
    </div>
  )
}

export default ProjectDetails
