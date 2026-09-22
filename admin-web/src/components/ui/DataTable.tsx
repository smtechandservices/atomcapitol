import type { ReactNode } from 'react'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { FullPageSpinner } from './Spinner'
import { EmptyState, ErrorState } from './EmptyState'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  isLoading?: boolean
  error?: string | null
  emptyTitle?: string
  emptySubtitle?: string
  onRowClick?: (row: T) => void
  page?: number
  onPageChange?: (page: number) => void
  count?: number
  pageSize?: number
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading,
  error,
  emptyTitle,
  emptySubtitle,
  onRowClick,
  page = 1,
  onPageChange,
  count,
  pageSize = 20,
}: DataTableProps<T>) {
  const totalPages = count !== undefined ? Math.max(1, Math.ceil(count / pageSize)) : undefined

  return (
    <div className="flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-left text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50/60 text-xs font-semibold uppercase tracking-wide text-ink-400">
              {columns.map((col) => (
                <th key={col.key} className={clsx('whitespace-nowrap px-4 py-3', col.className)}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {isLoading ? null : error ? null : rows.length === 0 ? null : (
              rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={() => onRowClick?.(row)}
                  className={clsx(
                    'transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-gold-50/60',
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={clsx('px-4 py-3 align-middle text-ink-700', col.className)}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
        {isLoading && <FullPageSpinner />}
        {!isLoading && error && <ErrorState message={error} />}
        {!isLoading && !error && rows.length === 0 && (
          <EmptyState title={emptyTitle ?? 'No records found'} subtitle={emptySubtitle} />
        )}
      </div>

      {!isLoading && !error && onPageChange && totalPages !== undefined && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-ink-100 px-4 py-3">
          <p className="text-xs text-ink-400">
            Page {page} of {totalPages} &middot; {count} total
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="flex size-8 items-center justify-center rounded-lg border border-ink-100 text-ink-500 hover:bg-ink-50 disabled:opacity-40"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="flex size-8 items-center justify-center rounded-lg border border-ink-100 text-ink-500 hover:bg-ink-50 disabled:opacity-40"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
