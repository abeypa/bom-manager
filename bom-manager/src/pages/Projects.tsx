import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi, Project } from '@/api/projects'
import { 
  Search, Plus, Edit, Trash2, ChevronRight, LayoutGrid, List, 
  Filter, FolderKanban, ArrowUpDown, MoreVertical, ExternalLink 
} from 'lucide-react'
import ProjectFormModal from '@/components/projects/ProjectFormModal'
import { Link } from 'react-router-dom'
import { useRole } from '@/hooks/useRole'

const PHASE_STEPS = [
  { key: 'mechanical_design_status', short: 'ME' },
  { key: 'ee_design_status',         short: 'EE' },
  { key: 'pneumatic_design_status',  short: 'PN' },
  { key: 'po_release_status',        short: 'PO' },
  { key: 'part_arrival_status',      short: 'PA' },
  { key: 'machine_build_status',     short: 'MB' },
]

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  planning:  { label: 'Planning',  cls: 'badge-slate' },
  design:    { label: 'Design',    cls: 'badge-navy' },
  build:     { label: 'Build',     cls: 'badge-amber' },
  testing:   { label: 'Testing',   cls: 'badge-teal-soft' },
  completed: { label: 'Completed', cls: 'badge-success' },
  on_hold:   { label: 'On Hold',   cls: 'badge-amber' },
  cancelled: { label: 'Cancelled', cls: 'badge-danger' },
}

const STATUSES = ['planning', 'design', 'build', 'testing', 'completed', 'on_hold', 'cancelled']

