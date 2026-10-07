import { formatCurrency } from '@/lib/format'
import type { Milestone, MilestoneChangeRequest, ScheduleItem } from '@/types'

/** Milestones a change replaces — the backend's apply_schedule keeps PAID and UNDER_REVIEW ones. */
export const replaceable = (schedule: Milestone[]) => schedule.filter((m) => m.status !== 'PAID' && m.status !== 'UNDER_REVIEW')

// Money is handled in whole paise so splits add up exactly.
const toPaise = (v: string | number) => Math.round(Number(v) * 100)
const fromPaise = (p: number) => (p / 100).toFixed(2)

/** Split `totalPaise` into `n` parts; any remainder goes on the last part. */
function splitEvenly(totalPaise: number, n: number): number[] {
  const base = Math.floor(totalPaise / n)
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? totalPaise - base * (n - 1) : base))
}

/** YYYY-MM-DD plus `months`, clamped to the last day of the target month (31 Jan + 1 → 28/29 Feb). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, lastDay))
  return target.toISOString().slice(0, 10)
}

export interface Proposal {
  schedule: ScheduleItem[]
  /** Something the admin should look at before approving (proposal couldn't be applied cleanly). */
  warning?: string
}

/**
 * Turn a customer's request into a concrete replacement for the plot's unpaid milestones.
 * The admin reviews/edits this before approving; it's a starting point, not a decision.
 */
export function buildProposal(r: MilestoneChangeRequest, schedule: Milestone[]): Proposal {
  const open = replaceable(schedule)
  const current: ScheduleItem[] = open.map((m) => ({ name: m.name, amount: m.amount, due_date: m.due_date }))
  const d = r.proposed_details as Record<string, unknown>
  const keptCount = schedule.length - open.length

  if (open.length === 0) return { schedule: [], warning: 'Every milestone is already paid or under review — there is nothing left to change.' }

  switch (r.change_type) {
    case 'CHANGE_DATE': {
      const idx = open.findIndex((m) => m.sequence === Number(d.milestone_sequence))
      const newDate = typeof d.new_due_date === 'string' ? d.new_due_date : ''
      if (idx === -1 || !newDate) {
        return { schedule: current, warning: `Milestone #${String(d.milestone_sequence)} is already paid, under review, or doesn't exist — adjust the schedule manually.` }
      }
      return { schedule: current.map((s, i) => (i === idx ? { ...s, due_date: newDate } : s)) }
    }

    case 'PAY_MORE':
    case 'PAY_LESS': {
      const newFirst = toPaise(String(d.amount ?? 0))
      const total = open.reduce((sum, m) => sum + toPaise(m.amount), 0)
      if (newFirst <= 0) return { schedule: current, warning: 'The requested amount is missing or zero — adjust the schedule manually.' }
      if (newFirst > total) {
        return { schedule: current, warning: `The requested ${formatCurrency(fromPaise(newFirst))} is more than the whole outstanding balance — adjust the schedule manually.` }
      }
      const rest = total - newFirst
      const next = { ...current[0], amount: fromPaise(newFirst) }
      if (open.length === 1) {
        // Nothing to spread the difference over: a shortfall becomes a new instalment a month later.
        return rest === 0
          ? { schedule: [next] }
          : { schedule: [next, { name: 'Balance instalment', amount: fromPaise(rest), due_date: addMonths(current[0].due_date, 1) }] }
      }
      // Spread the difference across the remaining instalments so the total stays the same.
      const parts = splitEvenly(rest, open.length - 1)
      return { schedule: [next, ...current.slice(1).map((s, i) => ({ ...s, amount: fromPaise(parts[i]) }))] }
    }

    case 'CHANGE_INSTALMENTS': {
      const n = Math.floor(Number(d.new_instalment_count))
      if (!n || n < 1) return { schedule: current, warning: 'The requested instalment count is missing — adjust the schedule manually.' }
      const total = open.reduce((sum, m) => sum + toPaise(m.amount), 0)
      const parts = splitEvenly(total, n)
      const start = current[0].due_date
      return {
        schedule: parts.map((p, i) => ({
          name: `Instalment ${keptCount + i + 1} of ${keptCount + n}`,
          amount: fromPaise(p),
          due_date: addMonths(start, i),
        })),
      }
    }

    default: {
      // RESPLIT: use the customer's own schedule if they sent one.
      const sent = Array.isArray(d.schedule) ? (d.schedule as ScheduleItem[]) : null
      return sent?.length ? { schedule: sent } : { schedule: current, warning: 'No specific split was requested — edit the schedule before approving.' }
    }
  }
}

/** Sum of a schedule in rupees. */
export const scheduleTotal = (items: ScheduleItem[]) => items.reduce((s, i) => s + (Number(i.amount) || 0), 0)
