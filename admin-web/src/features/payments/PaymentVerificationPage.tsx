'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Copy,
  Hourglass,
  Inbox,
  ListOrdered,
  Search,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, StatCard } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select, FieldWrap, Textarea } from '@/components/ui/Field'
import { FilePreview } from '@/components/ui/FilePreview'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { absoluteMediaUrl, formatAge, formatCurrency, formatCurrencyCompact, formatDate, formatDateTime } from '@/lib/format'
import { useAllProjects } from '@/features/projects/api'
import type { PaymentProofQueueItem } from '@/types'
import { ageTone } from '@/features/kyc/shared'
import {
  useApprovePaymentProof,
  usePaymentVerificationQueue,
  usePaymentVerificationStats,
  useRejectPaymentProof,
  type PaymentQueueFilters,
} from './api'
import { PlotScheduleDrawer } from './PlotScheduleDrawer'

type View = 'pending' | 'mismatch' | 'stale' | 'APPROVED' | 'REJECTED' | 'all'

const VIEW_FILTER: Record<View, Pick<PaymentQueueFilters, 'status' | 'mismatch' | 'stale'>> = {
  pending: { status: 'PENDING' },
  mismatch: { status: 'PENDING', mismatch: 'true' },
  stale: { status: 'PENDING', stale: 'true' },
  APPROVED: { status: 'APPROVED' },
  REJECTED: { status: 'REJECTED' },
  all: { status: 'all' },
}

const REJECT_REASONS = [
  'Screenshot is unreadable',
  "Amount doesn't match the milestone",
  'Reference not found in bank statement',
  'Paid against the wrong milestone',
  'Duplicate of an earlier proof',
]

const PAGE_SIZE = 20

/** Claimed vs expected, in rupees (positive = overpaid). */
function amountDiff(p: Pick<PaymentProofQueueItem, 'claimed_amount' | 'expected_amount'>) {
  return Number(p.claimed_amount) - Number(p.expected_amount)
}

