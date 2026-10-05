'use client'

import { Users, ShieldCheck, FileCheck2, Ticket, Wallet, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard, Card, CardHeader, CardBody } from '@/components/ui/Card'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { ErrorState, EmptyState } from '@/components/ui/EmptyState'
import { useDashboardStats } from './api'
import { formatCurrency, formatDateTime } from '@/lib/format'
import { apiErrorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'

export function DashboardPage() {
  const { data, isLoading, error } = useDashboardStats()
  const { user } = useAuth()

  return (
    <div>
      <PageHeader title={`Welcome back, ${user?.name || user?.email}`} subtitle="Here's what needs your attention today." />

      {isLoading && <FullPageSpinner />}
      {!isLoading && error && <ErrorState message={apiErrorMessage(error)} />}

      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total customers" value={data.totalCustomers} icon={<Users className="size-5" />} accent="ink" />
            <Link href="/kyc">
              <StatCard label="KYC pending review" value={data.kycPending} icon={<ShieldCheck className="size-5" />} accent="gold" />
            </Link>
            <Link href="/payments/verification">
              <StatCard
                label="Payment proofs awaiting review"
                value={data.paymentProofsPending}
                icon={<FileCheck2 className="size-5" />}
                accent="gold"
              />
            </Link>
            <Link href="/tickets">
              <StatCard label="Open tickets" value={data.openTickets} icon={<Ticket className="size-5" />} accent="ink" />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Due this month" value={formatCurrency(data.monthDue)} icon={<Wallet className="size-5" />} accent="success" />
            <StatCard
              label="Overdue (all time)"
              value={formatCurrency(data.overview.overdue)}
              icon={<AlertTriangle className="size-5" />}
              accent="danger"
            />
            <StatCard label="Under review" value={formatCurrency(data.overview.under_review)} icon={<FileCheck2 className="size-5" />} />
            <StatCard label="Received (all time)" value={formatCurrency(data.overview.received)} icon={<Wallet className="size-5" />} />
          </div>

          <Card>
            <CardHeader title="Recent activity" subtitle="Latest actions across the portal" />
            <CardBody className="p-0">
              {data.recentActivity.length === 0 ? (
                <EmptyState title="No activity yet" />
              ) : (
                <ul className="divide-y divide-ink-100">
                  {data.recentActivity.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                      <div>
                        <p className="font-medium text-ink-700">{entry.action}</p>
                        <p className="text-xs text-ink-400">
                          {entry.actor_name} &middot; {entry.target_type} #{entry.target_id}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-ink-400">{formatDateTime(entry.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  )
}
