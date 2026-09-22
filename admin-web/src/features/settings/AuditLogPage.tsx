'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Input } from '@/components/ui/Field'
import { apiErrorMessage } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import type { AuditLogEntry } from '@/types'
import { useAuditLog } from './api'

export function AuditLogPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const { data, isLoading, error } = useAuditLog({ page, search: search || undefined })

  const columns: Column<AuditLogEntry>[] = [
    { key: 'action', header: 'Action', render: (e) => <span className="font-medium text-ink-800">{e.action}</span> },
    { key: 'actor', header: 'Actor', render: (e) => e.actor_name },
    { key: 'target', header: 'Target', render: (e) => `${e.target_type} #${e.target_id}` },
    { key: 'ip', header: 'IP', render: (e) => e.ip_address ?? '—' },
    { key: 'when', header: 'When', render: (e) => formatDateTime(e.created_at) },
  ]

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Who changed what, and when" />
      <Card>
        <div className="flex items-center gap-3 border-b border-ink-100 p-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
            <Input
              className="pl-9"
              placeholder="Search by action or target"
              value={search}
              onChange={(e) => {
                setPage(1)
                setSearch(e.target.value)
              }}
            />
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={data?.results ?? []}
          rowKey={(r) => r.id}
          isLoading={isLoading}
          error={error ? apiErrorMessage(error) : null}
          page={page}
          onPageChange={setPage}
          count={data?.count}
        />
      </Card>
    </div>
  )
}
