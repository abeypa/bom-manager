import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { projectsApi } from '@/api/projects'
import { partsApi } from '@/api/parts'

const SearchOverlay = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const { data: projects = [] as any[] } = useQuery<any[]>({ queryKey: ['projects'], queryFn: projectsApi.getProjects as any, enabled: isOpen })
  const { data: parts = [] as any[] } = useQuery<any[]>({ queryKey: ['parts'], queryFn: partsApi.getParts as any, enabled: isOpen })

  const filteredProjects = projects.filter((p: any) => p.name?.toLowerCase().includes(query.toLowerCase()) || p.project_number?.toLowerCase().includes(query.toLowerCase()))
  const filteredParts = parts.filter((p: any) => p.part_number?.toLowerCase().includes(query.toLowerCase()) || p.description?.toLowerCase().includes(query.toLowerCase()))

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === '/' && e.metaKey) { e.preventDefault(); onClose() } // Cmd+K already opens
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-navy-900/40 backdrop-blur-sm z-[9999] flex items-start justify-center pt-24 p-4">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-slate-100 flex items-center gap-3">
          <Search className="h-5 w-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search projects, parts, POs..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 outline-none text-lg placeholder:text-slate-400 text-navy-900"
            autoFocus
          />
          <button onClick={onClose} className="p-2 hover:bg-slate-50 text-slate-400 hover:text-navy-900 rounded-xl transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {query.length > 0 && filteredProjects.length === 0 && filteredParts.length === 0 && (
              <div className="p-8 text-center text-slate-400">
                  No results found for "{query}"
              </div>
          )}
          {filteredProjects.length > 0 && (
            <div className="mb-4">
              <h4 className="text-[10px] uppercase tracking-widest font-black text-slate-400 mb-2 px-3">Projects</h4>
              {filteredProjects.map((p: any) => (
                <div
                  key={p.id}
                  onClick={() => { navigate(`/projects/${p.id}`); onClose() }}
                  className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-2xl cursor-pointer transition-colors"
                >
                  <span className="font-semibold text-navy-900">{p.name || p.project_name}</span>
                  <span className="font-mono text-xs text-slate-400">#{p.project_number}</span>
                </div>
              ))}
            </div>
          )}

          {filteredParts.length > 0 && (
            <div>
              <h4 className="text-[10px] uppercase tracking-widest font-black text-slate-400 mb-2 px-3 border-t border-slate-50 pt-4">Parts</h4>
              {filteredParts.slice(0, 8).map((p: any) => (
                <div 
                  key={p.id} 
                  onClick={() => { navigate(`/parts`); onClose() }}
                  className="p-3 hover:bg-slate-50 rounded-2xl cursor-pointer transition-colors flex items-center gap-3"
                >
                  <span className="font-mono text-primary-600 font-bold text-sm">{p.part_number}</span> 
                  <span className="text-slate-600 text-sm truncate">{p.description}</span>
                </div>
              ))}
            </div>
          )}
          
          {query.length === 0 && (
              <div className="p-8 text-center text-slate-400 text-sm">
                  Start typing to search your workspace...
              </div>
          )}
        </div>
        <div className="bg-slate-50 p-3 text-xs text-slate-400 text-center font-medium border-t border-slate-100 flex justify-center gap-4">
            <span><kbd className="font-mono bg-white border border-slate-200 rounded px-1 shadow-sm">esc</kbd> to close</span>
            <span><kbd className="font-mono bg-white border border-slate-200 rounded px-1 shadow-sm">↵</kbd> to select</span>
        </div>
      </div>
    </div>
  )
}

export default SearchOverlay
