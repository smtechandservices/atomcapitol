'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import clsx from 'clsx'
import { AlertTriangle, ChevronRight, Hourglass, Inbox, Search, ShieldCheck, X } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, StatCard } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { apiErrorMessage } from '@/lib/api'
import { formatAge } from '@/lib/format'
import type { KycQueueListItem } from '@/types'
import { useKycQueue, useKycQueueStats, type KycQueueFilters } from './api'
import { STEP_LABELS, StepChip, ageTone, initialsOf } from './shared'

type View = NonNullable<KycQueueFilters['view']>
type Focus = '' | 'step2' | 'step3' | 'both' | 'flagged' | 'stale'

const isFlagged = (r: KycQueueListItem) => !r.plot_confirmed && r.step2_status !== null

export function KycQueuePage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [view, setView] = useState<View>('queue')
  const [focus, setFocus] = useState<Focus>('')
  const router = useRouter()

  const { data: stats } = useKycQueueStats()
  const { data, isLoading, error } = useKycQueue({
    page,
    search: search || undefined,
    view,
    needs: view === 'queue' && (focus === 'step2' || focus === 'step3' || focus === 'both') ? focus : undefined,
    flagged: view === 'queue' && focus === 'flagged' ? 'true' : undefined,
    stale: view === 'queue' && focus === 'stale' ? 'true' : undefined,
  })

  const resetTo = (fn: () => void) => {
    setPage(1)
    fn()
  }

  const inQueue = view === 'queue'
  const firstPending = inQueue ? data?.results[0] : undefined

  const columns: Column<KycQueueListItem>[] = [
    {
      key: 'customer',
      header: 'Customer',
      render: (r) => (
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink-800 text-xs font-semibold text-gold-300">
            {initialsOf(r.customer_name, r.customer_email)}
          </span>
          <div className="min-w-0">
            <p className="flex max-w-[240px] items-center gap-1.5 truncate font-medium text-ink-800">
              {r.customer_name || r.customer_email}
              {isFlagged(r) && (
                <span title="Customer flagged a plot mismatch" className="text-amber-500">
                  <AlertTriangle className="size-3.5" />
                </span>
              )}
            </p>
            <p className="max-w-[240px] truncate text-xs text-ink-400">{r.customer_email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'plot',
      header: 'Plot',
      render: (r) =>
        r.plot_number ? (
          <div className="min-w-0">
            <p className="font-medium text-ink-800">{r.plot_number}</p>
            <p className="max-w-[180px] truncate text-xs text-ink-400">{r.project_name}</p>
          </div>
        ) : (
          <span className="text-ink-300">—</span>
        ),
    },
    {
      key: 'steps',
      header: inQueue ? 'Needs review' : 'Steps',
      render: (r) => (
        <div className="flex flex-wrap gap-1.5">
          <StepChip label={STEP_LABELS.STEP2} status={r.step2_status} />
          <StepChip label={STEP_LABELS.STEP3} status={r.step3_status} />
        </div>
      ),
    },
    {
      key: 'time',
      header: inQueue ? 'Waiting' : 'Last reviewed',
      render: (r) =>
        r.waiting_since ? (
          <span className={clsx('text-sm font-semibold tabular-nums', ageTone(r.waiting_since))} title={new Date(r.waiting_since).toLocaleString('en-IN')}>
            {formatAge(r.waiting_since)}
          </span>
        ) : r.reviewed_at ? (
          <span className="text-sm text-ink-500">{formatAge(r.reviewed_at)} ago</span>
        ) : (
          <span className="text-ink-300">—</span>
        ),
    },
    { key: 'open', header: '', className: 'w-10', render: () => <ChevronRight className="size-4 text-ink-300" /> },
  ]

  const views: { key: View; label: string; count?: number }[] = [
    { key: 'queue', label: 'To review', count: stats?.total },
    { key: 'approved', label: 'Approved', count: stats?.approved },
    { key: 'rejected', label: 'Rejected', count: stats?.rejected },
    { key: 'all', label: 'All' },
  ]

  const focuses: { key: Focus; label: string; count?: number; dot?: string }[] = [
    { key: '', label: 'All pending', count: stats?.total },
    { key: 'step2', label: 'Receipt only', count: stats?.step2, dot: 'bg-sky-500' },
    { key: 'step3', label: 'Video only', count: stats?.step3, dot: 'bg-violet-500' },
    { key: 'both', label: 'Both steps', count: stats?.both, dot: 'bg-ink-500' },
    { key: 'flagged', label: 'Plot mismatch', count: stats?.flagged, dot: 'bg-amber-500' },
    { key: 'stale', label: 'Waiting > 2 days', count: stats?.stale, dot: 'bg-red-500' },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="KYC Review"
        subtitle="Oldest submissions first — approve or reject the receipt and video steps independently"
        actions={
          firstPending && (
            <Button variant="secondary" onClick={() => router.push(`/kyc/${firstPending.id}`)}>
              Start reviewing <ChevronRight className="size-4" />
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="To review" value={stats?.total ?? '—'} icon={<Inbox className="size-5" />} accent="gold" className="py-6" />
        <StatCard label="Waiting > 2 days" value={stats?.stale ?? '—'} icon={<Hourglass className="size-5" />} accent="danger" className="py-6" />
        <StatCard label="Plot mismatch flagged" value={stats?.flagged ?? '—'} icon={<AlertTriangle className="size-5" />} accent="ink" className="py-6" />
        <StatCard label="Approved" value={stats?.approved ?? '—'} icon={<ShieldCheck className="size-5" />} accent="success" className="py-6" />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4">
          <div className="flex items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
              <Input
                className="pl-9"
                placeholder="Search by customer name, email or plot"
                value={search}
                onChange={(e) => resetTo(() => setSearch(e.target.value))}
              />
            </div>
            <div className="flex shrink-0 rounded-lg border border-ink-200 bg-ink-50/50 p-0.5">
              {views.map((v) => (
                <button
                  key={v.key}
                  onClick={() =>
                    resetTo(() => {
                      setView(v.key)
                      setFocus('')
                    })
                  }
                  className={clsx(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    view === v.key ? 'bg-white text-ink-800 shadow-sm ring-1 ring-ink-100' : 'text-ink-500 hover:text-ink-800',
                  )}
                >
                  {v.label}
                  {v.count !== undefined && <span className="tabular-nums text-ink-400">{v.count}</span>}
                </button>
              ))}
            </div>
          </div>

          {inQueue && (
            <div className="flex items-center gap-3">
              <div className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 pb-0.5">
                {focuses.map((f) => {
                  const active = focus === f.key
                  return (
                    <button
                      key={f.key || 'all'}
                      onClick={() => resetTo(() => setFocus(f.key))}
                      className={clsx(
                        'flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                        active ? 'border-ink-800 bg-ink-800 text-white' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:bg-ink-50',
                      )}
                    >
                      {f.dot && <span className={clsx('size-1.5 rounded-full', f.dot)} />}
                      {f.label}
                      {f.count !== undefined && (
                        <span className={clsx('rounded-full px-1.5 text-[10px] tabular-nums', active ? 'bg-white/15 text-gold-200' : 'bg-ink-100 text-ink-500')}>
                          {f.count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              {(focus || search) && (
                <button
                  onClick={() =>
                    resetTo(() => {
                      setFocus('')
                      setSearch('')
                    })
                  }
                  className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-ink-400 hover:bg-ink-50 hover:text-ink-700"
                >
                  <X className="size-3.5" /> Clear filters
                </button>
              )}
            </div>
          )}
        </div>

        <DataTable
          columns={columns}
          rows={data?.results ?? []}
          rowKey={(r) => r.id}
          isLoading={isLoading}
          error={error ? apiErrorMessage(error) : null}
          onRowClick={(row) => router.push(`/kyc/${row.id}`)}
          page={page}
          onPageChange={setPage}
          count={data?.count}
          emptyTitle={inQueue ? (focus || search ? 'Nothing matches' : 'Queue is clear') : 'No submissions here'}
          emptySubtitle={inQueue && !focus && !search ? 'No KYC step is waiting for review right now.' : 'Try a different filter.'}
        />
      </Card>
    </div>
  )
}