const Projects = () => {
  const { isAdmin } = useRole()
  const queryClient = useQueryClient()
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null)

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: projectsApi.getProjects,
  })

  useEffect(() => {
    document.title = 'Projects | BOM Manager'
  }, [])

  const deleteMutation = useMutation({
    mutationFn: projectsApi.deleteProject,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })

  const filteredProjects = projects.filter((p: Project) => {
    const q = searchTerm.toLowerCase()
    const matchQ = !q || p.project_name.toLowerCase().includes(q) || p.project_number.toLowerCase().includes(q) || (p.customer || '').toLowerCase().includes(q)
    const matchS = !statusFilter || p.status === statusFilter
    return matchQ && matchS
  })

  const phaseProgress = (p: Project) => {
    const done = PHASE_STEPS.filter(s => (p as any)[s.key] === 'completed').length
    return Math.round((done / PHASE_STEPS.length) * 100)
  }

  if (isLoading) {
    return (
      <div className="page-container py-8">
        <div className="page-header">
          <h1 className="page-title">Project Registry</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card p-6 min-h-[220px]">
              <div className="skeleton h-6 w-3/4 mb-4" />
              <div className="skeleton h-4 w-1/2 mb-6" />
              <div className="skeleton h-24 w-full" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="page-container py-8 page-enter">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-4">
          <h1 className="page-title">Project Registry</h1>
          <span className="badge px-3 py-1 text-sm">{filteredProjects.length} entities</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-tertiary" />
            <label htmlFor="project-search" className="sr-only">Search projects</label>
            <input
              id="project-search"
              type="text"
              placeholder="Search by name, REF, or customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input w-full pl-11"
            />
          </div>

          {/* View Toggle */}
          <div className="tab-bar">
            <button
              onClick={() => setViewMode('grid')}
              className={`tab-item flex items-center gap-2 ${viewMode === 'grid' ? 'active' : ''}`}
            >
              <LayoutGrid className="h-4 w-4" />
              Grid
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`tab-item flex items-center gap-2 ${viewMode === 'list' ? 'active' : ''}`}
            >
              <List className="h-4 w-4" />
              List
            </button>
          </div>

          <button
            onClick={() => { setProjectToEdit(null); setIsModalOpen(true) }}
            className="btn btn-primary flex items-center gap-2 shadow-lg shadow-navy-900/10"
          >
            <Plus className="h-4 w-4" />
            INITIALIZE PROJECT
          </button>
        </div>
      </div>

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredProjects.map((project: Project) => {
            const sm = STATUS_MAP[project.status] || STATUS_MAP.planning
            const pct = phaseProgress(project)
            return (
              <div
                key={project.id}
                className="card group hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col"
              >
                <div className="p-6 flex-1">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-black text-lg text-navy-900 leading-tight group-hover:text-amber-600 transition-colors">
                        {project.project_name}
                      </h3>
                      <p className="text-xs font-mono font-bold text-tertiary mt-1">
                        REF #{project.project_number}
                      </p>
                    </div>
                    <span className={`badge ${sm.cls}`}>{sm.label}</span>
                  </div>

                  {project.customer && (
                    <div className="mb-6 flex items-center gap-1.5 text-xs font-bold text-secondary">
                      <ExternalLink size={12} className="text-tertiary" />
                      {project.customer}
                    </div>
                  )}

                  {/* Lifecycle Indicators */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="label-caps !text-[9px]">Lifecycle Progress</span>
                      <span className="font-mono text-[10px] font-black text-navy-600">{pct}%</span>
                    </div>
                    <div className="flex gap-1">
                      {PHASE_STEPS.map(step => {
                        const val = (project as any)[step.key] || 'not_started'
                        const color = val === 'completed' ? 'bg-navy-500' : val === 'in_progress' ? 'bg-amber-400' : 'bg-slate-100'
                        return (
                          <div
                            key={step.key}
                            title={`${step.short}: ${val.replace('_', ' ')}`}
                            className={`flex-1 h-1.5 rounded-full ${color} transition-all duration-500`}
                          />
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <Link
                    to={`/projects/${project.id}`}
                    className="btn btn-secondary btn-sm"
                  >
                    INSPECT PROJECT →
                  </Link>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setProjectToEdit(project); setIsModalOpen(true) }}
                      className="btn btn-icon btn-sm btn-ghost hover:bg-white"
                      title="Edit Project"
                    >
                      <Edit size={14} />
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => {
                          if (confirm(`Permanently delete "${project.project_name}"?`)) deleteMutation.mutate(project.id)
                        }}
                        className="btn btn-icon btn-sm btn-ghost hover:text-red-500 hover:bg-red-50"
                        title="Delete Project"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="card shadow-sm overflow-hidden">
          <table className="data-table-modern">
            <thead>
              <tr>
                <th>Project Entity</th>
                <th>Reference</th>
                <th>State</th>
                <th className="text-center">Lifecycle</th>
                <th>Last Update</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map((project: Project) => {
                const sm = STATUS_MAP[project.status] || STATUS_MAP.planning
                const pct = phaseProgress(project)
                return (
                  <tr key={project.id} className="table-row-hover group">
                    <td>
                      <Link
                        to={`/projects/${project.id}`}
                        className="font-black text-navy-900 group-hover:text-amber-600 transition-colors"
                      >
                        {project.project_name}
                      </Link>
                    </td>
                    <td>
                      <span className="font-mono text-xs font-bold text-tertiary">
                        {project.project_number}
                      </span>
                    </td>
                    <td><span className={`badge ${sm.cls}`}>{sm.label}</span></td>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 w-20 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-700 ${pct === 100 ? 'bg-emerald-500' : 'bg-navy-500'}`} 
                            style={{ width: `${pct}%` }} 
                          />
                        </div>
                        <span className="font-mono text-[10px] font-black text-navy-400">{pct}%</span>
                      </div>
                    </td>
                    <td>
                      <span className="text-xs font-bold text-tertiary">
                        {project.updated_date ? new Date(project.updated_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        <button onClick={() => { setProjectToEdit(project); setIsModalOpen(true) }} className="btn btn-icon btn-sm btn-ghost">
                          <Edit size={14} />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => { if (confirm(`Delete "${project.project_name}"?`)) deleteMutation.mutate(project.id) }}
                            className="btn btn-icon btn-sm btn-ghost hover:text-red-500"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {filteredProjects.length === 0 && (
        <div className="empty-state py-24">
          <FolderKanban size={40} className="text-tertiary mb-4" />
          <h3 className="section-title mb-2">No projects found</h3>
          <p className="text-secondary mb-8">Adjust search or create a new project to continue.</p>
        </div>
      )}

      <ProjectFormModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        projectToEdit={projectToEdit} 
      />
    </div>
  )
}

export default Projects

