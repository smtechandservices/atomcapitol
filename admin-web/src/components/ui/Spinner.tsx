import { Loader2 } from 'lucide-react'
import clsx from 'clsx'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('animate-spin text-ink-400', className)} />
}

export function FullPageSpinner() {
  return (
    <div className="flex h-64 w-full items-center justify-center">
      <Spinner className="size-8" />
    </div>
  )
}
