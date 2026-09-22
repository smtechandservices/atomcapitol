import clsx from 'clsx'
import type { ReactNode } from 'react'

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'gold'

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-600',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-sky-100 text-sky-700',
  gold: 'bg-gold-100 text-gold-800',
}

const STATUS_TONE: Record<string, Tone> = {
  // KYC
  NOT_STARTED: 'neutral',
  SUBMITTED: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
  // Plot
  AVAILABLE: 'success',
  BOOKED: 'warning',
  SOLD: 'gold',
  // Milestone
  UPCOMING: 'neutral',
  DUE: 'warning',
  OVERDUE: 'danger',
  UNDER_REVIEW: 'info',
  PAID: 'success',
  // Ticket
  OPEN: 'warning',
  IN_PROGRESS: 'info',
  RESOLVED: 'success',
  CLOSED: 'neutral',
  // Change request
  PENDING: 'warning',
  DECLINED: 'danger',
  COUNTERED: 'info',
  // Document
  ISSUED: 'success',
  // generic
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  PUBLISHED: 'success',
  UNPUBLISHED: 'neutral',
  UNDER_CONSTRUCTION: 'warning',
  COMPLETED: 'success',
}

export function Badge({ children, tone }: { children: ReactNode; tone?: Tone }) {
  const resolvedTone = tone ?? (typeof children === 'string' ? STATUS_TONE[children] : undefined) ?? 'neutral'
  const label = typeof children === 'string' ? children.replaceAll('_', ' ') : children
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize',
        toneClasses[resolvedTone],
      )}
    >
      {label}
    </span>
  )
}
