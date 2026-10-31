'use client'

import { useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { AlertTriangle, Award, CheckCircle2, ChevronRight, Clock, EyeOff, Hourglass, Search, Send, X } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, StatCard } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { FileActions } from '@/components/ui/FileActions'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { formatCurrency, formatCurrencyCompact, formatDate } from '@/lib/format'
import { useAllProjects } from '@/features/projects/api'
import type { AllotmentBuyer, AllotmentRow, AllotmentStatus } from '@/types'
import { useAllotments, useIssueAllotment } from './api'

const STATUS_META: Record<AllotmentStatus, { label: string; tone: 'success' | 'warning' | 'neutral'; dot: string }> = {
  READY: { label: 'Ready to issue', tone: 'warning', dot: 'bg-gold-500' },
  ISSUED: { label: 'Issued', tone: 'success', dot: 'bg-emerald-500' },
  NOT_DUE: { label: 'Below 50%', tone: 'neutral', dot: 'bg-ink-300' },
}

const hasLetter = (b: AllotmentBuyer) => !!b.letter?.is_visible_to_customer
const buyerName = (b: AllotmentBuyer) => b.name || b.email

export function AllotmentsPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [project, setProject] = useState('')
  const [view, setView] = useState<AllotmentStatus | ''>('')
  const [open, setOpen] = useState<AllotmentRow | null>(null)

  const { data: projects } = useAllProjects()
  const { data, isLoading, error } = useAllotments({
    page,
    search: search || undefined,
    project: project || undefined,
    letter_status: view || undefined,
  })
  const stats = data?.stats
  const hasFilters = !!(search || project)

  const resetTo = (fn: () => void) => {
    setPage(1)
    fn()
  }

  const columns: Column<AllotmentRow>[] = [
    {
      key: 'plot',
      header: 'Plot',
      render: (r) => (
        <div className="min-w-0">
          <p className="font-semibold text-ink-800">{r.plot_number}</p>
          <p className="max-w-[200px] truncate text-xs text-ink-400">{[r.project_name, r.phase].filter(Boolean).join(' · ')}</p>
        </div>
      ),
    },
    {
      key: 'buyers',
      header: 'Buyers',
      render: (r) => (
        <div className="min-w-0">
          <p className="max-w-[220px] truncate text-ink-800">{buyerName(r.buyers[0])}</p>
          {r.buyers.length > 1 && (
            <p className="text-xs text-ink-400">
              +{r.buyers.length - 1} co-applicant{r.buyers.length > 2 ? 's' : ''}
            </p>
          )}
        </div>
      ),
    },
    { key: 'paid', header: 'Paid', render: (r) => <PaidMeter row={r} /> },
    {
      key: 'instalments',
      header: 'Milestones',
      render: (r) =>
        r.instalments_total ? (
          <div>
            <p className="tabular-nums text-ink-700">
              {r.instalments_paid} of {r.instalments_total} paid
            </p>
            <p className="text-xs tabular-nums text-ink-400">{Math.round((r.instalments_paid / r.instalments_total) * 100)}% complete</p>
          </div>
        ) : (
          <span className="text-xs text-ink-300">No schedule yet</span>
        ),
    },
    { key: 'letter', header: 'Allotment letter', render: (r) => <LetterCell row={r} /> },
    { key: 'open', header: '', className: 'w-10', render: () => <ChevronRight className="size-4 text-ink-300" /> },
  ]

  const views: { key: AllotmentStatus | ''; label: string; count?: number; dot?: string }[] = [
    { key: '', label: 'All', count: stats ? stats.READY + stats.ISSUED + stats.NOT_DUE : undefined },
    ...(['READY', 'ISSUED', 'NOT_DUE'] as const).map((s) => ({ key: s, label: STATUS_META[s].label, count: stats?.[s], dot: STATUS_META[s].dot })),
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Allotment Letters"
        subtitle="A plot's buyers get their letter automatically once 50% is paid. Track progress here, or issue a letter by hand."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Ready to issue · paid 50%, letter missing" value={stats?.READY ?? '—'} icon={<Send className="size-5" />} accent="gold" className="py-6" />
        <StatCard label="Issued to every buyer" value={stats?.ISSUED ?? '—'} icon={<CheckCircle2 className="size-5" />} accent="success" className="py-6" />
        <StatCard label="Below 50% paid" value={stats?.NOT_DUE ?? '—'} icon={<Hourglass className="size-5" />} accent="ink" className="py-6" />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4">
          <div className="flex items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
              <Input
                className="pl-9"
                placeholder="Search by plot number, project or buyer"
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
                    key={v.key || 'all'}
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
          rowKey={(r) => r.plot}
          isLoading={isLoading}
          error={error ? apiErrorMessage(error) : null}
          emptyTitle={view === 'READY' ? 'No letters waiting' : 'No plots found'}
          emptySubtitle={view === 'READY' ? 'Every plot past 50% paid has its letter.' : 'Plots show here once a buyer is assigned.'}
          onRowClick={setOpen}
          page={page}
          onPageChange={setPage}
          count={data?.count}
        />
      </Card>

      {open && <AllotmentModal row={open} onChange={setOpen} onClose={() => setOpen(null)} />}
    </div>
  )
}

