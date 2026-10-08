'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import {
  ArrowUpRight,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  History,
  Image as ImageIcon,
  LogIn,
  MapPinned,
  Search,
  UserCog,
  Wallet,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/Field'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { apiErrorMessage } from '@/lib/api'
import type { AuditLogEntry } from '@/types'
import { useAuth } from '@/lib/auth'
import { useCan, type Area } from '@/lib/permissions'
import { useAuditLog, useAuditLogFacets } from './api'

type Category = '' | 'payments' | 'customers' | 'projects' | 'documents' | 'content' | 'team'
type Range = 'all' | 'today' | '3d' | 'custom'

const CATEGORIES: { key: Category; label: string; icon: ReactNode; tile: string }[] = [
  { key: '', label: 'All activity', icon: <History className="size-3.5" />, tile: 'bg-ink-100 text-ink-600' },
  { key: 'payments', label: 'Payments', icon: <Wallet className="size-3.5" />, tile: 'bg-emerald-50 text-emerald-600' },
  { key: 'customers', label: 'Customers & plots', icon: <MapPinned className="size-3.5" />, tile: 'bg-sky-50 text-sky-600' },
  { key: 'projects', label: 'Projects', icon: <Building2 className="size-3.5" />, tile: 'bg-gold-50 text-gold-700' },
  { key: 'documents', label: 'Documents', icon: <FileText className="size-3.5" />, tile: 'bg-violet-50 text-violet-600' },
  { key: 'content', label: 'Banners & campaigns', icon: <ImageIcon className="size-3.5" />, tile: 'bg-pink-50 text-pink-600' },
  { key: 'team', label: 'Team & access', icon: <UserCog className="size-3.5" />, tile: 'bg-ink-100 text-ink-700' },
]

/** Which category an action belongs to — mirrors AuditLogListView.CATEGORIES on the backend. */
function categoryOf(action: string): Category {
  if (/^(payment_proof|milestone_change_request|milestone)\./.test(action)) return 'payments'
  if (/^(customer|plot|kyc)\./.test(action)) return 'customers'
  if (action.startsWith('project.')) return 'projects'
  if (action.startsWith('document.')) return 'documents'
  if (/^(banner|campaign)\./.test(action)) return 'content'
  if (/^(admin|admin_user|sales_person)\./.test(action)) return 'team'
  return ''
}

/** Plain-English verb phrase for each action; unknown actions fall back to "<verb>d <noun>". */
const PHRASES: Record<string, string> = {
  'admin.login': 'signed in',
  'admin_user.create': 'added admin',
  'admin_user.update': 'updated admin',
  'admin_user.delete': 'deleted admin',
  'banner.create': 'created banner',
  'banner.update': 'updated banner',
  'campaign.create': 'drafted campaign',
  'campaign.update': 'edited campaign',
  'campaign.delete': 'deleted campaign',
  'campaign.send': 'sent campaign',
  'customer.create': 'added customer',
  'customer.update': 'updated customer',
  'customer.otp_bypass_login': 'used the dev OTP bypass to sign in as',
  'document.create': 'uploaded document',
  'document.update': 'updated document',
  'document.delete': 'deleted document',
  'milestone_change_request.approve': 'approved the change request from',
  'milestone_change_request.decline': 'declined the change request from',
  'milestone_change_request.counter': 'counter-proposed a schedule to',
  'payment_proof.approve': 'approved the payment from',
  'payment_proof.reject': 'rejected the payment from',
  'plot.create': 'added plot',
  'plot.update': 'updated plot',
  'plot.assign': 'assigned a buyer to plot',
  'plot.unassign': 'removed a buyer from plot',
  'plot.bulk_import': 'bulk-imported plots into',
  'project.create': 'created project',
  'project.update': 'updated project',
  'sales_person.create': 'added sales person',
  'sales_person.update': 'updated sales person',
  'sales_person.delete': 'deleted sales person',
  'sales_person.bulk_assign': 'assigned customers to',
  'sales_person.bulk_unassign': 'removed customers from',
  'sales_person.move_customers': 'moved all customers away from',
}

function phraseFor(action: string) {
  if (PHRASES[action]) return PHRASES[action]
  const [noun = '', verb = ''] = action.split('.')
  return `${verb.replaceAll('_', ' ')} ${noun.replaceAll('_', ' ')}`.trim()
}

