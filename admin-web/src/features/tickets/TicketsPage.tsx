'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Input, Select } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { apiErrorMessage } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import type { TicketListItem } from '@/types'
import { useTickets } from './api'

export function TicketsPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const router = useRouter()
  const { data, isLoading, error } = useTickets({
    page,
    search: search || undefined,
    status: status || undefined,
    category: category || undefined,
  })

  const columns: Column<TicketListItem>[] = [
    { key: 'subject', header: 'Subject', render: (t) => <span className="font-medium text-ink-800">{t.subject}</span> },
    { key: 'customer', header: 'Customer', render: (t) => t.customer_email },
    { key: 'category', header: 'Category', render: (t) => <Badge>{t.category}</Badge> },
    { key: 'status', header: 'Status', render: (t) => <Badge>{t.status}</Badge> },
    { key: 'assignee', header: 'Assigned to', render: (t) => t.assigned_to_email ?? '—' },
    { key: 'updated', header: 'Updated', render: (t) => formatDateTime(t.updated_at) },
  ]

  return (
    <div>
      <PageHeader title="Support Tickets" subtitle="Customer queries — reply, assign and manage status" />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 p-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
            <Input
              className="pl-9"
              placeholder="Search by subject or customer email"
              value={search}
              onChange={(e) => {
                setPage(1)
                setSearch(e.target.value)
              }}
            />
          </div>
          <Select
            className="w-40"
            value={status}
            onChange={(e) => {
              setPage(1)
              setStatus(e.target.value)
            }}
          >
            <option value="">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </Select>
          <Select
            className="w-44"
            value={category}
            onChange={(e) => {
              setPage(1)
              setCategory(e.target.value)
            }}
          >
            <option value="">All categories</option>
            <option value="PAYMENT">Payment</option>
            <option value="DOCUMENTS">Documents</option>
            <option value="CONSTRUCTION">Construction</option>
            <option value="GENERAL">General</option>
          </Select>
        </div>
        <DataTable
          columns={columns}
          rows={data?.results ?? []}
          rowKey={(r) => r.id}
          isLoading={isLoading}
          error={error ? apiErrorMessage(error) : null}
          onRowClick={(row) => router.push(`/tickets/${row.id}`)}
          page={page}
          onPageChange={setPage}
          count={data?.count}
        />
      </Card>
    </div>
  )
}
