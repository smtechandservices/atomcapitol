import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'

export function EmptyState({
  title = 'Nothing here yet',
  subtitle,
  icon,
  action,
}: {
  title?: string
  subtitle?: string
  icon?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-ink-50 text-ink-300">
        {icon ?? <Inbox className="size-6" />}
      </div>
      <p className="text-sm font-medium text-ink-600">{title}</p>
      {subtitle && <p className="max-w-sm text-xs text-ink-400">{subtitle}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-6 py-14 text-center">
      <p className="text-sm font-medium text-red-600">Couldn&apos;t load this</p>
      <p className="max-w-sm text-xs text-ink-400">{message}</p>
    </div>
  )
}