export function PaymentVerificationPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [project, setProject] = useState('')
  const [view, setView] = useState<View>('pending')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [schedulePlotId, setSchedulePlotId] = useState<number | null>(null)

  const { data: projects } = useAllProjects()
  const { data: stats } = usePaymentVerificationStats(project || undefined)
  const { data, isLoading, error } = usePaymentVerificationQueue({
    page,
    search: search || undefined,
    milestone__plot__project: project || undefined,
    ...VIEW_FILTER[view],
  })

  const rows = data?.results ?? []
  // Fall back to the first row so the panel is never blank while there's something to review.
  const selected = rows.find((r) => r.id === selectedId) ?? rows[0] ?? null
  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1

  const resetTo = (fn: () => void) => {
    setPage(1)
    setSelectedId(null)
    fn()
  }

  const goToPage = (n: number) => {
    setPage(n)
    setSelectedId(null)
  }

  /** After a decision the proof leaves the pending list — move to its neighbour. */
  const advance = (decidedId: number) => {
    const i = rows.findIndex((r) => r.id === decidedId)
    const next = rows[i + 1] ?? rows[i - 1] ?? null
    setSelectedId(next?.id ?? null)
  }

  const views: { key: View; label: string; count?: number; dot?: string }[] = [
    { key: 'pending', label: 'Pending', count: stats?.pending, dot: 'bg-sky-500' },
    { key: 'mismatch', label: 'Amount mismatch', count: stats?.mismatch, dot: 'bg-amber-500' },
    { key: 'stale', label: 'Waiting > 2 days', count: stats?.stale, dot: 'bg-red-500' },
    { key: 'APPROVED', label: 'Approved', count: stats?.approved, dot: 'bg-emerald-500' },
    { key: 'REJECTED', label: 'Rejected', count: stats?.rejected, dot: 'bg-red-400' },
    { key: 'all', label: 'All' },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Payment Verification" subtitle="Oldest proofs first — approving marks the milestone paid and generates a receipt" />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label={`Pending · ${stats ? formatCurrencyCompact(stats.pending_amount) : '—'} claimed`}
          value={stats?.pending ?? '—'}
          icon={<Inbox className="size-5" />}
          accent="gold"
          className="py-6"
        />
        <StatCard label="Waiting > 2 days" value={stats?.stale ?? '—'} icon={<Hourglass className="size-5" />} accent="danger" className="py-6" />
        <StatCard
          label={`Amount mismatch${stats?.short ? ` · ${stats.short} short` : ''}`}
          value={stats?.mismatch ?? '—'}
          icon={<AlertTriangle className="size-5" />}
          accent="ink"
          className="py-6"
        />
        <StatCard
          label={`Approved this month · ${stats?.approved_this_month ?? '—'}`}
          value={stats ? formatCurrencyCompact(stats.approved_this_month_amount) : '—'}
          icon={<CircleDollarSign className="size-5" />}
          accent="success"
          className="py-6"
        />
      </div>

      <Card className="overflow-clip">
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4">
          <div className="flex items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
              <Input
                className="pl-9"
                placeholder="Search by customer, plot number or transaction reference"
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
            title={view === 'pending' && !search && !project ? 'All caught up' : 'Nothing here'}
            subtitle={view === 'pending' && !search && !project ? 'No payment proofs are waiting for review.' : 'Try a different filter.'}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr]">
            {/* List */}
            {/* Pinned while the (taller) review panel scrolls */}
            <div className="flex max-h-[420px] flex-col border-b border-ink-100 lg:sticky lg:top-0 lg:max-h-screen lg:self-start lg:border-b-0">
              <ul className="min-h-0 flex-1 divide-y divide-ink-100 overflow-y-auto">
                {rows.map((p) => (
                  <ProofListItem key={p.id} proof={p} active={selected?.id === p.id} onClick={() => setSelectedId(p.id)} />
                ))}
              </ul>
              {totalPages > 1 && (
                <div className="mt-auto flex items-center justify-between border-t border-ink-100 px-4 py-2.5">
                  <p className="text-xs text-ink-400">
                    Page {page} of {totalPages} · {data?.count}
                  </p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => goToPage(page - 1)}
                      disabled={page <= 1}
                      className="flex size-7 items-center justify-center rounded-lg border border-ink-100 text-ink-500 hover:bg-ink-50 disabled:opacity-40"
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <button
                      onClick={() => goToPage(page + 1)}
                      disabled={page >= totalPages}
                      className="flex size-7 items-center justify-center rounded-lg border border-ink-100 text-ink-500 hover:bg-ink-50 disabled:opacity-40"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Review panel — keyed so per-proof form state resets */}
            {selected && (
              <ReviewPanel key={selected.id} proof={selected} onDecided={() => advance(selected.id)} onOpenSchedule={() => setSchedulePlotId(selected.plot_id)} />
            )}
          </div>
        )}
      </Card>

      {schedulePlotId !== null && <PlotScheduleDrawer plotId={schedulePlotId} onClose={() => setSchedulePlotId(null)} />}
    </div>
  )
}

