import clsx from 'clsx'
import { formatDate } from '@/lib/format'
import type { Milestone, MilestoneStatus } from '@/types'

export const MILESTONE_STATUSES: { value: MilestoneStatus; label: string; dot: string; pill: string }[] = [
  { value: 'OVERDUE', label: 'Overdue', dot: 'bg-red-500', pill: 'bg-red-50 text-red-700 ring-red-200' },
  { value: 'DUE', label: 'Due', dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-800 ring-amber-200' },
  { value: 'UNDER_REVIEW', label: 'Under review', dot: 'bg-sky-500', pill: 'bg-sky-50 text-sky-700 ring-sky-200' },
  { value: 'UPCOMING', label: 'Upcoming', dot: 'bg-ink-300', pill: 'bg-ink-50 text-ink-600 ring-ink-200' },
  { value: 'PAID', label: 'Paid', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  { value: 'REJECTED', label: 'Proof rejected', dot: 'bg-red-400', pill: 'bg-red-50 text-red-700 ring-red-200' },
]

export function milestoneMeta(status: string) {
  return MILESTONE_STATUSES.find((s) => s.value === status) ?? MILESTONE_STATUSES[3]
}

export function MilestonePill({ status }: { status: string }) {
  const m = milestoneMeta(status)
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1', m.pill)}>
      <span className={clsx('size-1.5 rounded-full', m.dot)} />
      {m.label}
    </span>
  )
}

/** Whole days from today to `date` (negative = past), in local time. */
function daysUntil(date: string, now: number = Date.now()) {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const d = new Date(`${date}T00:00:00`)
  return Math.round((d.getTime() - today.getTime()) / 86_400_000)
}

/** "12 days overdue" / "due today" / "in 5 days" / "paid 3 Mar 2026", with a tone class. */
export function dueHint(m: Pick<Milestone, 'due_date' | 'status' | 'paid_date'>): { text: string; tone: string } {
  if (m.status === 'PAID') return { text: m.paid_date ? `Paid ${formatDate(m.paid_date)}` : 'Paid', tone: 'text-emerald-600' }
  const d = daysUntil(m.due_date)
  if (d < 0) return { text: `${-d} day${d === -1 ? '' : 's'} overdue`, tone: 'text-red-600' }
  if (d === 0) return { text: 'Due today', tone: 'text-amber-600' }
  return { text: `In ${d} day${d === 1 ? '' : 's'}`, tone: d <= 7 ? 'text-amber-600' : 'text-ink-400' }
}
