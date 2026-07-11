import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ClipboardList, FolderKanban, LayoutDashboard, ShieldAlert, Truck } from 'lucide-react'
import TrackingOverviewTab from '@/components/project-tracking/TrackingOverviewTab'
import TrackingProjectsTab from '@/components/project-tracking/TrackingProjectsTab'
import TrackingDeliveriesTab from '@/components/project-tracking/TrackingDeliveriesTab'
import TrackingIssuesTab from '@/components/project-tracking/TrackingIssuesTab'
import TrackingWorkItemsTab from '@/components/project-tracking/TrackingWorkItemsTab'

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'projects', label: 'Projects', icon: FolderKanban },
  { key: 'deliveries', label: 'Deliveries', icon: Truck },
  { key: 'issues', label: 'Issues', icon: ShieldAlert },
  { key: 'work-items', label: 'Work Items', icon: ClipboardList },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function ProjectTracking() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeTab: TabKey = TABS.some((tab) => tab.key === tabParam) ? (tabParam as TabKey) : 'overview'

  useEffect(() => {
    document.title = 'Project Tracking | BOM Manager'
  }, [])

  return (
    <div className="page-container page-enter space-y-5">
      <div>
        <h1 className="page-title">Project Tracking</h1>
        <p className="mt-1 text-sm text-slate-500">
          Delivery status, issues, and execution follow-ups across projects and purchase orders.
        </p>
      </div>

      <div className="tab-bar">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            className={`tab-item ${activeTab === key ? 'active' : ''}`}
            onClick={() => setSearchParams(key === 'overview' ? {} : { tab: key }, { replace: true })}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <TrackingOverviewTab />}
      {activeTab === 'projects' && <TrackingProjectsTab />}
      {activeTab === 'deliveries' && <TrackingDeliveriesTab />}
      {activeTab === 'issues' && <TrackingIssuesTab />}
      {activeTab === 'work-items' && <TrackingWorkItemsTab />}
    </div>
  )
}
