import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AuditLogEntry, Paginated, PaymentOverviewSummary } from '@/types'

function monthRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { start: fmt(start), end: fmt(end) }
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const { start, end } = monthRange()
      const [customers, kycQueue, verificationQueue, openTickets, inProgressTickets, overview, monthOverview, activity] =
        await Promise.all([
          api.get<Paginated<unknown>>('/admin/customers/?page=1'),
          api.get<Paginated<unknown>>('/admin/kyc-queue/?page=1'),
          api.get<Paginated<unknown>>('/admin/payment-verification-queue/?page=1'),
          api.get<Paginated<unknown>>('/admin/tickets/?status=OPEN&page=1'),
          api.get<Paginated<unknown>>('/admin/tickets/?status=IN_PROGRESS&page=1'),
          api.get<PaymentOverviewSummary>('/admin/payment-overview/'),
          api.get<PaymentOverviewSummary>(`/admin/payment-overview/?start_date=${start}&end_date=${end}`),
          api.get<AuditLogEntry[] | Paginated<AuditLogEntry>>('/admin/audit-log/?ordering=-created_at&page=1'),
        ])

      const activityData = activity.data
      const activityList = Array.isArray(activityData) ? activityData : activityData.results

      return {
        totalCustomers: customers.data.count,
        kycPending: kycQueue.data.count,
        paymentProofsPending: verificationQueue.data.count,
        openTickets: openTickets.data.count + inProgressTickets.data.count,
        overview: overview.data,
        monthDue: monthOverview.data.due,
        recentActivity: activityList.slice(0, 8),
      }
    },
    refetchInterval: 60_000,
  })
}
