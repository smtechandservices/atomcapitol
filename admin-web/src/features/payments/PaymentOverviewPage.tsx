'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import { AlarmClock, CalendarClock, ChevronRight, FileSearch, Table2, BarChart3, CalendarDays } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/Field'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/EmptyState'
import { apiErrorMessage } from '@/lib/api'
import { formatCurrency, formatCurrencyCompact, formatDate } from '@/lib/format'
import { useAllProjects } from '@/features/projects/api'
import type { PaymentInsights } from '@/types'
import { usePaymentInsights } from './api'
import { PlotScheduleDrawer } from './PlotScheduleDrawer'

// Two-series palette, validated with the dataviz checker (lightness, chroma, CVD ΔE ≥ 8, ≥ 3:1 on white).
const SCHEDULED = '#5f84c4'
const COLLECTED = '#a8761f'
const OVERDUE_BAR = '#e05a4f'

type Preset = 'rolling' | 'month' | 'quarter' | 'fy' | 'custom'

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Date range for a preset, in local time. `rolling` = backend default (12 months back → 3 ahead). */
function presetRange(preset: Preset): { start_date?: string; end_date?: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  switch (preset) {
    case 'month':
      return { start_date: iso(new Date(y, m, 1)), end_date: iso(new Date(y, m + 1, 0)) }
    case 'quarter': {
      const q = Math.floor(m / 3) * 3
      return { start_date: iso(new Date(y, q, 1)), end_date: iso(new Date(y, q + 3, 0)) }
    }
    case 'fy': {
      // Indian financial year: 1 Apr – 31 Mar
      const fyStart = m >= 3 ? y : y - 1
      return { start_date: iso(new Date(fyStart, 3, 1)), end_date: iso(new Date(fyStart + 1, 2, 31)) }
    }
    default:
      return {}
  }
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'rolling', label: '12 months' },
  { key: 'month', label: 'This month' },
  { key: 'quarter', label: 'This quarter' },
  { key: 'fy', label: 'This FY' },
  { key: 'custom', label: 'Custom' },
]

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

export function PaymentOverviewPage() {
  const [preset, setPreset] = useState<Preset>('rolling')
  const [custom, setCustom] = useState({ start_date: '', end_date: '' })
  const [project, setProject] = useState('')
  const [schedulePlotId, setSchedulePlotId] = useState<number | null>(null)

  const range = preset === 'custom' ? { start_date: custom.start_date || undefined, end_date: custom.end_date || undefined } : presetRange(preset)
  const { data: projects } = useAllProjects()
  const { data, isLoading, isFetching, error } = usePaymentInsights({ project: project || undefined, ...range })

  return (
    <div className="space-y-5">
      <PageHeader title="Payment Overview" subtitle="Collections across every plot — what was scheduled, what came in, and what's overdue" />

      {/* One filter row scoping everything below */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-ink-200 bg-white p-0.5">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={clsx(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                preset === p.key ? 'bg-ink-800 text-white' : 'text-ink-500 hover:bg-ink-50 hover:text-ink-800',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex items-center gap-2">
            <Input type="date" className="w-40" value={custom.start_date} onChange={(e) => setCustom({ ...custom, start_date: e.target.value })} />
            <span className="text-ink-300">–</span>
            <Input type="date" className="w-40" value={custom.end_date} onChange={(e) => setCustom({ ...custom, end_date: e.target.value })} />
          </div>
        )}
        {/* Select is w-full by default, so the wrapper sets its width */}
        <div className="w-56">
          <Select value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">All projects</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        {data && (
          <span className="flex items-center gap-1.5 text-xs text-ink-400">
            <CalendarDays className="size-3.5" />
            {formatDate(data.range.start)} – {formatDate(data.range.end)}
          </span>
        )}
      </div>

      {isLoading ? (
        <FullPageSpinner />
      ) : error || !data ? (
        <ErrorState message={apiErrorMessage(error)} />
      ) : (
        // Refetch keeps the frame: previous numbers dim instead of flashing a spinner.
        <div className={clsx('space-y-5 transition-opacity', isFetching && 'opacity-60')}>
          <Headline data={data} />
          <MonthlyChart data={data} />
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Ageing data={data} />
            <TopOverdue data={data} onOpen={setSchedulePlotId} />
          </div>
          <ByProject data={data} />
        </div>
      )}

      {schedulePlotId !== null && <PlotScheduleDrawer plotId={schedulePlotId} onClose={() => setSchedulePlotId(null)} />}
    </div>
  )
}

