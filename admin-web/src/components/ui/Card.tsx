import clsx from 'clsx'
import type { HTMLAttributes, ReactNode } from 'react'

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('rounded-xl border border-ink-100 bg-white shadow-sm', className)} {...rest}>
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
      <div>
        <h3 className="text-sm font-semibold text-ink-800">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-ink-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('px-5 py-4', className)}>{children}</div>
}

export function StatCard({
  label,
  value,
  icon,
  accent,
  className,
}: {
  label: string
  value: ReactNode
  icon?: ReactNode
  accent?: 'gold' | 'ink' | 'danger' | 'success'
  className?: string
}) {
  const accentClass = {
    gold: 'bg-gold-100 text-gold-700',
    ink: 'bg-ink-100 text-ink-700',
    danger: 'bg-red-100 text-red-700',
    success: 'bg-emerald-100 text-emerald-700',
  }[accent ?? 'ink']

  return (
    <Card className={clsx('flex items-center gap-4 p-4', className)}>
      {icon && <div className={clsx('flex size-11 shrink-0 items-center justify-center rounded-lg', accentClass)}>{icon}</div>}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-ink-400">{label}</p>
        <p className="text-2xl font-semibold text-ink-800">{value}</p>
      </div>
    </Card>
  )
}
