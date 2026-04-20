import { Calendar, User, Layers, ShoppingCart, Info, Activity } from 'lucide-react'

interface ProjectSidebarProps {
  project: any
  projectPOs: any[]
  onCreatePO: () => void
}

const ProjectSidebar = ({ project, projectPOs, onCreatePO }: ProjectSidebarProps) => {
  return (
    <div className="w-80 space-y-6 shrink-0 sticky top-6">
      {/* Project Info Card */}
      <div className="card p-6 border border-slate-100 shadow-sm bg-white">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 bg-navy-500 rounded-full" />
          <span className="label-caps !text-navy-500">Project Overview</span>
        </div>
        
        <h2 className="text-xl font-black text-navy-900 mb-2 leading-tight">{project.name}</h2>
        
        <div className="flex items-center gap-2 mb-8">
          <span className="text-[10px] font-black font-mono bg-navy-50 text-navy-600 px-2 py-0.5 rounded-lg border border-navy-100 uppercase tracking-tighter">
            PROJ-{project.project_number}
          </span>
          <span className={`status-${project.status?.toLowerCase().replace(' ', '-') || 'planning'}`}>
            {project.status || 'Active'}
          </span>
        </div>

        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
              <User className="h-4 w-4 text-navy-400" />
            </div>
            <div>
              <div className="label-caps mb-0.5">Project Lead</div>
              <div className="text-sm font-black text-navy-900">{project.owner || 'Unassigned'}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
              <Calendar className="h-4 w-4 text-navy-400" />
            </div>
            <div>
              <div className="label-caps mb-0.5">Start Date</div>
              <div className="text-sm font-black text-navy-900">
                {new Date(project.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hierarchy Stats */}
      <div className="card-dark p-6 shadow-xl relative overflow-hidden group">
        <div className="relative z-10">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/10 rounded-lg">
                <Layers className="h-4 w-4 text-amber-400" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-navy-300">BOM STRUCTURE</span>
            </div>
            <Activity className="h-3.5 w-3.5 text-navy-600 animate-pulse" />
          </div>
          
          <div className="flex items-baseline gap-2 mb-8">
            <div className="text-4xl font-black text-white leading-none tracking-tighter">
              {project.sections?.length || 0}
            </div>
            <div className="text-xs text-navy-400 font-bold uppercase tracking-wider">Main Units</div>
          </div>
          
          <div className="pt-6 border-t border-white/5 grid grid-cols-2 gap-4">
            <div>
              <div className="text-[9px] text-navy-500 uppercase font-black tracking-widest mb-1">Subsections</div>
              <div className="text-xl font-bold text-navy-100 tabular-nums">
                {project.sections?.reduce((acc: number, s: any) => acc + (s.subsections?.length || 0), 0) || 0}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-navy-500 uppercase font-black tracking-widest mb-1">Part Count</div>
              <div className="text-xl font-bold text-navy-100 tabular-nums">
                {project.sections?.reduce((acc: number, s: any) => 
                  acc + (s.subsections?.reduce((acc2: number, sub: any) => acc2 + (sub.parts?.length || 0), 0) || 0), 0) || 0}
              </div>
            </div>
          </div>
        </div>
        
        {/* Background icon pattern */}
        <Layers className="absolute -right-6 -bottom-6 h-32 w-32 text-white/5 -rotate-12 group-hover:rotate-0 transition-transform duration-700" />
      </div>

      {/* Quick Actions */}
      <div className="space-y-3">
        <button
          onClick={onCreatePO}
          className="btn btn-primary btn-lg w-full shadow-lg shadow-navy-900/10 group overflow-hidden"
        >
          <ShoppingCart className="h-4 w-4 group-hover:scale-110 transition-transform" />
          <span>RELEASE BOM TO PO</span>
        </button>

        <div className="p-5 bg-slate-50/50 rounded-2xl border border-slate-100 flex items-start gap-3">
          <Info className="h-4 w-4 text-slate-300 mt-0.5 shrink-0" />
          <p className="text-[11px] text-slate-500 leading-relaxed font-medium italic">
            Procurement snapshots reflect current BOM quantities. Verify revisions before releasing POs to production.
          </p>
        </div>
      </div>
    </div>
  )
}

export default ProjectSidebar