function ProofListItem({ proof: p, active, onClick }: { proof: PaymentProofQueueItem; active: boolean; onClick: () => void }) {
  const diff = amountDiff(p)
  const pending = p.status === 'PENDING'
  return (
    <li>
      <button
        onClick={onClick}
        className={clsx(
          'flex w-full gap-3 border-l-2 px-4 py-3 text-left transition-colors',
          active ? 'border-gold-500 bg-gold-50/70' : 'border-transparent hover:bg-ink-50/70',
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium text-ink-800">{p.customer_name || p.customer_email}</p>
            {diff !== 0 && (
              <span title={diff < 0 ? 'Claimed less than the milestone amount' : 'Claimed more than the milestone amount'} className={diff < 0 ? 'text-red-500' : 'text-amber-500'}>
                <AlertTriangle className="size-3.5" />
              </span>
            )}
            {p.duplicate_reference && (
              <span title="Transaction reference used on another proof" className="text-red-500">
                <Copy className="size-3.5" />
              </span>
            )}
          </div>
          <p className="truncate text-xs text-ink-400">
            {p.plot_number} · {p.project_name}
          </p>
          <p className="truncate text-xs text-ink-400">{p.milestone_name}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-sm font-semibold tabular-nums text-ink-800">{formatCurrency(p.claimed_amount)}</span>
          {pending ? (
            <span className={clsx('text-xs font-medium tabular-nums', ageTone(p.created_at))}>{formatAge(p.created_at)}</span>
          ) : (
            <span className={clsx('text-xs font-medium', p.status === 'APPROVED' ? 'text-emerald-600' : 'text-red-600')}>
              {p.status === 'APPROVED' ? 'Approved' : 'Rejected'}
            </span>
          )}
        </div>
      </button>
    </li>
  )
}

function ReviewPanel({ proof: p, onDecided, onOpenSchedule }: { proof: PaymentProofQueueItem; onDecided: () => void; onOpenSchedule: () => void }) {
  const diff = amountDiff(p)
  const paidLateBy = Math.round((new Date(p.payment_date).getTime() - new Date(p.milestone_due_date).getTime()) / 86_400_000)

  return (
    <div className="min-w-0 space-y-5 p-5 lg:border-l lg:border-ink-100">
      {/* Who / what */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/customers/${p.customer_id}`} className="block truncate text-lg font-semibold text-ink-800 hover:text-gold-700">
            {p.customer_name || p.customer_email}
          </Link>
          <p className="truncate text-sm text-ink-400">
            Plot {p.plot_number} · {p.project_name}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onOpenSchedule}>
          <ListOrdered className="size-3.5" /> View schedule
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-ink-50/70 px-3 py-2 text-sm">
        <span className="font-medium text-ink-700">{p.milestone_name}</span>
        {p.milestone_count && !/\d+\s+of\s+\d+/i.test(p.milestone_name) && (
          <span className="text-ink-400">
            Milestone {p.milestone_sequence} of {p.milestone_count}
          </span>
        )}
        <span className="flex items-center gap-1 text-ink-400">
          <CalendarClock className="size-3.5" /> Due {formatDate(p.milestone_due_date)}
        </span>
      </div>

      {/* Checks on what the customer typed in the app — the proof document itself is not read */}
      <div className="space-y-2">
        {diff === 0 ? (
          <CheckRow
            tone="ok"
            icon={<Check className="size-4" />}
            title={`Declared amount matches the milestone — ${formatCurrency(p.expected_amount)}`}
            body="This compares what the customer entered in the app. Confirm the proof below shows the same amount and reference."
          />
        ) : diff < 0 ? (
          <CheckRow
            tone="bad"
            icon={<ArrowDownRight className="size-4" />}
            title={`Declared amount is short by ${formatCurrency(-diff)}`}
            body={`Claimed ${formatCurrency(p.claimed_amount)} against ${formatCurrency(p.expected_amount)}. Can't be approved below the milestone amount — reject it, or edit the milestone first.`}
          />
        ) : (
          <CheckRow
            tone="warn"
            icon={<ArrowUpRight className="size-4" />}
            title={`Declared amount is over by ${formatCurrency(diff)}`}
            body={`Claimed ${formatCurrency(p.claimed_amount)} against ${formatCurrency(p.expected_amount)}.`}
          />
        )}
        {paidLateBy > 0 && (
          <CheckRow tone="warn" icon={<CalendarClock className="size-4" />} title={`Paid ${paidLateBy} day${paidLateBy === 1 ? '' : 's'} after the due date`} />
        )}
        {p.duplicate_reference && (
          <CheckRow
            tone="bad"
            icon={<Copy className="size-4" />}
            title="This transaction reference is on another proof"
            body={`Search "${p.transaction_reference}" under All to compare before approving.`}
          />
        )}
      </div>

      <FilePreview title="Payment proof" url={absoluteMediaUrl(p.file)} height={440} />

      <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <Info label="Claimed amount" value={formatCurrency(p.claimed_amount)} />
        <Info label="Payment date" value={formatDate(p.payment_date)} />
        <Info label="Mode" value={p.payment_mode || '—'} />
        <Info label="Reference" value={p.transaction_reference ? <span className="break-all font-mono text-xs">{p.transaction_reference}</span> : '—'} />
      </dl>
      <p className="text-xs text-ink-400">Submitted {formatDateTime(p.created_at)}</p>

      {p.status === 'PENDING' ? (
        <DecisionArea proof={p} onDecided={onDecided} />
      ) : p.status === 'APPROVED' ? (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-semibold">Approved</p>
          <p className="opacity-80">
            {p.reviewed_by_email ? `by ${p.reviewed_by_email}` : ''} {p.reviewed_at ? `on ${formatDateTime(p.reviewed_at)}` : ''}
          </p>
        </div>
      ) : (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-semibold">Rejected</p>
          {p.rejection_reason && <p className="mt-0.5">&ldquo;{p.rejection_reason}&rdquo;</p>}
          <p className="mt-0.5 text-xs opacity-75">
            {p.reviewed_by_email ? `by ${p.reviewed_by_email}` : ''} {p.reviewed_at ? `on ${formatDateTime(p.reviewed_at)}` : ''}
          </p>
        </div>
      )}
    </div>
  )
}

function DecisionArea({ proof: p, onDecided }: { proof: PaymentProofQueueItem; onDecided: () => void }) {
  const toast = useToast()
  const approve = useApprovePaymentProof(p.id)
  const reject = useRejectPaymentProof(p.id)
  const [adjusting, setAdjusting] = useState(false)
  const [amount, setAmount] = useState(p.claimed_amount)
  const [date, setDate] = useState(p.payment_date)
  const [reason, setReason] = useState('')

  const approvedAmount = adjusting ? amount : p.claimed_amount
  const short = Number(approvedAmount) < Number(p.expected_amount)
  const busy = approve.isPending || reject.isPending

  const doApprove = async () => {
    try {
      await approve.mutateAsync({
        corrected_amount: adjusting && amount !== p.claimed_amount ? amount : undefined,
        corrected_date: adjusting && date !== p.payment_date ? date : undefined,
      })
      toast.success('Payment approved — receipt generated')
      onDecided()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const doReject = async () => {
    try {
      await reject.mutateAsync(reason.trim())
      toast.success('Proof rejected — customer notified')
      onDecided()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const lines = reason.split('\n').map((l) => l.trim())
  const togglePreset = (preset: string) =>
    setReason((r) => (lines.includes(preset) ? lines.filter((l) => l && l !== preset).join('\n') : [r.trim(), preset].filter(Boolean).join('\n')))

  return (
    <div className="grid grid-cols-1 gap-4 border-t border-ink-100 pt-5 xl:grid-cols-2">
      <div className="space-y-3 rounded-lg border border-ink-100 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-ink-800">Approve</p>
          <button
            type="button"
            onClick={() => setAdjusting((a) => !a)}
            className="flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-800"
          >
            <SlidersHorizontal className="size-3.5" /> {adjusting ? 'Use declared values' : 'Adjust amount/date'}
          </button>
        </div>
        {adjusting && (
          <div className="grid grid-cols-2 gap-3">
            <FieldWrap label="Amount received">
              <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </FieldWrap>
            <FieldWrap label="Payment date">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FieldWrap>
          </div>
        )}
        <p className="text-xs text-ink-400">Marks the milestone paid for {formatCurrency(approvedAmount)} and issues a receipt.</p>
        {short && (
          <p className="rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
            Below the milestone amount of {formatCurrency(p.expected_amount)} — approval is blocked.
          </p>
        )}
        <Button variant="secondary" className="w-full" loading={approve.isPending} disabled={busy || short || !approvedAmount} onClick={doApprove}>
          <CheckCircle2 className="size-4" /> Approve payment
        </Button>
      </div>

      <div className="space-y-3 rounded-lg border border-ink-100 p-4">
        <p className="text-sm font-semibold text-ink-800">Reject</p>
        <div className="flex flex-wrap gap-1.5">
          {REJECT_REASONS.map((preset) => {
            const on = lines.includes(preset)
            return (
              <button
                key={preset}
                type="button"
                onClick={() => togglePreset(preset)}
                className={clsx(
                  'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                  on ? 'border-red-300 bg-red-50 text-red-700' : 'border-ink-200 text-ink-500 hover:border-ink-300 hover:bg-ink-50',
                )}
              >
                {preset}
              </button>
            )
          })}
        </div>
        <Textarea rows={2} className="min-h-16" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Pick a reason or write one — the customer sees this" />
        <Button variant="danger" className="w-full" loading={reject.isPending} disabled={busy || !reason.trim()} onClick={doReject}>
          <XCircle className="size-4" /> Reject proof
        </Button>
      </div>
    </div>
  )
}

function CheckRow({ tone, icon, title, body }: { tone: 'ok' | 'warn' | 'bad'; icon: ReactNode; title: string; body?: string }) {
  const cls = {
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    bad: 'border-red-200 bg-red-50 text-red-800',
  }[tone]
  return (
    <div className={clsx('flex gap-2.5 rounded-lg border px-3 py-2', cls)}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="text-sm">
        <p className="font-semibold">{title}</p>
        {body && <p className="mt-0.5 text-xs opacity-85">{body}</p>}
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink-700">{value}</dd>
    </div>
  )
}
