'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import {
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  GitPullRequestArrow,
  Info,
  ListOrdered,
  MessageSquareQuote,
  Paperclip,
  Search,
  Split,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, StatCard } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { absoluteMediaUrl, formatAge, formatCurrency, formatDate, formatDateTime } from '@/lib/format'
import { useAllProjects } from '@/features/projects/api'
import { ageTone } from '@/features/kyc/shared'
import type { Milestone, MilestoneChangeRequest, MilestoneChangeType, ScheduleItem } from '@/types'
import {
  useApproveChangeRequest,
  useChangeRequestCounts,
  useChangeRequests,
  useCounterChangeRequest,
  useDeclineChangeRequest,
  usePlotSchedule,
} from './api'
import { buildProposal, replaceable, scheduleTotal } from './changeProposal'
import { MilestonePill } from './milestoneStatus'
import { PlotScheduleDrawer } from './PlotScheduleDrawer'
import { ScheduleEditor } from './ScheduleEditor'

type StatusView = 'PENDING' | 'COUNTERED' | 'APPROVED' | 'DECLINED' | 'all'

const TYPE_META: Record<MilestoneChangeType, { label: string; icon: ReactNode; tone: string }> = {
  CHANGE_DATE: { label: 'Change due date', icon: <CalendarRange className="size-3.5" />, tone: 'bg-sky-50 text-sky-700 ring-sky-200' },
  PAY_MORE: { label: 'Pay more now', icon: <TrendingUp className="size-3.5" />, tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  PAY_LESS: { label: 'Pay less', icon: <TrendingDown className="size-3.5" />, tone: 'bg-amber-50 text-amber-800 ring-amber-200' },
  CHANGE_INSTALMENTS: { label: 'Change instalment count', icon: <ListOrdered className="size-3.5" />, tone: 'bg-violet-50 text-violet-700 ring-violet-200' },
  RESPLIT: { label: 'Re-split balance', icon: <Split className="size-3.5" />, tone: 'bg-ink-50 text-ink-700 ring-ink-200' },
}

const STATUS_META: Record<Exclude<StatusView, 'all'>, { label: string; dot: string }> = {
  PENDING: { label: 'Pending', dot: 'bg-sky-500' },
  COUNTERED: { label: 'Countered', dot: 'bg-violet-500' },
  APPROVED: { label: 'Approved', dot: 'bg-emerald-500' },
  DECLINED: { label: 'Declined', dot: 'bg-red-400' },
}

const DECLINE_REASONS = [
  'Outside the payment policy for this project',
  'Too many changes requested already',
  'Please clear overdue instalments first',
  'Requested date is too far out',
]

const PAGE_SIZE = 20

export function ChangeRequestsPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [project, setProject] = useState('')
  const [view, setView] = useState<StatusView>('PENDING')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [schedulePlotId, setSchedulePlotId] = useState<number | null>(null)

  const { data: projects } = useAllProjects()
  const { data: counts } = useChangeRequestCounts(project || undefined)
  const { data, isLoading, error } = useChangeRequests({
    page,
    search: search || undefined,
    plot__project: project || undefined,
    status: view === 'all' ? undefined : view,
    // pending: oldest first; history: newest first
    ordering: view === 'PENDING' ? 'created_at' : '-created_at',
  })

  const rows = data?.results ?? []
  const selected = rows.find((r) => r.id === selectedId) ?? rows[0] ?? null
  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1

  const resetTo = (fn: () => void) => {
    setPage(1)
    setSelectedId(null)
    fn()
  }

  const advance = (decidedId: number) => {
    const i = rows.findIndex((r) => r.id === decidedId)
    setSelectedId((rows[i + 1] ?? rows[i - 1])?.id ?? null)
  }

  const views: { key: StatusView; label: string; count?: number; dot?: string }[] = [
    ...(Object.keys(STATUS_META) as (keyof typeof STATUS_META)[]).map((k) => ({ key: k, label: STATUS_META[k].label, count: counts?.[k], dot: STATUS_META[k].dot })),
    { key: 'all', label: 'All', count: counts?.all },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Milestone Change Requests" subtitle="Customers asking to move dates, pay more or less, or re-split their remaining balance" />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Pending review" value={counts?.PENDING ?? '—'} icon={<Clock className="size-5" />} accent="gold" className="py-6" />
        <StatCard label="Countered" value={counts?.COUNTERED ?? '—'} icon={<GitPullRequestArrow className="size-5" />} accent="ink" className="py-6" />
        <StatCard label="Approved" value={counts?.APPROVED ?? '—'} icon={<CheckCircle2 className="size-5" />} accent="success" className="py-6" />
        <StatCard label="Declined" value={counts?.DECLINED ?? '—'} icon={<XCircle className="size-5" />} accent="danger" className="py-6" />
      </div>

      <Card className="overflow-clip">
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4">
          <div className="flex items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
              <Input
                className="pl-9"
                placeholder="Search by customer or plot number"
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
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
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
        </div>

        {isLoading ? (
          <FullPageSpinner />
        ) : error ? (
          <ErrorState message={apiErrorMessage(error)} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="size-6" />}
            title={view === 'PENDING' && !search && !project ? 'No requests waiting' : 'Nothing here'}
            subtitle={view === 'PENDING' && !search && !project ? 'Customers have no pending schedule change requests.' : 'Try a different filter.'}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr]">
            {/* Pinned while the (taller) review panel scrolls */}
            <div className="flex max-h-[420px] flex-col border-b border-ink-100 lg:sticky lg:top-0 lg:max-h-screen lg:self-start lg:border-b-0">
              <ul className="min-h-0 flex-1 divide-y divide-ink-100 overflow-y-auto">
                {rows.map((r) => (
                  <RequestListItem key={r.id} request={r} active={selected?.id === r.id} onClick={() => setSelectedId(r.id)} />
                ))}
              </ul>
              {totalPages > 1 && (
                <div className="mt-auto flex items-center justify-between border-t border-ink-100 px-4 py-2.5">
                  <p className="text-xs text-ink-400">
                    Page {page} of {totalPages} · {data?.count}
                  </p>
                  <div className="flex gap-1">
                    {[
                      { to: page - 1, disabled: page <= 1, icon: <ChevronLeft className="size-4" /> },
                      { to: page + 1, disabled: page >= totalPages, icon: <ChevronRight className="size-4" /> },
                    ].map((b, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setPage(b.to)
                          setSelectedId(null)
                        }}
                        disabled={b.disabled}
                        className="flex size-7 items-center justify-center rounded-lg border border-ink-100 text-ink-500 hover:bg-ink-50 disabled:opacity-40"
                      >
                        {b.icon}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {selected && (
              <ReviewPanel
                key={selected.id}
                request={selected}
                onDecided={() => advance(selected.id)}
                onOpenSchedule={() => setSchedulePlotId(selected.plot)}
              />
            )}
          </div>
        )}
      </Card>

      {schedulePlotId !== null && <PlotScheduleDrawer plotId={schedulePlotId} onClose={() => setSchedulePlotId(null)} />}
    </div>
  )
}

function TypeChip({ type }: { type: MilestoneChangeType }) {
  const meta = TYPE_META[type] ?? TYPE_META.RESPLIT
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1', meta.tone)}>
      {meta.icon}
      {meta.label}
    </span>
  )
}

