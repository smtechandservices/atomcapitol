'use client'

import { useState } from 'react'
import { Wallet, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, StatCard } from '@/components/ui/Card'
import { Select, Input, FieldWrap } from '@/components/ui/Field'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/EmptyState'
import { apiErrorMessage } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { useAllProjects } from '@/features/projects/api'
import { usePaymentOverview } from './api'

export function PaymentOverviewPage() {
  const [project, setProject] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const { data: projects } = useAllProjects()
  const { data, isLoading, error } = usePaymentOverview({
    project: project || undefined,
    start_date: startDate || undefined,
    end_date: endDate || undefined,
  })

  return (
    <div>
      <PageHeader title="Payment Overview" subtitle="Cross-customer collections: due, overdue and received in a period" />

      <Card className="mb-5">
        <div className="flex flex-wrap items-end gap-4 p-4">
          <FieldWrap label="Project">
            <Select className="w-56" value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="">All projects</option>
              {projects?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FieldWrap>
          <FieldWrap label="Start date">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </FieldWrap>
          <FieldWrap label="End date">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </FieldWrap>
        </div>
      </Card>

      {isLoading && <FullPageSpinner />}
      {!isLoading && error && <ErrorState message={apiErrorMessage(error)} />}

      {data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Due" value={formatCurrency(data.due)} icon={<Clock className="size-5" />} accent="ink" />
          <StatCard label="Overdue" value={formatCurrency(data.overdue)} icon={<AlertTriangle className="size-5" />} accent="danger" />
          <StatCard label="Received" value={formatCurrency(data.received)} icon={<CheckCircle2 className="size-5" />} accent="success" />
          <StatCard label="Under review" value={formatCurrency(data.under_review)} icon={<Wallet className="size-5" />} accent="gold" />
        </div>
      )}
      {data && <p className="mt-3 text-sm text-ink-400">{data.milestone_count} milestone(s) match this filter.</p>}
    </div>
  )
}
