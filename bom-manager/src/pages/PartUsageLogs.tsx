import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Search, FileClock, Calendar, History, Box, Briefcase, MapPin, Activity, ChevronRight } from 'lucide-react'

const PartUsageLogs = () => {
  const [searchTerm, setSearchTerm] = useState('')

  const { data: logs, isLoading } = useQuery<any[]>({
    queryKey: ['part-usage-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('part_usage_logs')
        .select('*')
        .order('use_date_time', { ascending: false })
      if (error) throw error
      return data
    }
  })

  const filteredLogs = (logs || []).filter(log => 
    log.part_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.project_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.site_name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const renderSkeletons = () => (
    <div className="card overflow-hidden">
      <div className="p-6 space-y-4">
        {[1, 2, 3, 4, 5].map(n => (
          <div key={n} className="skeleton h-14 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )

  return (
    <div className="page-container page-enter">
      {/* Header */}
      <header className="page-header">
        <div>
          <p className="label-caps mb-1.5 flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-navy-500" />
            Operational History
          </p>
          <h1 className="page-title">Part Utilization Logs</h1>
        </div>
      </header>

      {/* Toolbar */}
      <div className="section-card p-4 mb-8">
        <div className="relative w-full">
           <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-tertiary" />
           <input
             type="text"
             className="input pl-11"
             placeholder="Search by part number, project entity or field site identity…"
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
           />
        </div>
      </div>

      {/* Main Stream */}
      <div className="flex-1">
        {isLoading ? renderSkeletons() : filteredLogs.length === 0 ? (
          <div className="empty-state py-24">
            <div className="bg-slate-50 w-24 h-24 rounded-full flex items-center justify-center mb-6 border border-slate-100 shadow-inner">
              <History size={40} className="text-tertiary" />
            </div>
            <h3 className="section-title mb-2">No utilization events recorded</h3>
            <p className="text-secondary mb-8 max-w-sm text-center">
              The operational audit legacy is currently empty for the selected filters.
            </p>
          </div>
        ) : (
          <div className="card shadow-sm overflow-hidden">
             <table className="data-table-modern">
               <thead>
                 <tr>
                   <th>Event Timestamp</th>
                   <th>Project Entity</th>
                   <th>Asset Identifier</th>
                   <th className="text-right">Quantity</th>
                   <th>Deployed Site</th>
                 </tr>
               </thead>
               <tbody>
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="table-row-hover group">
                      <td>
                        <div className="flex items-center gap-3">
                          <Calendar className="w-4 h-4 text-slate-300" />
                          <div>
                            <p className="text-xs font-black text-navy-900 tabular-nums leading-none mb-1">
                              {new Date(log.use_date_time).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </p>
                            <p className="text-[10px] font-bold text-tertiary tabular-nums">
                              {new Date(log.use_date_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 bg-navy-50 rounded-lg text-navy-600">
                             <Briefcase size={14} />
                          </div>
                          <span className="text-sm font-black text-navy-900 uppercase tracking-tight group-hover:text-amber-700 transition-colors">
                            {log.project_name}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-3">
                           <Box size={14} className="text-slate-300" />
                           <span className="badge badge-navy !px-4 !py-1 !text-[11px] font-mono font-black tracking-tighter">
                             {log.part_number}
                           </span>
                        </div>
                      </td>
                      <td className="text-right">
                         <span className="text-lg font-black text-navy-900 tabular-nums leading-none italic tracking-tighter shadow-sm p-1">
                            {log.quantity}
                         </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <MapPin size={12} className="text-red-400 opacity-60" />
                          <span className="label-caps !text-[10px] !text-secondary italic">
                            {log.site_name || 'Generic Deployment Site'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
               </tbody>
             </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default PartUsageLogs
