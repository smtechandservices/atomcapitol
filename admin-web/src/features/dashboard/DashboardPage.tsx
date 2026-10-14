'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import {
  AlarmClock,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FileCheck2,
  FileText,
  History,
  Megaphone,
  MessageSquareReply,
  Repeat,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/lib/auth'
import { useCan } from '@/lib/permissions'
import { formatAge, formatCurrency, formatCurrencyCompact } from '@/lib/format'
import { useCustomerCounts } from '@/features/customers/api'
import { useKycQueue, useKycQueueStats } from '@/features/kyc/api'
import { useChangeRequestCounts, usePaymentInsights, usePaymentVerificationQueue, usePaymentVerificationStats } from '@/features/payments/api'
import { useTicketStats, useTickets } from '@/features/tickets/api'
import { usePlotStatusCounts } from '@/features/plots/api'
import { useDocumentStats } from '@/features/documents/api'
import { useCampaignStats } from '@/features/content/api'
import { useAuditLog } from '@/features/settings/api'
import { ageTone } from '@/features/kyc/shared'

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ACCOUNTS: 'Accounts',
  KYC_REVIEWER: 'KYC Reviewer',
  SUPPORT: 'Support',
}

/**
 * Role-shaped dashboard: every tile/panel is its own component with its own query, and is only mounted
 * when the signed-in role can read that area — so no role ever fires a request that would 403.
 */