/** Where a target lives in the portal. */
function targetHref(e: AuditLogEntry): string | null {
  const id = e.target_id
  switch (e.target_type) {
    case 'Customer':
      return `/customers/${id}`
    case 'Project':
      return `/projects/${id}`
    case 'Ticket':
      return `/tickets/${id}`
    case 'KYCSubmission':
      return `/kyc/${id}`
    case 'Plot':
      return '/plots'
    case 'PaymentProof':
      return '/payments/verification'
    case 'MilestoneChangeRequest':
      return '/payments/change-requests'
    case 'Document':
      return '/documents'
    case 'Banner':
      return '/banners'
    case 'NotificationCampaign':
      return '/notifications'
    case 'SalesPerson':
      return '/sales-team'
    case 'AdminUser':
      return '/admin-users'
    default:
      return null
  }
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function rangeParams(range: Range, custom: { from: string; to: string }) {
  const today = new Date()
  const daysAgo = (n: number) => iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - n))
  switch (range) {
    case 'today':
      return { created_at__date__gte: iso(today) }
    case '3d':
      return { created_at__date__gte: daysAgo(2) }
    case 'custom':
      return { created_at__date__gte: custom.from || undefined, created_at__date__lte: custom.to || undefined }
    default:
      return {}
  }
}

function dayLabel(dateStr: string) {
  const d = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
}

