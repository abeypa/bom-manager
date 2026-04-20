import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Copy, Check, Search, Layout } from 'lucide-react';
import { projectsApi } from '@/api/projects';
import { useToast } from '@/context/ToastContext';

interface ProjectSectionCopyModalProps {
  isOpen: boolean;
  onClose: () => void;
  sectionId: number;
  sectionName: string;
  currentProjectId: number;
}

const ProjectSectionCopyModal = ({ isOpen, onClose, sectionId, sectionName, currentProjectId }: ProjectSectionCopyModalProps) => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.getProjects
  });

  const copyMutation = useMutation({
    mutationFn: ({ sectionId, targetProjectId }: { sectionId: number, targetProjectId: number }) => 
      projectsApi.copySection(sectionId, targetProjectId),
    onSuccess: (data) => {
      showToast('success', `Copied "${sectionName}" to destination project`);
      queryClient.invalidateQueries({ queryKey: ['project'] }); // Invalidate both projects potentially
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    },
    onError: (error: any) => {
      showToast('error', `Failed to copy section: ${error.message}`);
    }
  });

  const handleCopy = () => {
    if (!selectedProjectId) {
      showToast('error', 'Please select a destination project');
      return;
    }
    copyMutation.mutate({ sectionId, targetProjectId: selectedProjectId });
  };

  if (!isOpen) return null;

  const filteredProjects = projects?.filter((p: any) => 
    p.id !== currentProjectId && (
      p.project_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.project_number.toLowerCase().includes(searchTerm.toLowerCase())
    )
  ) || [];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity" onClick={onClose} />
      
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full flex flex-col max-h-[85vh] overflow-hidden border border-gray-100">
        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
              <Copy className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">Copy Section</h3>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <p className="text-sm text-gray-600 mb-6">
            Select a target project to copy <span className="font-bold text-gray-900">"{sectionName}"</span> and all its parts.
          </p>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search projects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
            />
          </div>

          <div className="space-y-2 max-h-[40vh] overflow-y-auto p-1">
            {isLoading ? (
              <div className="animate-pulse space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-50 rounded-xl" />)}
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No projects found matching search.</div>
            ) : (
              filteredProjects.map((project: any) => (
                <button
                  key={project.id}
                  onClick={() => setSelectedProjectId(project.id)}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                    selectedProjectId === project.id 
                      ? 'border-indigo-600 bg-indigo-50' 
                      : 'border-gray-100 hover:border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex flex-col items-start">
                    <span className="font-bold text-gray-900">{project.project_name}</span>
                    <span className="text-xs text-gray-400 font-mono tracking-tight">{project.project_number}</span>
                  </div>
                  {selectedProjectId === project.id && <Check className="h-5 w-5 text-indigo-600" />}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 sticky bottom-0 bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-xl transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleCopy}
            disabled={!selectedProjectId || copyMutation.isPending}
            className="inline-flex justify-center items-center px-8 py-2.5 border border-transparent text-sm font-bold rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 disabled:opacity-50 transition-all"
          >
            {copyMutation.isPending ? 'Copying...' : 'Copy Section'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectSectionCopyModal;