function RequestListItem({ request: r, active, onClick }: { request: MilestoneChangeRequest; active: boolean; onClick: () => void }) {
  const pending = r.status === 'PENDING'
  return (
    <li>
      <button
        onClick={onClick}
        className={clsx(
          'flex w-full flex-col gap-1.5 border-l-2 px-4 py-3 text-left transition-colors',
          active ? 'border-gold-500 bg-gold-50/70' : 'border-transparent hover:bg-ink-50/70',
        )}
      >
        <div className="flex w-full items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink-800">{r.requested_by_name || r.requested_by_email}</p>
            <p className="truncate text-xs text-ink-400">
              {r.plot_number} · {r.project_name}
            </p>
          </div>
          {pending ? (
            <span className={clsx('shrink-0 text-xs font-medium tabular-nums', ageTone(r.created_at))}>{formatAge(r.created_at)}</span>
          ) : (
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-500">
              <span className={clsx('size-1.5 rounded-full', STATUS_META[r.status].dot)} />
              {STATUS_META[r.status].label}
            </span>
          )}
        </div>
        <TypeChip type={r.change_type} />
      </button>
    </li>
  )
}

/** Plain-English description of what the customer asked for, resolved against the plot's schedule. */
function describeRequest(r: MilestoneChangeRequest, schedule: Milestone[]): { headline: ReactNode; targetId?: number; proposedDate?: string } {
  const d = r.proposed_details as Record<string, string | number | undefined>
  const open = replaceable(schedule)
  const next = open[0]
  const outstanding = open.reduce((s, m) => s + Number(m.amount), 0)

  switch (r.change_type) {
    case 'CHANGE_DATE': {
      const target = schedule.find((m) => m.sequence === Number(d.milestone_sequence))
      const newDate = String(d.new_due_date ?? '')
      return {
        targetId: target?.id,
        proposedDate: newDate,
        headline: target ? (
          <>
            Move <b>{target.name}</b> from <b>{formatDate(target.due_date)}</b> <ArrowRight className="inline size-3.5" /> <b>{formatDate(newDate)}</b>
          </>
        ) : (
          <>
            Move milestone #{String(d.milestone_sequence)} to <b>{formatDate(newDate)}</b>
          </>
        ),
      }
    }
    case 'PAY_MORE':
    case 'PAY_LESS':
      return {
        targetId: next?.id,
        headline: (
          <>
            Pay <b>{formatCurrency(d.amount)}</b>
            {next ? (
              <>
                {' '}
                for <b>{next.name}</b> instead of <b>{formatCurrency(next.amount)}</b>
              </>
            ) : (
              ' towards the next instalment'
            )}
          </>
        ),
      }
    case 'CHANGE_INSTALMENTS':
      return {
        headline: (
          <>
            Split the remaining <b>{formatCurrency(outstanding)}</b> into <b>{String(d.new_instalment_count)} instalments</b> (currently {open.length})
          </>
        ),
      }
    default:
      return { headline: <>Re-split the remaining <b>{formatCurrency(outstanding)}</b></> }
  }
}

