import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import type { ScheduleItem } from '@/types'

export function ScheduleEditor({ schedule, onChange }: { schedule: ScheduleItem[]; onChange: (schedule: ScheduleItem[]) => void }) {
  const update = (i: number, patch: Partial<ScheduleItem>) => {
    onChange(schedule.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }

  return (
    <div className="space-y-2">
      {schedule.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            className="flex-1"
            placeholder="Name"
            value={item.name ?? ''}
            onChange={(e) => update(i, { name: e.target.value })}
          />
          <Input
            className="w-32"
            type="number"
            placeholder="Amount"
            value={item.amount}
            onChange={(e) => update(i, { amount: e.target.value })}
          />
          <Input className="w-40" type="date" value={item.due_date} onChange={(e) => update(i, { due_date: e.target.value })} />
          <button onClick={() => onChange(schedule.filter((_, idx) => idx !== i))} className="text-ink-300 hover:text-red-600">
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        onClick={() => onChange([...schedule, { name: '', amount: '', due_date: '' }])}
      >
        <Plus className="size-4" /> Add instalment
      </Button>
    </div>
  )
}
