'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Input } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { apiErrorMessage } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import type { KycQueueListItem } from '@/types'
import { useKycQueue } from './api'

export function KycQueuePage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const router = useRouter()
  const { data, isLoading, error } = useKycQueue({ page, search: search || undefined })

  const columns: Column<KycQueueListItem>[] = [
    { key: 'customer', header: 'Customer', render: (r) => <span className="font-medium text-ink-800">{r.customer_name || r.customer_email}</span> },
    { key: 'email', header: 'Email', render: (r) => r.customer_email },
    { key: 'plot', header: 'Plot', render: (r) => r.plot_number ?? '—' },
    { key: 'step2', header: 'Step 2 (Plot+Receipt)', render: (r) => (r.step2_status ? <Badge>{r.step2_status}</Badge> : '—') },
    { key: 'step3', header: 'Step 3 (Video KYC)', render: (r) => (r.step3_status ? <Badge>{r.step3_status}</Badge> : '—') },
    { key: 'submitted', header: 'Submitted', render: (r) => formatDateTime(r.step2_submitted_at ?? r.step3_submitted_at) },
  ]

  return (
    <div>
      <PageHeader title="KYC Review Queue" subtitle="Oldest submissions first — approve or reject Step 2 and Step 3 independently" />
      <Card>
        <div className="flex items-center gap-3 border-b border-ink-100 p-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
            <Input
              className="pl-9"
              placeholder="Search by customer name or email"
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
          onRowClick={(row) => router.push(`/kyc/${row.id}`)}
          page={page}
          onPageChange={setPage}
          count={data?.count}
          emptyTitle="Queue is empty"
          emptySubtitle="No customer has a pending KYC submission right now."
        />
      </Card>
    </div>
  )
}
