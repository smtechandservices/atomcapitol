import clsx from 'clsx'
import { Check, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { formatCurrency } from '@/lib/format'
import type { ScheduleItem } from '@/types'

/**
 * Editable list of {name, amount, due_date} rows. With `target`, shows whether the rows add up to it
 * (e.g. the outstanding balance being re-planned).
 */
export function ScheduleEditor({
  schedule,
  onChange,
  target,
}: {
  schedule: ScheduleItem[]
  onChange: (schedule: ScheduleItem[]) => void
  target?: number
}) {
  const update = (i: number, patch: Partial<ScheduleItem>) => {
    onChange(schedule.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }
  const total = schedule.reduce((sum, s) => sum + (Number(s.amount) || 0), 0)
  const diff = target === undefined ? 0 : total - target

  return (
    <div className="overflow-hidden rounded-lg border border-ink-200">
      <div className="grid grid-cols-[28px_1fr_150px_150px_32px] gap-2 border-b border-ink-100 bg-ink-50/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
        <span>#</span>
        <span>Name</span>
        <span>Amount</span>
        <span>Due date</span>
        <span />
      </div>
      <div className="divide-y divide-ink-100">
        {schedule.map((item, i) => (
          <div key={i} className="grid grid-cols-[28px_1fr_150px_150px_32px] items-center gap-2 px-3 py-2">
            <span className="text-xs font-semibold text-ink-400">{i + 1}</span>
            <Input placeholder="Instalment name" value={item.name ?? ''} onChange={(e) => update(i, { name: e.target.value })} />
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-ink-400">₹</span>
              <Input type="number" min={0} className="pl-6" placeholder="0" value={item.amount} onChange={(e) => update(i, { amount: e.target.value })} />
            </div>
            <Input type="date" value={item.due_date} onChange={(e) => update(i, { due_date: e.target.value })} />
            <button
              type="button"
              onClick={() => onChange(schedule.filter((_, idx) => idx !== i))}
              className="flex size-8 items-center justify-center rounded-lg text-ink-300 hover:bg-red-50 hover:text-red-600"
              aria-label="Remove instalment"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 bg-ink-50/40 px-3 py-2">
        <Button size="sm" variant="ghost" onClick={() => onChange([...schedule, { name: '', amount: '', due_date: '' }])}>
          <Plus className="size-3.5" /> Add instalment
        </Button>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-ink-400">Total</span>
          <span className="font-semibold tabular-nums text-ink-800">{formatCurrency(total)}</span>
          {target !== undefined && (
            <span
              className={clsx(
                'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                Math.abs(diff) < 1 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800',
              )}
            >
              {Math.abs(diff) < 1 ? (
                <>
                  <Check className="size-3" /> matches outstanding
                </>
              ) : (
                <>{diff > 0 ? `${formatCurrency(diff)} over` : `${formatCurrency(-diff)} short of`} outstanding</>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