export function AuditLogPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<Category>('')
  const [actor, setActor] = useState('')
  const [range, setRange] = useState<Range>('all')
  const [custom, setCustom] = useState({ from: '', to: '' })

  const { data: facets } = useAuditLogFacets()
  const { data, isLoading, isFetching, error } = useAuditLog({
    page,
    search: search || undefined,
    category: category || undefined,
    actor: actor || undefined,
    ...rangeParams(range, custom),
  })
  const rows = data?.results ?? []
  const totalPages = data ? Math.max(1, Math.ceil(data.count / 20)) : 1
  const hasFilters = !!(search || category || actor || range !== 'all')

  const resetTo = (fn: () => void) => {
    setPage(1)
    fn()
  }

  // Group the page by calendar day for the feed.
  const days: { label: string; entries: AuditLogEntry[] }[] = []
  for (const e of rows) {
    const label = dayLabel(e.created_at)
    if (days[days.length - 1]?.label !== label) days.push({ label, entries: [] })
    days[days.length - 1].entries.push(e)
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Audit Log" subtitle="Every change made in the admin portal — who did it, to what, and when. Entries are kept for 7 days." />

      <Card>
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
              <Input className="pl-9" placeholder="Search by action or admin" value={search} onChange={(e) => resetTo(() => setSearch(e.target.value))} />
            </div>
            {/* Select is w-full by default, so the wrapper sets its width */}
            <div className="w-48 shrink-0">
              <Select value={actor} onChange={(e) => resetTo(() => setActor(e.target.value))}>
                <option value="">Anyone</option>
                {facets?.actors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex shrink-0 rounded-lg border border-ink-200 bg-ink-50/50 p-0.5">
              {(
                [
                  ['all', 'Last 7 days'],
                  ['today', 'Today'],
                  ['3d', '3 days'],
                  ['custom', 'Custom'],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => resetTo(() => setRange(k))}
                  className={clsx(
                    'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                    range === k ? 'bg-white text-ink-800 shadow-sm ring-1 ring-ink-100' : 'text-ink-500 hover:text-ink-800',
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
            {range === 'custom' && (
              <div className="flex items-center gap-2">
                <Input type="date" className="w-40" value={custom.from} onChange={(e) => resetTo(() => setCustom({ ...custom, from: e.target.value }))} />
                <span className="text-ink-300">–</span>
                <Input type="date" className="w-40" value={custom.to} onChange={(e) => resetTo(() => setCustom({ ...custom, to: e.target.value }))} />
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 pb-0.5">
              {CATEGORIES.map((c) => {
                const active = category === c.key
                return (
                  <button
                    key={c.key || 'all'}
                    onClick={() => resetTo(() => setCategory(c.key))}
                    className={clsx(
                      'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      active ? 'border-ink-800 bg-ink-800 text-white' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:bg-ink-50',
                    )}
                  >
                    <span className={active ? 'text-gold-300' : 'text-ink-400'}>{c.icon}</span>
                    {c.label}
                  </button>
                )
              })}
            </div>
            {hasFilters && (
              <button
                onClick={() =>
                  resetTo(() => {
                    setSearch('')
                    setCategory('')
                    setActor('')
                    setRange('all')
                    setCustom({ from: '', to: '' })
                  })
                }
                className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-ink-400 hover:bg-ink-50 hover:text-ink-700"
              >
                <X className="size-3.5" /> Clear filters
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <FullPageSpinner />
        ) : error ? (
          <ErrorState message={apiErrorMessage(error)} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<History className="size-6" />} title={hasFilters ? 'No activity matches' : 'No activity yet'} subtitle={hasFilters ? 'Try a wider date range or another filter.' : undefined} />
        ) : (
          <div className={clsx('transition-opacity', isFetching && 'opacity-60')}>
            {days.map((day) => (
              <section key={day.label}>
                <h3 className="sticky top-0 z-10 border-b border-ink-100 bg-ink-50/90 px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400 backdrop-blur">
                  {day.label}
                </h3>
                <ul className="divide-y divide-ink-100">
                  {day.entries.map((e) => (
                    <AuditRow key={e.id} entry={e} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-ink-100 px-5 py-3">
            <p className="text-xs text-ink-400">
              Page {page} of {totalPages} · {data?.count} entries
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
                className="flex size-8 items-center justify-center rounded-lg border border-ink-100 text-ink-500 hover:bg-ink-50 disabled:opacity-40"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
                className="flex size-8 items-center justify-center rounded-lg border border-ink-100 text-ink-500 hover:bg-ink-50 disabled:opacity-40"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

const TARGET_AREA: Partial<Record<string, Area>> = {
  Customer: 'customers',
  Project: 'projects',
  Plot: 'projects',
  Ticket: 'tickets',
  KYCSubmission: 'kyc',
  PaymentProof: 'payments',
  MilestoneChangeRequest: 'payments',
  Document: 'documents',
  Banner: 'banners',
  NotificationCampaign: 'campaigns',
  SalesPerson: 'sales',
}

function AuditRow({ entry: e }: { entry: AuditLogEntry }) {
  const [open, setOpen] = useState(false)
  const can = useCan()
  const { hasRole } = useAuth()
  const cat = CATEGORIES.find((c) => c.key === categoryOf(e.action)) ?? CATEGORIES[0]
  // Every admin can read the log, but only link to records this role can actually open.
  const area = TARGET_AREA[e.target_type]
  const allowed = e.target_type === 'AdminUser' ? hasRole('SUPER_ADMIN') : area ? can(area) : true
  const href = allowed ? targetHref(e) : null
  const details = Object.entries(e.details ?? {}).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  const isLogin = e.action === 'admin.login'
  const time = new Date(e.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  const targetText = e.target_label ?? (e.target_type ? `${e.target_type} #${e.target_id}` : '')

  return (
    <li>
      <div className="flex items-start gap-3 px-5 py-3">
        <span className={clsx('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg', cat.tile)}>{isLogin ? <LogIn className="size-3.5" /> : cat.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-700">
            <span className="font-semibold text-ink-900">{e.actor_name}</span> {phraseFor(e.action)}
            {!isLogin && targetText && (
              <>
                {' '}
                {href ? (
                  <Link href={href} className="inline-flex items-center gap-0.5 font-medium text-ink-900 underline decoration-ink-200 underline-offset-2 hover:decoration-gold-500">
                    {targetText}
                    <ArrowUpRight className="size-3 text-ink-400" />
                  </Link>
                ) : (
                  <span className="font-medium text-ink-900">{targetText}</span>
                )}
              </>
            )}
            {/* labels are resolved for every type targetHref knows, so a missing one there means the record was deleted */}
            {!e.target_label && targetHref(e) && !isLogin && <span className="ml-1 text-xs text-ink-400">(no longer exists)</span>}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-400">
            <span title={new Date(e.created_at).toLocaleString('en-IN')}>{time}</span>
            {e.ip_address && <span>· {e.ip_address}</span>}
            <span className="font-mono text-[11px] text-ink-300">· {e.action}</span>
            {details.length > 0 && (
              <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-0.5 font-medium text-ink-500 hover:text-ink-800">
                · {open ? 'Hide' : 'Show'} details
                <ChevronDown className={clsx('size-3 transition-transform', open && 'rotate-180')} />
              </button>
            )}
          </p>
          {open && details.length > 0 && (
            <dl className="mt-2 grid grid-cols-[minmax(120px,auto)_1fr] gap-x-4 gap-y-1 rounded-lg bg-ink-50/70 px-3 py-2 text-xs">
              {details.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-ink-400">{k.replaceAll('_', ' ')}</dt>
                  <dd className="break-all font-mono text-ink-700">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </li>
  )
}
