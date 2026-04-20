import { useState, useEffect } from 'react'
import { X, Save, Clock, Target, CreditCard, Layers } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { projectsApi, Project, ProjectInsert, ProjectUpdate } from '@/api/projects'

interface ProjectFormModalProps {
  isOpen: boolean
  onClose: () => void
  projectToEdit?: Project | null
}

const ProjectFormModal = ({ isOpen, onClose, projectToEdit }: ProjectFormModalProps) => {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState<Partial<Project>>({
    project_name: '',
    project_number: '',
    customer: '',
    description: '',
    status: 'planning',
    start_date: null,
    target_completion_date: null,
    mechanical_design_status: 'not_started',
    ee_design_status: 'not_started',
    pneumatic_design_status: 'not_started',
    po_release_status: 'not_started',
    part_arrival_status: 'not_started',
    machine_build_status: 'not_started'
  })

  useEffect(() => {
    if (projectToEdit) {
      setFormData(projectToEdit)
    } else {
      setFormData({
        project_name: '',
        project_number: '',
        customer: '',
        description: '',
        status: 'planning',
        start_date: null,
        target_completion_date: null,
        mechanical_design_status: 'not_started',
        ee_design_status: 'not_started',
        pneumatic_design_status: 'not_started',
        po_release_status: 'not_started',
        part_arrival_status: 'not_started',
        machine_build_status: 'not_started'
      })
    }
  }, [projectToEdit, isOpen])

  const navigate = useNavigate();

  const createMutation = useMutation({
    mutationFn: (newProject: ProjectInsert) => projectsApi.createProject(newProject),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['recent-projects'] })
      onClose()
      if ((data as any)?.id) {
        navigate(`/projects/${(data as any).id}`)
      }
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, project }: { id: number; project: ProjectUpdate }) => 
      projectsApi.updateProject(id, project),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['recent-projects'] })
      onClose()
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (projectToEdit) {
      updateMutation.mutate({ id: projectToEdit.id, project: formData as ProjectUpdate })
    } else {
      createMutation.mutate(formData as ProjectInsert)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose} />
      
      <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-lg font-medium text-gray-900">
            {projectToEdit ? 'Edit Project' : 'Add New Project'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Project Name *</label>
              <input
                type="text"
                name="project_name"
                required
                value={formData.project_name || ''}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Project Number *</label>
              <input
                type="text"
                name="project_number"
                required
                value={formData.project_number || ''}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Customer</label>
              <input
                type="text"
                name="customer"
                value={formData.customer || ''}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Status</label>
              <select
                name="status"
                value={formData.status || 'planning'}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              >
                <option value="planning">Planning</option>
                <option value="design">Design</option>
                <option value="build">Build</option>
                <option value="testing">Testing</option>
                <option value="completed">Completed</option>
                <option value="on_hold">On Hold</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Start Date</label>
              <input
                type="date"
                name="start_date"
                value={formData.start_date || ''}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Target Completion Date</label>
              <input
                type="date"
                name="target_completion_date"
                value={formData.target_completion_date || ''}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <textarea
                name="description"
                rows={2}
                value={formData.description || ''}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              />
            </div>

            <div className="md:col-span-2 border-t border-gray-200 pt-4">
              <h4 className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-3">Project Workflow Status</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { name: 'mechanical_design_status', label: 'Mechanical Design' },
                  { name: 'ee_design_status', label: 'Electrical Design' },
                  { name: 'pneumatic_design_status', label: 'Pneumatic Design' },
                  { name: 'po_release_status', label: 'PO Release' },
                  { name: 'part_arrival_status', label: 'Part Arrival' },
                  { name: 'machine_build_status', label: 'Machine Build' }
                ].map((item) => (
                  <div key={item.name}>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{item.label}</label>
                    <select
                      name={item.name}
                      value={(formData as any)[item.name] || 'not_started'}
                      onChange={handleChange}
                      className="block w-full border border-gray-300 rounded-md shadow-sm py-1.5 px-2 focus:outline-none focus:ring-primary-500 focus:border-primary-500 text-xs font-bold"
                    >
                      <option value="not_started">Not Started</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="on_hold">On Hold</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-5 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="inline-flex justify-center items-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
            >
              <Save className="h-4 w-4 mr-2" />
              {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ProjectFormModal