function Headline({ data }: { data: PaymentInsights }) {
  const { period, snapshot } = data
  const rate = pct(Number(period.paid_of_due_to_date), Number(period.due_to_date))
  const tiles = [
    { label: 'Overdue now', bucket: snapshot.overdue, icon: <AlarmClock className="size-4" />, tone: 'bg-red-50 text-red-600' },
    { label: 'Due now', bucket: snapshot.due, icon: <CalendarClock className="size-4" />, tone: 'bg-gold-50 text-gold-700' },
    { label: 'Under review', bucket: snapshot.under_review, icon: <FileSearch className="size-4" />, tone: 'bg-sky-50 text-sky-600' },
    { label: 'Due in next 30 days', bucket: snapshot.next_30_days, icon: <CalendarDays className="size-4" />, tone: 'bg-ink-50 text-ink-600' },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(320px,1fr)_2fr]">
      {/* Hero: the one number this page leads with */}
      <Card className="flex flex-col justify-between gap-5 p-6">
        <div>
          <p className="text-sm text-ink-400">Collected in this period</p>
          <p className="mt-1 text-5xl font-semibold tracking-tight text-ink-900">{formatCurrencyCompact(period.collected)}</p>
          <p className="mt-1 text-sm text-ink-400">{formatCurrency(period.collected)}</p>
        </div>
        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-sm">
            <span className="text-ink-600">Collection rate</span>
            <span className="font-semibold text-ink-900">{rate}%</span>
          </div>
          {/* Meter: track is a lighter step of the fill's ramp */}
          <div className="h-2 overflow-hidden rounded-full bg-emerald-100">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${rate}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-ink-400">
            {formatCurrencyCompact(period.paid_of_due_to_date)} paid of {formatCurrencyCompact(period.due_to_date)} that fell due so far · {formatCurrencyCompact(period.expected)} scheduled in the whole period
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        {tiles.map((t) => (
          <Card key={t.label} className="flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2">
              <span className={clsx('flex size-7 items-center justify-center rounded-lg', t.tone)}>{t.icon}</span>
              <span className="text-sm text-ink-500">{t.label}</span>
            </div>
            <div>
              <p className="text-2xl font-semibold text-ink-900">{formatCurrencyCompact(t.bucket.amount)}</p>
              <p className="text-xs text-ink-400">
                {t.bucket.count} milestone{t.bucket.count === 1 ? '' : 's'} · {t.bucket.plots} plot{t.bucket.plots === 1 ? '' : 's'}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

const monthLabel = (iso: string, withYear = false) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { month: 'short', ...(withYear ? { year: 'numeric' } : { year: '2-digit' }) })

function MonthlyChart({ data }: { data: PaymentInsights }) {
  const [asTable, setAsTable] = useState(false)
  const rows = useMemo(
    () => data.monthly.map((m) => ({ ...m, label: monthLabel(m.month), scheduledN: Number(m.scheduled), collectedN: Number(m.collected) })),
    [data.monthly],
  )
  const hasFuture = rows.some((r) => r.is_future)

  return (
    <Card>
      <CardHeader
        title="Scheduled vs collected, by month"
        subtitle={hasFuture ? 'Scheduled = instalments falling due that month · lighter bars are upcoming months' : 'Scheduled = instalments falling due that month'}
        actions={
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-xs text-ink-600">
              <LegendKey color={SCHEDULED} label="Scheduled" />
              <LegendKey color={COLLECTED} label="Collected" />
            </div>
            <button
              onClick={() => setAsTable((t) => !t)}
              className="flex items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-50"
            >
              {asTable ? <BarChart3 className="size-3.5" /> : <Table2 className="size-3.5" />}
              {asTable ? 'Chart' : 'Table'}
            </button>
          </div>
        }
      />
      {asTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/60 text-xs font-semibold uppercase tracking-wide text-ink-400">
                <th className="px-5 py-2.5 text-left">Month</th>
                <th className="px-5 py-2.5 text-right">Scheduled</th>
                <th className="px-5 py-2.5 text-right">Collected</th>
                <th className="px-5 py-2.5 text-right">Collected %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((r) => (
                <tr key={r.month} className={clsx(r.is_future && 'text-ink-400')}>
                  <td className="px-5 py-2.5">
                    {monthLabel(r.month, true)}
                    {r.is_future && <span className="ml-2 text-xs">upcoming</span>}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{formatCurrency(r.scheduled)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{formatCurrency(r.collected)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{r.is_future ? '—' : `${pct(r.collectedN, r.scheduledN)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-3 pb-4 pt-5">
          {/* Height includes the x-axis band, so no nested scroll */}
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={rows} barGap={2} barCategoryGap="22%" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#e9edf2" />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#d8dee6' }} tick={{ fontSize: 12, fill: '#4d5f75' }} />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={64}
                tick={{ fontSize: 12, fill: '#4d5f75' }}
                tickFormatter={(v: number) => formatCurrencyCompact(v)}
              />
              <Tooltip cursor={{ fill: 'rgba(17, 23, 29, 0.04)' }} content={<MonthTooltip />} />
              <Bar dataKey="scheduledN" name="Scheduled" fill={SCHEDULED} radius={[4, 4, 0, 0]} maxBarSize={24}>
                {rows.map((r) => (
                  <Cell key={r.month} fillOpacity={r.is_future ? 0.4 : 1} />
                ))}
              </Bar>
              <Bar dataKey="collectedN" name="Collected" fill={COLLECTED} radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

type MonthRow = PaymentInsights['monthly'][number] & { scheduledN: number; collectedN: number }

function MonthTooltip({ active, payload }: { active?: boolean; payload?: { payload: MonthRow }[] }) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload
  return (
    <div className="min-w-48 rounded-lg border border-ink-100 bg-white px-3 py-2.5 text-xs shadow-lg">
      <p className="mb-1.5 font-medium text-ink-500">
        {monthLabel(r.month, true)}
        {r.is_future && ' · upcoming'}
      </p>
      {[
        { label: 'Scheduled', value: r.scheduled, color: SCHEDULED },
        { label: 'Collected', value: r.collected, color: COLLECTED },
      ].map((s) => (
        <div key={s.label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-2 text-ink-500">
            <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
          <span className="font-semibold tabular-nums text-ink-900">{formatCurrency(s.value)}</span>
        </div>
      ))}
      {!r.is_future && r.scheduledN > 0 && (
        <p className="mt-1.5 border-t border-ink-100 pt-1.5 text-ink-400">{pct(r.collectedN, r.scheduledN)}% of scheduled collected</p>
      )}
    </div>
  )
}

function LegendKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  )
}

function Ageing({ data }: { data: PaymentInsights }) {
  const max = Math.max(...data.ageing.map((a) => Number(a.amount)), 1)
  const total = data.snapshot.overdue
  return (
    <Card className="flex flex-col">
      <CardHeader title="Overdue by age" subtitle={`${formatCurrency(total.amount)} across ${total.count} milestones · as of today`} />
      <div className="flex flex-1 flex-col justify-around gap-2 px-5 py-3">
        {data.ageing.map((a) => (
          <div key={a.label} className="grid grid-cols-[96px_1fr_auto] items-center gap-3">
            <span className="text-sm text-ink-600">{a.label}</span>
            <div className="h-3" title={`${a.label}: ${formatCurrency(a.amount)} · ${a.count} milestones`}>
              {Number(a.amount) > 0 && (
                <div className="h-full rounded-r-[4px]" style={{ width: `${Math.max(2, (Number(a.amount) / max) * 100)}%`, background: OVERDUE_BAR }} />
              )}
            </div>
            <span className="w-36 text-right text-sm">
              <span className="font-semibold tabular-nums text-ink-800">{formatCurrencyCompact(a.amount)}</span>
              <span className="ml-1.5 text-xs text-ink-400">· {a.count}</span>
            </span>
          </div>
        ))}
        {total.count === 0 && <p className="py-4 text-center text-sm text-ink-400">Nothing is overdue.</p>}
      </div>
    </Card>
  )
}

function TopOverdue({ data, onOpen }: { data: PaymentInsights; onOpen: (plotId: number) => void }) {
  return (
    <Card>
      <CardHeader
        title="Largest overdue accounts"
        subtitle="Click to open the plot's schedule"
        actions={
          <Link href="/payments/milestones" className="text-xs font-medium text-ink-500 hover:text-ink-800">
            All milestones
          </Link>
        }
      />
      {data.top_overdue.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-400">Nothing is overdue.</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {data.top_overdue.slice(0, 6).map((t) => (
            <li key={t.plot_id}>
              <button
                onClick={() => onOpen(t.plot_id)}
                title={`${t.count} overdue instalment${t.count === 1 ? '' : 's'} · oldest due ${formatDate(t.oldest_due_date)}`}
                className="flex w-full items-center gap-3 px-5 py-2 text-left text-sm transition-colors hover:bg-ink-50/70"
              >
                <p className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-ink-800">{t.buyer ? t.buyer.name || t.buyer.email : 'No buyer'}</span>
                  <span className="text-xs text-ink-400">
                    {' '}
                    · {t.plot_number} · {t.project_name}
                  </span>
                </p>
                <span className={clsx('w-14 shrink-0 text-right text-xs tabular-nums', t.days_overdue >= 60 ? 'font-medium text-red-600' : 'text-ink-400')}>
                  {t.days_overdue}d late
                </span>
                <span className="w-24 shrink-0 text-right font-semibold tabular-nums text-ink-900">{formatCurrencyCompact(t.amount)}</span>
                <ChevronRight className="size-4 shrink-0 text-ink-300" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function ByProject({ data }: { data: PaymentInsights }) {
  return (
    <Card>
      <CardHeader title="By project" subtitle="Whole schedule to date — not limited to the selected period" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50/60 text-xs font-semibold uppercase tracking-wide text-ink-400">
              <th className="px-5 py-2.5 text-left">Project</th>
              <th className="px-5 py-2.5 text-right">Plots</th>
              <th className="px-5 py-2.5 text-right">Scheduled</th>
              <th className="px-5 py-2.5 text-right">Collected</th>
              <th className="px-5 py-2.5 text-right">Overdue</th>
              <th className="w-56 px-5 py-2.5 text-left">Collected of scheduled</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {data.by_project.map((p) => {
              const share = pct(Number(p.collected), Number(p.scheduled))
              return (
                <tr key={p.id} className="text-ink-700">
                  <td className="px-5 py-3 font-medium text-ink-800">{p.name}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{p.plots}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{formatCurrencyCompact(p.scheduled)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{formatCurrencyCompact(p.collected)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {Number(p.overdue) > 0 ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full bg-red-500" />
                        {formatCurrencyCompact(p.overdue)}
                      </span>
                    ) : (
                      <span className="text-ink-300">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-emerald-100">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${share}%` }} />
                      </div>
                      <span className="w-9 text-right text-xs font-medium tabular-nums text-ink-600">{share}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
            {data.by_project.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-sm text-ink-400">
                  No milestones yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
