import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, BellRing, ChevronDown, ChevronUp, MessageSquarePlus, X } from 'lucide-react'
import { pendingPartsApi, type PendingPartPriority } from '@/api/pending-parts'
import type { WorkDashboardItem } from '@/api/dashboard'
import { useToast } from '@/context/ToastContext'
import { useRole } from '@/hooks/useRole'
import { supabase } from '@/lib/supabase'
import DiscussionThread from '@/components/projects/pending-parts/DiscussionThread'

type DiscussionHubProps = {
  openDiscussions: WorkDashboardItem[]
  closedDiscussions: WorkDashboardItem[]
}

type DiscussionFormState = {
  name: string
  description: string
  priority: PendingPartPriority
  project_id: string
}

const EMPTY_FORM: DiscussionFormState = {
  name: '',
  description: '',
  priority: 'Medium',
  project_id: '',
}

function DiscussionComposerModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [form, setForm] = useState<DiscussionFormState>(EMPTY_FORM)

  const { data: projects = [] } = useQuery({
    queryKey: ['discussion-project-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, project_name, project_number')
        .order('project_name', { ascending: true })
      if (error) throw error
      return data || []
    },
    enabled: isOpen,
  })

  const createDiscussion = useMutation({
    mutationFn: () =>
      pendingPartsApi.createDiscussion({
        name: form.name,
        description: form.description,
        priority: form.priority,
        project_id: form.project_id ? Number(form.project_id) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      setForm(EMPTY_FORM)
      showToast('success', 'Discussion started')
      onClose()
    },
    onError: (err: any) => showToast('error', err.message),
  })

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-navy-900/40 px-4 py-10 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-5">
          <div>
            <h3 className="text-xl font-black text-navy-900">Start Discussion</h3>
            <p className="mt-1 text-sm font-medium text-slate-500">Create a team discussion and tag anyone inside the thread, with or without linking it to a project.</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-white hover:text-red-500">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Topic</label>
            <input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Need vendor confirmation before wiring release"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-[1.1fr,0.9fr]">
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Project Link</label>
              <select
                value={form.project_id}
                onChange={(e) => setForm((prev) => ({ ...prev, project_id: e.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                <option value="">General discussion (no project)</option>
                {projects.map((project: any) => (
                  <option key={project.id} value={project.id}>
                    {project.project_name} ({project.project_number})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value as PendingPartPriority }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                <option value="Urgent">Urgent</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Opening Note</label>
            <textarea
              rows={4}
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Explain what needs to be discussed. After creating the thread, use @mentions inside comments to pull teammates in."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium leading-6 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50/70 px-6 py-5">
          <button onClick={onClose} className="btn btn-secondary px-6">Cancel</button>
          <button
            onClick={() => createDiscussion.mutate()}
            disabled={!form.name.trim() || createDiscussion.isPending}
            className="btn btn-primary px-6"
          >
            {createDiscussion.isPending ? 'Starting...' : 'Start Discussion'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DiscussionCard({
  discussion,
  defaultOpen = false,
}: {
  discussion: WorkDashboardItem
  defaultOpen?: boolean
}) {
  const queryClient = useQueryClient()
  const { isAdmin } = useRole()
  const { showToast } = useToast()
  const [expanded, setExpanded] = useState(defaultOpen)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useQuery({
    queryKey: ['discussion-viewer', discussion.id],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser()
      const id = data.user?.id || null
      setCurrentUserId(id)
      return id
    },
  })

  const canManage = isAdmin || currentUserId === discussion.created_by

  const toggleDiscussionStatus = useMutation({
    mutationFn: (nextStatus: 'open' | 'closed') => pendingPartsApi.updateDiscussionStatus(discussion.id, nextStatus),
    onSuccess: (_, nextStatus) => {
      queryClient.invalidateQueries({ queryKey: ['work-dashboard'] })
      showToast('success', nextStatus === 'closed' ? 'Discussion moved to archive' : 'Discussion reopened')
    },
    onError: (err: any) => showToast('error', err.message),
  })

  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
              discussion.discussion_status === 'closed'
                ? 'border-slate-200 bg-slate-100 text-slate-500'
                : 'border-sky-200 bg-sky-50 text-sky-700'
            }`}>
              {discussion.discussion_status === 'closed' ? 'Archived' : 'Open Discussion'}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
              {discussion.priority}
            </span>
            <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
              {discussion.project_name ? `${discussion.project_name} • ${discussion.project_number}` : 'General'}
            </span>
          </div>
          <h3 className="mt-3 text-lg font-black text-navy-900">{discussion.name}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {discussion.description || 'Open the thread to continue the discussion and tag teammates.'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500">
            <span>Started by {discussion.requester_name || discussion.requester_email || 'Unknown'}</span>
            <span>{discussion.comment_count || 0} comments</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canManage && (
            <button
              onClick={() => toggleDiscussionStatus.mutate(discussion.discussion_status === 'closed' ? 'open' : 'closed')}
              className={`rounded-2xl border px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${
                discussion.discussion_status === 'closed'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {discussion.discussion_status === 'closed' ? 'Reopen' : 'Close'}
            </button>
          )}
          <button
            onClick={() => setExpanded((prev) => !prev)}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 transition-colors hover:bg-slate-100"
          >
            <span className="mr-2 inline-flex align-middle">{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
            Thread
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100">
          <DiscussionThread
            pendingPartId={discussion.id}
            projectId={discussion.project_id}
            partStatus="Pending"
            mode="discussion"
            refreshKeys={[['work-dashboard']]}
          />
        </div>
      )}
    </div>
  )
}

export default function DiscussionHub({ openDiscussions, closedDiscussions }: DiscussionHubProps) {
  const [composerOpen, setComposerOpen] = useState(false)

  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-[linear-gradient(135deg,#081225_0%,#102544_58%,#203a67_100%)] p-6 text-white shadow-xl shadow-slate-900/10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-sky-100">
              <BellRing size={12} />
              Team Discussion Hub
            </div>
            <h2 className="mt-4 text-3xl font-black tracking-tight">Cross-team threads, project-linked or independent</h2>
            <p className="mt-3 text-sm leading-6 text-slate-200">
              Start a discussion from the dashboard, tag anyone in the thread, and archive it once the issue is resolved so active conversations stay clean.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-100">Open</div>
              <div className="mt-2 text-3xl font-black">{openDiscussions.length}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-100">Archived</div>
              <div className="mt-2 text-3xl font-black">{closedDiscussions.length}</div>
            </div>
            <button
              onClick={() => setComposerOpen(true)}
              className="rounded-2xl border border-amber-300/30 bg-amber-300/20 px-4 py-3 text-left transition-colors hover:bg-amber-300/30"
            >
              <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-amber-100">
                <MessageSquarePlus size={12} />
                Start New
              </div>
              <div className="mt-2 text-sm font-bold text-white">Open a discussion</div>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr,0.85fr]">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-black text-navy-900">Open Discussions</h3>
              <p className="text-sm font-medium text-slate-500">Threads that still need input, dependency checks, or decisions.</p>
            </div>
          </div>

          {openDiscussions.length ? openDiscussions.map((discussion) => (
            <DiscussionCard key={discussion.id} discussion={discussion} />
          )) : (
            <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
              <BellRing className="mx-auto h-10 w-10 text-slate-300" />
              <h3 className="mt-4 text-lg font-black text-navy-900">No open discussions</h3>
              <p className="mt-2 text-sm font-medium text-slate-500">Start one whenever the team needs a visible shared thread.</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-xl font-black text-navy-900">Discussion Archive</h3>
            <p className="text-sm font-medium text-slate-500">Resolved or closed threads move here so the active list stays focused.</p>
          </div>

          {closedDiscussions.length ? closedDiscussions.map((discussion) => (
            <DiscussionCard key={discussion.id} discussion={discussion} />
          )) : (
            <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
              <Archive className="mx-auto h-10 w-10 text-slate-300" />
              <h3 className="mt-4 text-lg font-black text-navy-900">Archive is empty</h3>
              <p className="mt-2 text-sm font-medium text-slate-500">Closed discussions will appear here once a thread is marked complete.</p>
            </div>
          )}
        </div>
      </div>

      <DiscussionComposerModal isOpen={composerOpen} onClose={() => setComposerOpen(false)} />
    </section>
  )
}
