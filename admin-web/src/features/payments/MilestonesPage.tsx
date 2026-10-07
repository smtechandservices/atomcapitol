'use client'

import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { AlarmClock, CalendarClock, ChevronRight, CircleDollarSign, FileSearch, FolderOpen, Search, X } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, StatCard } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { apiErrorMessage } from '@/lib/api'
import { formatCurrency, formatCurrencyCompact, formatDate } from '@/lib/format'
import { useAllProjects } from '@/features/projects/api'
import { usePlots } from '@/features/plots/api'
import type { Milestone, MilestoneStatus } from '@/types'
import { useMilestoneStats, useMilestones } from './api'
import { MILESTONE_STATUSES, MilestonePill, dueHint } from './milestoneStatus'
import { PlotScheduleDrawer } from './PlotScheduleDrawer'

type View = 'attention' | MilestoneStatus | 'all'

const VIEW_FILTER: Record<View, { status?: string; status__in?: string; ordering: string }> = {
  attention: { status__in: 'OVERDUE,DUE', ordering: 'due_date' },
  OVERDUE: { status: 'OVERDUE', ordering: 'due_date' },
  DUE: { status: 'DUE', ordering: 'due_date' },
  UNDER_REVIEW: { status: 'UNDER_REVIEW', ordering: 'due_date' },
  UPCOMING: { status: 'UPCOMING', ordering: 'due_date' },
  PAID: { status: 'PAID', ordering: '-due_date' },
  REJECTED: { status: 'REJECTED', ordering: 'due_date' },
  all: { ordering: 'due_date' },
}

