import { useState } from 'react'
import { Filter, Save } from 'lucide-react'

const AdvancedFilterBar = ({ onFilterChange }: { onFilterChange: (filters: any) => void }) => {
  const [filters, setFilters] = useState({
    partType: '',
    minQty: '',
    supplier: '',
  })
  const [savedViews, setSavedViews] = useState<string[]>(['All Active', 'Low Stock', 'Mech Only'])

  const handleSaveView = () => {
    const name = prompt('Name this view')
    if (name) setSavedViews([...savedViews, name])
  }

  const handleFilterChange = (key: string, value: string) => {
    const updated = { ...filters, [key]: value }
    setFilters(updated)
    onFilterChange(updated)
  }

  return (
    <div className="flex flex-wrap items-center gap-4 mb-6 bg-white border border-gray-100 rounded-3xl p-3 shadow-sm">
      <div className="flex items-center gap-2 px-3 border-r border-slate-100">
        <Filter className="h-4 w-4 text-slate-400" />
        <span className="font-bold text-xs uppercase tracking-widest text-navy-900">Filters</span>
      </div>

      <select
        value={filters.partType}
        onChange={(e) => handleFilterChange('partType', e.target.value)}
        className="input text-xs py-1.5 px-3 min-w-[140px]"
      >
        <option value="">All Types</option>
        <option value="mechanical_manufacture">Mech Mfg</option>
        <option value="mechanical_bought_out">Mech BOP</option>
        <option value="electrical_manufacture">Electrical Mfg</option>
        <option value="electrical_bought_out">Electrical BOP</option>
        <option value="pneumatic_bought_out">Pneumatic BOP</option>
      </select>

      <input 
        type="number"
        placeholder="Min Qty..."
        value={filters.minQty}
        onChange={(e) => handleFilterChange('minQty', e.target.value)}
        className="input text-xs py-1.5 px-3 w-28"
      />

      <button onClick={handleSaveView} className="btn-secondary flex items-center gap-2 text-xs py-1.5 px-3">
        <Save className="h-3 w-3" /> Save View
      </button>

      <div className="flex flex-wrap gap-2 ml-auto">
        {savedViews.map((view) => (
          <button key={view} className="px-3 py-1 text-[10px] font-black uppercase tracking-widest border border-slate-200 text-slate-500 rounded-lg hover:border-slate-300 hover:text-navy-900 transition-colors">
            {view}
          </button>
        ))}
      </div>
    </div>
  )
}

export default AdvancedFilterBar