export function DashboardPage() {
  const { user } = useAuth()
  const can = useCan()
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })

  const queue = [
    can('kyc') && <KycTile key="kyc" />,
    can('payments') && <ProofsTile key="proofs" />,
    can('payments') && <ChangeRequestsTile key="cr" />,
    can('tickets') && <TicketsTile key="tickets" />,
    can('documents') && <DocumentsTile key="docs" />,
  ].filter(Boolean)

  const panels = [
    can('payments') && <CollectionsPanel key="collections" />,
    can('kyc') && <KycWaitingPanel key="kyc-list" />,
    can('tickets') && <TicketsWaitingPanel key="tickets-list" />,
    can('payments') && <ProofsWaitingPanel key="proofs-list" />,
    can('payments') && <TopOverduePanel key="overdue" />,
    can('kyc') && !can('customers') && <KycBreakdownPanel key="kyc-breakdown" />,
    can('projects') && <InventoryPanel key="inventory" />,
    can('customers') && <CustomersPanel key="customers" />,
    can('campaigns') && <AnnouncementsPanel key="announcements" />,
    can('auditLog') && <ActivityPanel key="activity" />,
  ].filter(Boolean)

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Welcome back, ${user?.name?.split(' ')[0] || user?.email}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {today}
            {user && <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600">{ROLE_LABEL[user.role] ?? user.role}</span>}
          </span>
        }
      />

      {queue.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Waiting on you</h2>
          <div className={clsx('grid grid-cols-1 gap-4 sm:grid-cols-2', queue.length >= 4 ? 'xl:grid-cols-4' : queue.length === 3 ? 'xl:grid-cols-3' : '')}>{queue}</div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">{panels}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Queue tiles
// ---------------------------------------------------------------------------
function QueueTile({
  href,
  label,
  value,
  sub,
  icon,
  urgent,
}: {
  href: string
  label: string
  value: number | undefined
  sub?: ReactNode
  icon: ReactNode
  urgent?: boolean
}) {
  const clear = value === 0
  return (
    <Link href={href} className="group">
      <Card className="flex h-full items-center gap-4 p-5 transition-all group-hover:-translate-y-0.5 group-hover:border-gold-300 group-hover:shadow-md">
        <span
          className={clsx(
            'flex size-11 shrink-0 items-center justify-center rounded-xl',
            clear ? 'bg-emerald-50 text-emerald-600' : urgent ? 'bg-gold-100 text-gold-700' : 'bg-ink-100 text-ink-600',
          )}
        >
          {clear ? <CheckCircle2 className="size-5" /> : icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ink-500">{label}</p>
          <p className="text-2xl font-semibold text-ink-900">{value === undefined ? <Spinner className="size-5" /> : value}</p>
          <p className="truncate text-xs text-ink-400">{clear ? 'All clear' : sub}</p>
        </div>
        <ArrowRight className="size-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-600" />
      </Card>
    </Link>
  )
}

function KycTile() {
  const { data } = useKycQueueStats()
  return (
    <QueueTile
      href="/kyc"
      label="KYC to review"
      value={data?.total}
      sub={data?.stale ? <span className="text-red-600">{data.stale} waiting over 2 days</span> : 'Oldest first'}
      icon={<ShieldCheck className="size-5" />}
      urgent
    />
  )
}

function ProofsTile() {
  const { data } = usePaymentVerificationStats()
  return (
    <QueueTile
      href="/payments/verification"
      label="Payment proofs to verify"
      value={data?.pending}
      sub={data ? `${formatCurrencyCompact(data.pending_amount)} claimed${data.mismatch ? ` · ${data.mismatch} mismatched` : ''}` : undefined}
      icon={<FileCheck2 className="size-5" />}
      urgent
    />
  )
}

function ChangeRequestsTile() {
  const { data } = useChangeRequestCounts()
  return <QueueTile href="/payments/change-requests" label="Schedule change requests" value={data?.PENDING} sub="Customers asking to change dates or amounts" icon={<Repeat className="size-5" />} />
}

function TicketsTile() {
  const { data } = useTicketStats()
  return (
    <QueueTile
      href="/tickets"
      label="Tickets needing a reply"
      value={data?.awaiting_reply}
      sub={data ? `${data.unassigned_active} unassigned · ${data.mine_active} assigned to you` : undefined}
      icon={<MessageSquareReply className="size-5" />}
      urgent
    />
  )
}

function DocumentsTile() {
  const { data } = useDocumentStats()
  return (
    <QueueTile
      href="/documents"
      label="Documents in progress"
      value={data?.in_progress}
      sub={data?.missing_file ? `${data.missing_file} still need a file` : undefined}
      icon={<FileText className="size-5" />}
    />
  )
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------
function Panel({ title, subtitle, href, linkLabel = 'Open', children }: { title: string; subtitle?: string; href?: string; linkLabel?: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col">
      <CardHeader
        title={title}
        subtitle={subtitle}
        actions={
          href && (
            <Link href={href} className="flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-800">
              {linkLabel} <ArrowRight className="size-3.5" />
            </Link>
          )
        }
      />
      <div className="flex-1">{children}</div>
    </Card>
  )
}

function Loading() {
  return (
    <div className="flex justify-center py-10">
      <Spinner className="size-6" />
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-5 py-10 text-center text-sm text-ink-400">
      <CheckCircle2 className="size-6 text-emerald-500" />
      {text}
    </div>
  )
}

/** Horizontal stacked bar with a legend — for small part-to-whole breakdowns. */
function SplitBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1
  return (
    <div className="space-y-3">
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-ink-100">
        {parts.map((p) => p.value > 0 && <div key={p.label} className={p.color} style={{ width: `${(p.value / total) * 100}%` }} title={`${p.label}: ${p.value}`} />)}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {parts.map((p) => (
          <div key={p.label}>
            <p className="flex items-center gap-1.5 text-xs text-ink-500">
              <span className={clsx('size-2 rounded-full', p.color)} />
              {p.label}
            </p>
            <p className="text-lg font-semibold tabular-nums text-ink-900">{p.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function CollectionsPanel() {
  const { data } = usePaymentInsights({})
  if (!data) return <Panel title="Collections" href="/payments/overview">{<Loading />}</Panel>
  const due = Number(data.period.due_to_date)
  const paid = Number(data.period.paid_of_due_to_date)
  const rate = due > 0 ? Math.round((paid / due) * 100) : 0
  const thisMonth = data.monthly.find((m) => m.month.slice(0, 7) === data.range.today.slice(0, 7))
  return (
    <Panel title="Collections" subtitle="Last 12 months, as of today" href="/payments/overview" linkLabel="Payment overview">
      <div className="space-y-5 px-5 py-4">
        <div>
          <div className="flex items-baseline justify-between">
            <p className="text-sm text-ink-500">Collection rate</p>
            <p className="text-2xl font-semibold text-ink-900">{rate}%</p>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-emerald-100">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${rate}%` }} />
          </div>
          <p className="mt-1 text-xs text-ink-400">
            {formatCurrencyCompact(paid)} paid of {formatCurrencyCompact(due)} that fell due
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Mini icon={<AlarmClock className="size-4" />} tone="text-red-600" label="Overdue now" value={formatCurrencyCompact(data.snapshot.overdue.amount)} sub={`${data.snapshot.overdue.count} instalments`} />
          <Mini icon={<CalendarClock className="size-4" />} tone="text-gold-700" label="Due now" value={formatCurrencyCompact(data.snapshot.due.amount)} sub={`${data.snapshot.due.count} instalments`} />
          <Mini icon={<Wallet className="size-4" />} tone="text-emerald-600" label="Collected this month" value={formatCurrencyCompact(thisMonth?.collected ?? 0)} sub={`of ${formatCurrencyCompact(thisMonth?.scheduled ?? 0)} scheduled`} />
          <Mini icon={<CalendarClock className="size-4" />} tone="text-ink-500" label="Due in next 30 days" value={formatCurrencyCompact(data.snapshot.next_30_days.amount)} sub={`${data.snapshot.next_30_days.count} instalments`} />
        </div>
      </div>
    </Panel>
  )
}

function Mini({ icon, tone, label, value, sub }: { icon: ReactNode; tone: string; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-ink-100 px-3 py-2.5">
      <p className={clsx('flex items-center gap-1.5 text-xs', tone)}>
        {icon}
        <span className="text-ink-500">{label}</span>
      </p>
      <p className="mt-0.5 text-lg font-semibold text-ink-900">{value}</p>
      <p className="text-xs text-ink-400">{sub}</p>
    </div>
  )
}

function TopOverduePanel() {
  const { data } = usePaymentInsights({})
  return (
    <Panel title="Largest overdue accounts" subtitle="By amount overdue today" href="/payments/milestones" linkLabel="Milestones">
      {!data ? (
        <Loading />
      ) : data.top_overdue.length === 0 ? (
        <Empty text="Nothing is overdue." />
      ) : (
        <ul className="divide-y divide-ink-100">
          {data.top_overdue.slice(0, 5).map((t) => (
            <li key={t.plot_id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              <p className="min-w-0 flex-1 truncate">
                <span className="font-medium text-ink-800">{t.buyer ? t.buyer.name || t.buyer.email : 'No buyer'}</span>
                <span className="text-xs text-ink-400"> · {t.plot_number} · {t.project_name}</span>
              </p>
              <span className={clsx('shrink-0 text-xs', t.days_overdue >= 60 ? 'font-medium text-red-600' : 'text-ink-400')}>{t.days_overdue}d late</span>
              <span className="w-20 shrink-0 text-right font-semibold tabular-nums text-ink-900">{formatCurrencyCompact(t.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function ProofsWaitingPanel() {
  const { data } = usePaymentVerificationQueue({ status: 'PENDING', page: 1 })
  return (
    <Panel title="Payment proofs waiting" subtitle="Oldest first" href="/payments/verification" linkLabel="Verify">
      {!data ? (
        <Loading />
      ) : data.results.length === 0 ? (
        <Empty text="No payment proofs waiting." />
      ) : (
        <ul className="divide-y divide-ink-100">
          {data.results.slice(0, 5).map((p) => (
            <li key={p.id}>
              <Link href="/payments/verification" className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-ink-50/60">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink-800">{p.customer_name || p.customer_email}</p>
                  <p className="truncate text-xs text-ink-400">
                    {p.plot_number} · {p.milestone_name}
                  </p>
                </div>
                <span className="shrink-0 text-right">
                  <span className="block font-semibold tabular-nums text-ink-900">{formatCurrency(p.claimed_amount)}</span>
                  <span className={clsx('block text-xs', ageTone(p.created_at))}>{formatAge(p.created_at)} ago</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function KycWaitingPanel() {
  const { data } = useKycQueue({ view: 'queue', page: 1 })
  return (
    <Panel title="Oldest KYC waiting" subtitle="Receipt and video checks, oldest first" href="/kyc" linkLabel="Review queue">
      {!data ? (
        <Loading />
      ) : data.results.length === 0 ? (
        <Empty text="The KYC queue is clear." />
      ) : (
        <ul className="divide-y divide-ink-100">
          {data.results.slice(0, 6).map((k) => {
            const needs = [k.step2_status === 'PENDING' && 'Receipt', k.step3_status === 'PENDING' && 'Video'].filter(Boolean).join(' + ')
            return (
              <li key={k.id}>
                <Link href={`/kyc/${k.id}`} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-ink-50/60">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink-800">{k.customer_name || k.customer_email}</p>
                    <p className="truncate text-xs text-ink-400">
                      {k.plot_number ? `${k.plot_number} · ` : ''}Needs {needs || 'review'}
                    </p>
                  </div>
                  <span className={clsx('shrink-0 text-xs font-semibold tabular-nums', ageTone(k.waiting_since))}>{formatAge(k.waiting_since)}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

function KycBreakdownPanel() {
  const { data } = useKycQueueStats()
  return (
    <Panel title="What's in the KYC queue" subtitle="Which steps are waiting" href="/kyc" linkLabel="Review queue">
      {!data ? (
        <Loading />
      ) : (
        <div className="space-y-4 px-5 py-4">
          <SplitBar
            parts={[
              { label: 'Receipt only', value: data.step2, color: 'bg-sky-500' },
              { label: 'Video only', value: data.step3, color: 'bg-violet-500' },
              { label: 'Both steps', value: data.both, color: 'bg-ink-500' },
            ]}
          />
          <div className="grid grid-cols-3 gap-3 border-t border-ink-100 pt-4 text-sm">
            <Stat label="Plot mismatch flagged" value={data.flagged} tone={data.flagged ? 'text-amber-700' : undefined} />
            <Stat label="Approved" value={data.approved} />
            <Stat label="Rejected (awaiting resubmission)" value={data.rejected} />
          </div>
        </div>
      )}
    </Panel>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <p className="text-xs text-ink-400">{label}</p>
      <p className={clsx('text-lg font-semibold tabular-nums', tone ?? 'text-ink-900')}>{value}</p>
    </div>
  )
}

function TicketsWaitingPanel() {
  const { data } = useTickets({ awaiting: 'true', page: 1 })
  return (
    <Panel title="Customers waiting on a reply" subtitle="The customer spoke last" href="/tickets" linkLabel="Inbox">
      {!data ? (
        <Loading />
      ) : data.results.length === 0 ? (
        <Empty text="No one is waiting on a reply." />
      ) : (
        <ul className="divide-y divide-ink-100">
          {data.results.slice(0, 6).map((t) => (
            <li key={t.id}>
              <Link href={`/tickets/${t.id}`} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-ink-50/60">
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    <span className="font-medium text-ink-800">{t.customer_name || t.customer_email}</span>
                    <span className="text-ink-500"> · {t.subject}</span>
                  </p>
                  <p className="truncate text-xs text-ink-400">{t.last_message || '—'}</p>
                </div>
                <span className="shrink-0 text-right text-xs">
                  <span className={clsx('block font-semibold tabular-nums', ageTone(t.last_message_at))}>{formatAge(t.last_message_at ?? t.created_at)}</span>
                  <span className={clsx('block', t.assigned_to_name ? 'text-ink-400' : 'text-red-500')}>{t.assigned_to_name ?? 'Unassigned'}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function InventoryPanel() {
  const { data } = usePlotStatusCounts()
  return (
    <Panel title="Plot inventory" subtitle={data ? `${data.total} plots across all projects` : undefined} href="/plots" linkLabel="Inventory">
      {!data ? (
        <Loading />
      ) : (
        <div className="px-5 py-4">
          <SplitBar
            parts={[
              { label: 'Available', value: data.available, color: 'bg-emerald-500' },
              { label: 'Booked', value: data.booked, color: 'bg-amber-500' },
              { label: 'Sold', value: data.sold, color: 'bg-gold-500' },
            ]}
          />
        </div>
      )}
    </Panel>
  )
}

function CustomersPanel() {
  const { data } = useCustomerCounts()
  return (
    <Panel title="Customers" subtitle={data ? `${data.total} on record · ${data.noPlot} without a plot` : undefined} href="/customers" linkLabel="Customers">
      {!data ? (
        <Loading />
      ) : (
        <div className="space-y-3 px-5 py-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
            <Users className="size-3.5" /> KYC status
          </p>
          <SplitBar
            parts={[
              { label: 'Approved', value: data.approved, color: 'bg-emerald-500' },
              { label: 'Submitted', value: data.submitted, color: 'bg-sky-500' },
              { label: 'Not started', value: data.notStarted, color: 'bg-ink-300' },
              { label: 'Rejected', value: data.rejected, color: 'bg-red-500' },
            ]}
          />
        </div>
      )}
    </Panel>
  )
}

function AnnouncementsPanel() {
  const { data } = useCampaignStats()
  return (
    <Panel title="Announcements" subtitle="Campaigns to customers" href="/notifications" linkLabel="Notifications">
      {!data ? (
        <Loading />
      ) : (
        <div className="grid grid-cols-3 gap-3 px-5 py-4">
          <Stat label="Drafts waiting" value={data.drafts} tone={data.drafts ? 'text-gold-700' : undefined} />
          <Stat label="Campaigns sent" value={data.sent} />
          <div>
            <p className="text-xs text-ink-400">Last sent</p>
            <p className="flex items-center gap-1.5 text-sm font-medium text-ink-800">
              <Megaphone className="size-3.5 text-ink-400" />
              {data.last_sent_at ? `${formatAge(data.last_sent_at)} ago` : 'Never'}
            </p>
          </div>
        </div>
      )}
    </Panel>
  )
}

function ActivityPanel() {
  const { data } = useAuditLog({ page: 1 })
  return (
    <Panel title="Recent activity" subtitle="Latest changes across the portal" href="/audit-log" linkLabel="Audit log">
      {!data ? (
        <Loading />
      ) : data.results.length === 0 ? (
        <Empty text="No activity yet." />
      ) : (
        <ul className="divide-y divide-ink-100">
          {data.results.slice(0, 7).map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              <History className="size-3.5 shrink-0 text-ink-300" />
              <p className="min-w-0 flex-1 truncate text-ink-600">
                <span className="font-medium text-ink-900">{e.actor_name}</span> {e.action.split('.').reverse().join(' ').replaceAll('_', ' ')}
                {e.target_label && e.action !== 'admin.login' && <span className="text-ink-800"> · {e.target_label}</span>}
              </p>
              <span className="shrink-0 text-xs text-ink-400">{formatAge(e.created_at)} ago</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
