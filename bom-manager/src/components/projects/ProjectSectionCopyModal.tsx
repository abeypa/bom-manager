import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Copy, Check, Search } from 'lucide-react'
import { projectsApi } from '@/api/projects'
import { useToast } from '@/context/ToastContext'

interface ProjectSectionCopyModalProps {
  isOpen: boolean
  onClose: () => void
  entityId: number
  entityName: string
  entityType: 'section' | 'subsection'
  currentProjectId: number
}

const ProjectSectionCopyModal = ({
  isOpen,
  onClose,
  entityId,
  entityName,
  entityType,
  currentProjectId,
}: ProjectSectionCopyModalProps) => {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('')
      setSelectedProjectId(null)
      setSelectedSectionId(null)
    }
  }, [isOpen])

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.getProjects,
    enabled: isOpen,
  })

  const filteredProjects = useMemo(
    () =>
      (projects || []).filter(
        (project: any) =>
          project.id !== currentProjectId &&
          (project.project_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            project.project_number.toLowerCase().includes(searchTerm.toLowerCase())),
      ),
    [projects, currentProjectId, searchTerm],
  )

  const { data: targetSections = [], isLoading: isLoadingSections } = useQuery({
    queryKey: ['project-sections', selectedProjectId],
    queryFn: () => projectsApi.getSections(selectedProjectId as number),
    enabled: isOpen && entityType === 'subsection' && !!selectedProjectId,
  })

  const copyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProjectId) throw new Error('Please select a destination project.')
      if (entityType === 'section') {
        return projectsApi.copySectionToProject(entityId, selectedProjectId)
      }
      return projectsApi.copySubsection(entityId, selectedProjectId, selectedSectionId || undefined)
    },
    onSuccess: () => {
      const itemLabel = entityType === 'section' ? 'Section' : 'Subsection'
      showToast('success', `${itemLabel} copied to destination project`)
      queryClient.invalidateQueries({ queryKey: ['project'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      onClose()
    },
    onError: (error: any) => {
      showToast('error', `Failed to copy ${entityType}: ${error.message}`)
    },
  })

  const handleCopy = () => {
    if (!selectedProjectId) {
      showToast('error', 'Please select a destination project')
      return
    }
    copyMutation.mutate()
  }

  if (!isOpen) return null

  const title = entityType === 'section' ? 'Copy Section' : 'Copy Subsection'
  const buttonLabel = entityType === 'section' ? 'Copy Section' : 'Copy Subsection'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 px-6 py-5">
          <div className="flex items-center space-x-2">
            <div className="rounded-lg bg-indigo-100 p-2 text-indigo-600">
              <Copy className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-6">
          <p className="mb-6 text-sm text-gray-600">
            Select a target project to copy <span className="font-bold text-gray-900">"{entityName}"</span>.
            {entityType === 'subsection'
              ? ' If you leave the destination section blank, the app will reuse the matching section name in the target project or create it automatically.'
              : ' All subsections and BOM parts under this section will be copied too.'}
          </p>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="max-h-[32vh] space-y-2 overflow-y-auto p-1">
            {isLoading ? (
              <div className="animate-pulse space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 rounded-xl bg-gray-50" />
                ))}
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">No projects found matching search.</div>
            ) : (
              filteredProjects.map((project: any) => (
                <button
                  key={project.id}
                  onClick={() => {
                    setSelectedProjectId(project.id)
                    setSelectedSectionId(null)
                  }}
                  className={`w-full rounded-xl border-2 p-4 text-left transition-all ${
                    selectedProjectId === project.id
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-gray-100 bg-white hover:border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col items-start">
                      <span className="font-bold text-gray-900">{project.project_name}</span>
                      <span className="text-xs tracking-tight text-gray-400">{project.project_number}</span>
                    </div>
                    {selectedProjectId === project.id && <Check className="h-5 w-5 text-indigo-600" />}
                  </div>
                </button>
              ))
            )}
          </div>

          {entityType === 'subsection' && selectedProjectId && (
            <div className="mt-5">
              <label className="mb-2 block text-xs font-black uppercase tracking-widest text-gray-500">
                Destination Section
              </label>
              <select
                value={selectedSectionId ?? ''}
                onChange={(e) => setSelectedSectionId(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Auto-match or create section</option>
                {isLoadingSections ? (
                  <option value="" disabled>
                    Loading sections...
                  </option>
                ) : (
                  targetSections.map((section: any) => (
                    <option key={section.id} value={section.id}>
                      {section.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-gray-100 bg-white px-6 py-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <button
            onClick={onClose}
            className="rounded-xl px-6 py-2.5 text-sm font-bold text-gray-500 transition-all hover:bg-gray-50 hover:text-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleCopy}
            disabled={!selectedProjectId || copyMutation.isPending}
            className="inline-flex items-center justify-center rounded-xl border border-transparent bg-indigo-600 px-8 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition-all hover:bg-indigo-700 disabled:opacity-50"
          >
            {copyMutation.isPending ? 'Copying...' : buttonLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ProjectSectionCopyModal