/** Paid share of the selling price, with a tick at the 50% allotment threshold. */
function PaidMeter({ row, large }: { row: AllotmentRow; large?: boolean }) {
  if (!row.total_value || row.paid_percent === null) return <span className="text-xs text-ink-300">No selling price set</span>
  const pct = Math.min(row.paid_percent, 100)
  const reached = row.paid_percent >= 50
  return (
    <div className={large ? 'w-full' : 'w-44'}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className={clsx('font-semibold tabular-nums', large ? 'text-lg text-ink-900' : 'text-ink-800')}>{row.paid_percent}%</span>
        <span className="truncate text-xs tabular-nums text-ink-400">
          {formatCurrencyCompact(row.paid)} of {formatCurrencyCompact(row.total_value)}
        </span>
      </div>
      <div className={clsx('relative overflow-hidden rounded-full', large ? 'h-2.5' : 'h-1.5', reached ? 'bg-emerald-100' : 'bg-gold-100')}>
        <div className={clsx('h-full rounded-full', reached ? 'bg-emerald-500' : 'bg-gold-500')} style={{ width: `${pct}%` }} />
        <span className="absolute inset-y-0 left-1/2 w-px bg-ink-400/60" aria-hidden />
      </div>
    </div>
  )
}

function LetterCell({ row }: { row: AllotmentRow }) {
  const meta = STATUS_META[row.letter_status]
  const withLetter = row.buyers.filter(hasLetter).length
  return (
    <div className="space-y-1">
      <Badge tone={meta.tone}>{row.letter_status === 'NOT_DUE' && withLetter ? 'Issued early' : meta.label}</Badge>
      {row.buyers.length > 1 && (
        <p className="text-xs tabular-nums text-ink-400">
          {withLetter} of {row.buyers.length} buyers
        </p>
      )}
    </div>
  )
}