export function MilestonesPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [project, setProject] = useState('')
  const [view, setView] = useState<View>('attention')
  const [openPlotId, setOpenPlotId] = useState<number | null>(null)
  const [findOpen, setFindOpen] = useState(false)

  const { data: projects } = useAllProjects()
  const { data: stats } = useMilestoneStats(project || undefined)
  const { data, isLoading, error } = useMilestones({
    page,
    search: search || undefined,
    plot__project: project || undefined,
    ...VIEW_FILTER[view],
  })

  const resetTo = (fn: () => void) => {
    setPage(1)
    fn()
  }

  const count = (s: MilestoneStatus) => stats?.[s].count
  const hasFilters = !!(search || project)

  const columns: Column<Milestone>[] = [
    {
      key: 'plot',
      header: 'Plot',
      render: (m) => (
        <div className="min-w-0">
          <p className="font-semibold text-ink-800">{m.plot_number}</p>
          <p className="max-w-[180px] truncate text-xs text-ink-400">{m.project_name}</p>
        </div>
      ),
    },
    {
      key: 'buyer',
      header: 'Buyer',
      render: (m) =>
        m.buyer ? (
          <div className="min-w-0">
            <p className="max-w-[200px] truncate text-ink-800">{m.buyer.name || m.buyer.email}</p>
            {m.buyer.name && <p className="max-w-[200px] truncate text-xs text-ink-400">{m.buyer.email}</p>}
          </div>
        ) : (
          <span className="text-ink-300">No buyer</span>
        ),
    },
    {
      key: 'milestone',
      header: 'Milestone',
      render: (m) => (
        <div className="flex items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink-50 text-[11px] font-semibold text-ink-500 ring-1 ring-ink-100">
            {m.sequence}
          </span>
          <span className="max-w-[200px] truncate text-ink-700">{m.name}</span>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-right',
      render: (m) => <span className="font-semibold tabular-nums text-ink-800">{formatCurrency(m.amount)}</span>,
    },
    {
      key: 'due',
      header: 'Due',
      render: (m) => {
        const hint = dueHint(m)
        return (
          <div>
            <p className="text-ink-700">{formatDate(m.due_date)}</p>
            <p className={clsx('text-xs font-medium', hint.tone)}>{hint.text}</p>
          </div>
        )
      },
    },
    { key: 'status', header: 'Status', render: (m) => <MilestonePill status={m.status} /> },
    { key: 'open', header: '', className: 'w-10', render: () => <ChevronRight className="size-4 text-ink-300" /> },
  ]

  const views: { key: View; label: string; count?: number; dot?: string }[] = [
    {
      key: 'attention',
      label: 'Needs attention',
      count: stats ? stats.OVERDUE.count + stats.DUE.count : undefined,
      dot: 'bg-red-500',
    },
    ...MILESTONE_STATUSES.filter((s) => s.value !== 'REJECTED' || (count('REJECTED') ?? 0) > 0).map((s) => ({
      key: s.value as View,
      label: s.label,
      count: count(s.value),
      dot: s.dot,
    })),
    { key: 'all', label: 'All' },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Milestones"
        subtitle="Payment schedules across every plot — overdue and due instalments first"
        actions={
          <Button variant="outline" onClick={() => setFindOpen(true)}>
            <FolderOpen className="size-4" /> Open a plot&apos;s schedule
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label={`Overdue · ${stats?.OVERDUE.count ?? '—'} milestones`}
          value={stats ? formatCurrencyCompact(stats.OVERDUE.amount) : '—'}
          icon={<AlarmClock className="size-5" />}
          accent="danger"
          className="py-6"
        />
        <StatCard
          label={`Due now · ${stats?.DUE.count ?? '—'} milestones`}
          value={stats ? formatCurrencyCompact(stats.DUE.amount) : '—'}
          icon={<CalendarClock className="size-5" />}
          accent="gold"
          className="py-6"
        />
        <StatCard
          label={`Under review · ${stats?.UNDER_REVIEW.count ?? '—'} proofs`}
          value={stats ? formatCurrencyCompact(stats.UNDER_REVIEW.amount) : '—'}
          icon={<FileSearch className="size-5" />}
          accent="ink"
          className="py-6"
        />
        <StatCard
          label={`Collected · ${stats?.PAID.count ?? '—'} milestones`}
          value={stats ? formatCurrencyCompact(stats.PAID.amount) : '—'}
          icon={<CircleDollarSign className="size-5" />}
          accent="success"
          className="py-6"
        />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4">
          <div className="flex items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
              <Input
                className="pl-9"
                placeholder="Search by plot number, buyer or milestone name"
                value={search}
                onChange={(e) => resetTo(() => setSearch(e.target.value))}
              />
            </div>
            {/* Select is w-full by default, so the wrapper sets its width */}
            <div className="w-56 shrink-0">
              <Select value={project} onChange={(e) => resetTo(() => setProject(e.target.value))}>
                <option value="">All projects</option>
                {projects?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 pb-0.5">
              {views.map((v) => {
                const active = view === v.key
                return (
                  <button
                    key={v.key}
                    onClick={() => resetTo(() => setView(v.key))}
                    className={clsx(
                      'flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      active ? 'border-ink-800 bg-ink-800 text-white' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:bg-ink-50',
                    )}
                  >
                    {v.dot && <span className={clsx('size-1.5 rounded-full', v.dot)} />}
                    {v.label}
                    {v.count !== undefined && (
                      <span className={clsx('rounded-full px-1.5 text-[10px] tabular-nums', active ? 'bg-white/15 text-gold-200' : 'bg-ink-100 text-ink-500')}>
                        {v.count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {hasFilters && (
              <button
                onClick={() =>
                  resetTo(() => {
                    setSearch('')
                    setProject('')
                  })
                }
                className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-ink-400 hover:bg-ink-50 hover:text-ink-700"
              >
                <X className="size-3.5" /> Clear filters
              </button>
            )}
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={data?.results ?? []}
          rowKey={(r) => r.id}
          isLoading={isLoading}
          error={error ? apiErrorMessage(error) : null}
          onRowClick={(m) => setOpenPlotId(m.plot)}
          page={page}
          onPageChange={setPage}
          count={data?.count}
          emptyTitle={view === 'attention' && !hasFilters ? 'Nothing overdue or due' : 'No milestones match'}
          emptySubtitle={view === 'attention' && !hasFilters ? 'Every instalment is either paid, under review, or not due yet.' : 'Try a different filter.'}
        />
      </Card>

      {openPlotId !== null && <PlotScheduleDrawer plotId={openPlotId} onClose={() => setOpenPlotId(null)} />}

      <FindPlotModal
        open={findOpen}
        onClose={() => setFindOpen(false)}
        onPick={(id) => {
          setFindOpen(false)
          setOpenPlotId(id)
        }}
      />
    </div>
  )
}

/** Pick any plot (including ones without a schedule yet) to open its schedule. */
function FindPlotModal({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (plotId: number) => void }) {
  const [text, setText] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 250)
    return () => clearTimeout(t)
  }, [text])
  const { data, isFetching } = usePlots({ search: debounced || undefined, page: 1 })

  return (
    <Modal open={open} onClose={onClose} title="Open a plot's schedule">
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
          <Input autoFocus className="pl-9 pr-9" placeholder="Search plot number or block" value={text} onChange={(e) => setText(e.target.value)} />
          {isFetching && <Spinner className="absolute right-3 top-1/2 size-4 -translate-y-1/2" />}
        </div>
        <ul className="max-h-80 divide-y divide-ink-100 overflow-y-auto rounded-lg border border-ink-100">
          {data?.results.map((p) => {
            const primary = p.buyers.find((b) => b.plot_role === 'PRIMARY')
            return (
              <li key={p.id}>
                <button onClick={() => onPick(p.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-gold-50/60">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-800">
                      {p.plot_number} <span className="font-normal text-ink-400">· {p.project_name}</span>
                    </p>
                    <p className="truncate text-xs text-ink-400">{primary ? primary.name || primary.email : 'No buyer assigned'}</p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-ink-300" />
                </button>
              </li>
            )
          })}
          {data?.results.length === 0 && <li className="px-3 py-6 text-center text-xs text-ink-400">No plots match.</li>}
        </ul>
      </div>
    </Modal>
  )
}