function ReviewPanel({ request: r, onDecided, onOpenSchedule }: { request: MilestoneChangeRequest; onDecided: () => void; onOpenSchedule: () => void }) {
  const { data: schedule = [], isLoading } = usePlotSchedule(r.plot)
  const summary = describeRequest(r, schedule)
  const paid = schedule.filter((m) => m.status === 'PAID').reduce((s, m) => s + Number(m.amount), 0)
  const overdue = schedule.filter((m) => m.status === 'OVERDUE').length
  const d = r.proposed_details as Record<string, unknown>

  return (
    <div className="min-w-0 space-y-5 p-5 lg:border-l lg:border-ink-100">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/customers/${r.requested_by}`} className="block truncate text-lg font-semibold text-ink-800 hover:text-gold-700">
            {r.requested_by_name || r.requested_by_email}
          </Link>
          <p className="truncate text-sm text-ink-400">
            Plot {r.plot_number} · {r.project_name} · requested {formatDateTime(r.created_at)}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onOpenSchedule}>
          <ListOrdered className="size-3.5" /> Edit schedule
        </Button>
      </div>

      {/* What they asked for */}
      <div className="space-y-3 rounded-xl border border-ink-100 p-4">
        <TypeChip type={r.change_type} />
        <p className="text-base text-ink-700 [&_b]:font-semibold [&_b]:text-ink-900">{isLoading ? 'Loading schedule…' : summary.headline}</p>
        {r.reason && (
          <p className="flex gap-2 text-sm text-ink-500">
            <MessageSquareQuote className="mt-0.5 size-4 shrink-0 text-ink-300" />
            <span>&ldquo;{r.reason}&rdquo;</span>
          </p>
        )}
        {r.attachment && (
          <a
            href={absoluteMediaUrl(r.attachment) ?? undefined}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gold-700 hover:text-gold-800"
          >
            <Paperclip className="size-3.5" /> View attachment
          </a>
        )}
        {Object.keys(d).length > 0 && (
          <details className="text-xs text-ink-400">
            <summary className="cursor-pointer select-none hover:text-ink-600">Submitted details</summary>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
              {Object.entries(d).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="capitalize">{k.replaceAll('_', ' ')}</dt>
                  <dd className="font-mono text-ink-600">{String(v)}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}
      </div>

      {/* Current schedule with the affected milestone highlighted */}
      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-sm font-semibold text-ink-800">Current schedule</h4>
          <p className="text-xs text-ink-400">
            Paid {formatCurrency(paid)}
            {overdue > 0 && <span className="font-medium text-red-600"> · {overdue} overdue</span>}
          </p>
        </div>
        {isLoading ? (
          <p className="text-sm text-ink-400">Loading…</p>
        ) : schedule.length === 0 ? (
          <p className="rounded-lg border border-dashed border-ink-200 px-4 py-6 text-center text-sm text-ink-400">This plot has no milestones.</p>
        ) : (
          <ul className="divide-y divide-ink-100 overflow-hidden rounded-lg border border-ink-100">
            {schedule.map((m) => {
              const target = m.id === summary.targetId
              return (
                <li key={m.id} className={clsx('flex items-center gap-3 px-3 py-2 text-sm', target ? 'bg-gold-50' : m.status === 'PAID' && 'bg-ink-50/40 text-ink-400')}>
                  <span className="w-5 shrink-0 text-xs font-semibold text-ink-400">{m.sequence}</span>
                  <span className={clsx('min-w-0 flex-1 truncate', target && 'font-medium text-ink-900')}>{m.name}</span>
                  <span className="hidden w-40 shrink-0 text-xs sm:block">
                    {formatDate(m.due_date)}
                    {target && summary.proposedDate && (
                      <span className="block font-semibold text-gold-800">→ {formatDate(summary.proposedDate)}</span>
                    )}
                  </span>
                  <span className="w-28 shrink-0 text-right tabular-nums">{formatCurrency(m.amount)}</span>
                  <span className="w-28 shrink-0 text-right">
                    <MilestonePill status={m.status} />
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {r.status === 'PENDING' ? (
        <DecisionArea request={r} schedule={schedule} onDecided={onDecided} onOpenSchedule={onOpenSchedule} />
      ) : (
        <Outcome request={r} />
      )}
    </div>
  )
}

function DecisionArea({
  request: r,
  schedule,
  onDecided,
  onOpenSchedule,
}: {
  request: MilestoneChangeRequest
  schedule: Milestone[]
  onDecided: () => void
  onOpenSchedule: () => void
}) {
  const toast = useToast()
  const approve = useApproveChangeRequest(r.id)
  const decline = useDeclineChangeRequest(r.id)
  const counter = useCounterChangeRequest(r.id)
  const [mode, setMode] = useState<'choose' | 'approve' | 'counter' | 'decline'>('choose')
  const [draft, setDraft] = useState<ScheduleItem[]>([])
  const [warning, setWarning] = useState<string | undefined>()
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')

  const open = replaceable(schedule)
  const outstanding = open.reduce((s, m) => s + Number(m.amount), 0)
  const busy = approve.isPending || decline.isPending || counter.isPending

  const run = async (fn: () => Promise<unknown>, message: string) => {
    try {
      await fn()
      toast.success(message)
      onDecided()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  // Approve and counter both start from the customer's request applied to the unpaid milestones.
  const start = (next: 'approve' | 'counter') => {
    const proposal = buildProposal(r, schedule)
    setDraft(proposal.schedule)
    setWarning(proposal.warning)
    setMode(next)
  }

  const draftValid = draft.length > 0 && draft.every((s) => Number(s.amount) > 0 && s.due_date)
  const totalMatches = Math.abs(scheduleTotal(draft) - outstanding) < 1

  const lines = reason.split('\n').map((l) => l.trim())
  const togglePreset = (preset: string) =>
    setReason((cur) => (lines.includes(preset) ? lines.filter((l) => l && l !== preset).join('\n') : [cur.trim(), preset].filter(Boolean).join('\n')))

  if (mode === 'approve') {
    return (
      <div className="space-y-3 border-t border-ink-100 pt-5">
        <div>
          <h4 className="text-sm font-semibold text-ink-800">Approve with this schedule</h4>
          <p className="text-xs text-ink-400">
            Replaces the {open.length} unpaid milestone(s) with the rows below; paid and under-review ones stay as they are. Edit anything before approving.
          </p>
        </div>
        {warning && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{warning}</p>}
        <ScheduleEditor schedule={draft} onChange={setDraft} target={outstanding} />
        {!totalMatches && draftValid && (
          <p className="text-xs text-red-600">The new schedule must add up to the outstanding {formatCurrency(outstanding)} before it can be approved.</p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setMode('choose')}>
            Back
          </Button>
          <Button
            variant="secondary"
            loading={approve.isPending}
            disabled={busy || !draftValid || !totalMatches}
            onClick={() => run(() => approve.mutateAsync(draft), 'Approved — schedule updated and customer notified')}
          >
            <CheckCircle2 className="size-4" /> Approve &amp; update schedule
          </Button>
        </div>
      </div>
    )
  }

  if (mode === 'counter') {
    return (
      <div className="space-y-3 border-t border-ink-100 pt-5">
        <div>
          <h4 className="text-sm font-semibold text-ink-800">Counter-propose a schedule</h4>
          <p className="text-xs text-ink-400">Replaces the {open.length} unpaid milestone(s); paid and under-review ones stay as they are.</p>
        </div>
        {warning && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{warning}</p>}
        <ScheduleEditor schedule={draft} onChange={setDraft} target={outstanding} />
        <Textarea rows={2} className="min-h-16" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to the customer (optional)" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setMode('choose')}>
            Back
          </Button>
          <Button
            variant="secondary"
            loading={counter.isPending}
            disabled={busy || !draftValid}
            onClick={() => run(() => counter.mutateAsync({ schedule: draft, note }), 'Counter-proposal sent to the customer')}
          >
            <GitPullRequestArrow className="size-4" /> Send counter-proposal
          </Button>
        </div>
      </div>
    )
  }

  if (mode === 'decline') {
    return (
      <div className="space-y-3 border-t border-ink-100 pt-5">
        <h4 className="text-sm font-semibold text-ink-800">Decline request</h4>
        <div className="flex flex-wrap gap-1.5">
          {DECLINE_REASONS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => togglePreset(preset)}
              className={clsx(
                'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                lines.includes(preset) ? 'border-red-300 bg-red-50 text-red-700' : 'border-ink-200 text-ink-500 hover:border-ink-300 hover:bg-ink-50',
              )}
            >
              {preset}
            </button>
          ))}
        </div>
        <Textarea rows={2} className="min-h-16" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Pick a reason or write one — the customer sees this" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setMode('choose')}>
            Back
          </Button>
          <Button variant="danger" loading={decline.isPending} disabled={busy || !reason.trim()} onClick={() => run(() => decline.mutateAsync(reason.trim()), 'Request declined')}>
            <XCircle className="size-4" /> Decline
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 border-t border-ink-100 pt-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <ActionCard
          title="Approve"
          body="Apply the requested change to the unpaid milestones. You'll review the new schedule before it's saved."
          button={
            <Button variant="secondary" className="w-full" disabled={busy || open.length === 0} onClick={() => start('approve')}>
              <CheckCircle2 className="size-4" /> Review &amp; approve
            </Button>
          }
        />
        <ActionCard
          title="Counter-propose"
          body="Send the customer a revised schedule for the unpaid balance, with an optional note."
          button={
            <Button variant="outline" className="w-full" disabled={busy || open.length === 0} onClick={() => start('counter')}>
              <GitPullRequestArrow className="size-4" /> Counter-propose
            </Button>
          }
        />
        <ActionCard
          title="Decline"
          body="Keep the current schedule. The customer sees your reason."
          button={
            <Button variant="danger" className="w-full" disabled={busy} onClick={() => setMode('decline')}>
              <XCircle className="size-4" /> Decline
            </Button>
          }
        />
      </div>
      <button onClick={onOpenSchedule} className="flex items-center gap-1.5 text-xs text-ink-400 hover:text-ink-700">
        <Info className="size-3.5" /> Open the plot&apos;s schedule to edit milestones directly
      </button>
    </div>
  )
}

function ActionCard({ title, body, button }: { title: string; body: string; button: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-ink-100 p-4">
      <div className="flex-1">
        <p className="text-sm font-semibold text-ink-800">{title}</p>
        <p className="mt-1 text-xs text-ink-400">{body}</p>
      </div>
      {button}
    </div>
  )
}

function Outcome({ request: r }: { request: MilestoneChangeRequest }) {
  const by = [r.reviewed_by_email && `by ${r.reviewed_by_email}`, r.reviewed_at && `on ${formatDateTime(r.reviewed_at)}`].filter(Boolean).join(' ')
  if (r.status === 'APPROVED') {
    return (
      <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <p className="font-semibold">Approved</p>
        {by && <p className="text-xs opacity-80">{by}</p>}
      </div>
    )
  }
  if (r.status === 'DECLINED') {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
        <p className="font-semibold">Declined</p>
        {r.admin_response && <p className="mt-0.5">&ldquo;{r.admin_response}&rdquo;</p>}
        {by && <p className="mt-0.5 text-xs opacity-80">{by}</p>}
      </div>
    )
  }
  const proposed = r.counter_schedule?.schedule ?? []
  return (
    <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/50 p-4 text-sm">
      <div>
        <p className="font-semibold text-violet-900">Counter-proposal sent</p>
        {by && <p className="text-xs text-violet-700/80">{by}</p>}
        {r.counter_schedule?.note && <p className="mt-1 text-violet-900">&ldquo;{r.counter_schedule.note}&rdquo;</p>}
      </div>
      {proposed.length > 0 && (
        <ul className="divide-y divide-violet-100 overflow-hidden rounded-lg border border-violet-100 bg-white">
          {proposed.map((s, i) => (
            <li key={i} className="flex items-center gap-3 px-3 py-2">
              <span className="w-5 text-xs font-semibold text-ink-400">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-ink-700">{s.name || `Instalment ${i + 1}`}</span>
              <span className="w-28 text-xs text-ink-500">{formatDate(s.due_date)}</span>
              <span className="w-28 text-right tabular-nums text-ink-800">{formatCurrency(s.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