function AllotmentModal({ row, onChange, onClose }: { row: AllotmentRow; onChange: (row: AllotmentRow) => void; onClose: () => void }) {
  const toast = useToast()
  const issue = useIssueAllotment()
  const [pending, setPending] = useState<number | 'all' | null>(null)
  const canIssue = !!row.total_value
  const missing = row.buyers.filter((b) => !hasLetter(b))
  const early = row.paid_percent !== null && row.paid_percent < 50

  const run = async (target: number | 'all') => {
    setPending(target)
    try {
      const customers = target === 'all' ? undefined : [target]
      // The list may filter this plot out once it's issued, so the modal keeps the row the server sends back.
      onChange(await issue.mutateAsync({ plot: row.plot, customers }))
      const who = target === 'all' ? 'every buyer' : buyerName(row.buyers.find((b) => b.id === target)!)
      toast.success(`Allotment letter shared with ${who}`)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setPending(null)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <Award className="size-4 text-gold-600" /> Allotment letter · Plot {row.plot_number}
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => run('all')} disabled={!canIssue || pending !== null} loading={pending === 'all'}>
            <Send className="size-4" /> {missing.length === row.buyers.length ? 'Issue to all buyers' : 'Re-issue to all buyers'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 rounded-lg bg-ink-50 p-4 sm:grid-cols-[2fr_1fr]">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Paid against selling price</p>
            <PaidMeter row={row} large />
            {row.threshold_amount && (
              <p className="mt-1.5 text-xs text-ink-400">
                Letter goes out automatically at {formatCurrency(row.threshold_amount)} (50%)
              </p>
            )}
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Milestones</p>
            <p className="text-lg font-semibold tabular-nums text-ink-900">
              {row.instalments_paid} <span className="text-sm font-normal text-ink-400">of {row.instalments_total || '—'} paid</span>
            </p>
            <p className="text-xs text-ink-400">{[row.project_name, row.phase].filter(Boolean).join(' · ')}</p>
          </div>
        </div>

        {!canIssue ? (
          <Note tone="danger">This plot has no selling price yet, so its letter can&apos;t be generated. Set one in Plot Inventory first.</Note>
        ) : (
          early && (
            <Note tone="warning">
              This plot is {row.paid_percent}% paid. Issuing now shares the letter before the 50% mark — it shows the amount received so far.
            </Note>
          )
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Buyers</p>
          <ul className="divide-y divide-ink-100 rounded-lg border border-ink-100">
            {row.buyers.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-medium text-ink-800">
                    {buyerName(b)}
                    {b.plot_role === 'CO_APPLICANT' && <Badge tone="neutral">Co-applicant</Badge>}
                  </p>
                  <BuyerLetterState buyer={b} />
                </div>
                {b.letter?.file && <FileActions path={b.letter.file} filename={`Allotment Letter - Plot ${row.plot_number}.pdf`} label="allotment letter" />}
                <Button
                  size="sm"
                  variant={hasLetter(b) ? 'outline' : 'secondary'}
                  onClick={() => run(b.id)}
                  disabled={!canIssue || pending !== null}
                  loading={pending === b.id}
                  title={hasLetter(b) ? 'Generate it again with today’s amounts' : 'Add it to their Documents and notify them'}
                >
                  {hasLetter(b) ? 'Re-issue' : b.letter ? 'Share' : 'Issue'}
                </Button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-400">Issuing puts the PDF in the buyer&apos;s Documents in the app and sends them a notification.</p>
        </div>
      </div>
    </Modal>
  )
}

function BuyerLetterState({ buyer }: { buyer: AllotmentBuyer }) {
  const letter = buyer.letter
  if (!letter)
    return (
      <p className="flex items-center gap-1.5 text-xs text-ink-400">
        <Clock className="size-3.5" /> Not issued
      </p>
    )
  if (!letter.is_visible_to_customer)
    return (
      <p className="flex items-center gap-1.5 text-xs text-amber-700">
        <EyeOff className="size-3.5" /> Hidden from the app — share it to show it again
      </p>
    )
  return (
    <p className="flex items-center gap-1.5 text-xs text-emerald-700">
      <CheckCircle2 className="size-3.5" /> In their Documents since {formatDate(letter.issued_at)} · {letter.issued_by ? `by ${letter.issued_by}` : 'automatically'}
    </p>
  )
}

function Note({ tone, children }: { tone: 'warning' | 'danger'; children: ReactNode }) {
  return (
    <p className={clsx('flex gap-2 rounded-lg px-3 py-2 text-xs', tone === 'warning' ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700')}>
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      {children}
    </p>
  )
}
