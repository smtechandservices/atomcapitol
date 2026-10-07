import clsx from 'clsx'
import { Check, Clock, Minus, X } from 'lucide-react'
import type { KYCStepStatus } from '@/types'

export const STEP_LABELS = { STEP2: 'Receipt', STEP3: 'Video' } as const

const DAY = 86_400_000

/** Waiting-time colour: neutral under 2 days, amber from 2, red from 5. */
export function ageTone(since: string | null | undefined, now: number = Date.now()) {
  if (!since) return 'text-ink-400'
  const days = (now - new Date(since).getTime()) / DAY
  if (days >= 5) return 'text-red-600'
  if (days >= 2) return 'text-amber-600'
  return 'text-ink-600'
}

/** One step's state as a compact chip: "Receipt · Review", "Video ✓", … */
export function StepChip({ label, status }: { label: string; status: KYCStepStatus | null }) {
  const meta = {
    PENDING: { cls: 'bg-sky-50 text-sky-700 ring-sky-200', icon: <Clock className="size-3" />, suffix: 'Review' },
    APPROVED: { cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: <Check className="size-3" />, suffix: null },
    REJECTED: { cls: 'bg-red-50 text-red-700 ring-red-200', icon: <X className="size-3" />, suffix: 'Rejected' },
  } as const
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-ink-300 ring-1 ring-ink-100">
        <Minus className="size-3" /> {label}
      </span>
    )
  }
  const m = meta[status]
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1', m.cls)}>
      {m.icon}
      {label}
      {m.suffix && <span className="font-medium opacity-75">· {m.suffix}</span>}
    </span>
  )
}

export function initialsOf(name: string, email: string) {
  return (name || email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}
