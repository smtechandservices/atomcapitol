import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Milestone, MilestoneChangeRequest, MilestoneStats, Paginated, PaymentInsights, PaymentOverviewSummary, PaymentProofQueueItem, PaymentVerificationStats, ScheduleItem } from '@/types'

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------
export interface MilestoneFilters {
  plot?: number
  plot__project?: string
  status?: string
  /** comma-separated, e.g. "OVERDUE,DUE" */
  status__in?: string
  search?: string
  ordering?: string
  page?: number
}

/** Disabled until at least one filter is set (e.g. a customer page waiting on its plot id). */
export function useMilestones(filters: MilestoneFilters) {
  return useQuery({
    queryKey: ['milestones', filters],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Milestone>>('/admin/milestones/', { params: filters })
      return data
    },
    enabled: Object.values(filters).some((v) => v !== undefined),
  })
}

/** Every milestone of one plot, across pages, in sequence order. */
export function usePlotSchedule(plotId: number | null) {
  return useQuery({
    queryKey: ['milestones', 'plot-schedule', plotId],
    queryFn: async () => {
      const all: Milestone[] = []
      let url: string | null = '/admin/milestones/'
      let params: Record<string, unknown> | undefined = { plot: plotId, ordering: 'sequence', page: 1 }
      while (url) {
        const { data }: { data: Paginated<Milestone> } = await api.get(url, { params })
        all.push(...data.results)
        url = data.next
        params = undefined
      }
      return all
    },
    enabled: plotId !== null,
  })
}

export function useMilestoneStats(project?: string) {
  return useQuery({
    queryKey: ['milestones', 'stats', project ?? 'all'],
    queryFn: async () => {
      const { data } = await api.get<MilestoneStats>('/admin/milestones/stats/', { params: { plot__project: project || undefined } })
      return data
    },
  })
}

export interface MilestoneFormValues {
  plot: number
  sequence: number
  name: string
  description?: string
  amount: string
  due_date: string
  status?: string
  admin_remarks?: string
}

export function useCreateMilestone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: MilestoneFormValues) => {
      const { data } = await api.post<Milestone>('/admin/milestones/', values)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['milestones'] })
      qc.invalidateQueries({ queryKey: ['plots'] })
    },
  })
}

export function useUpdateMilestone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id: number; values: Partial<MilestoneFormValues> }) => {
      const { data } = await api.patch<Milestone>(`/admin/milestones/${id}/`, values)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['milestones'] })
      qc.invalidateQueries({ queryKey: ['plots'] })
    },
  })
}

export function useDeleteMilestone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/milestones/${id}/`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['milestones'] })
      qc.invalidateQueries({ queryKey: ['plots'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Payment verification queue
// ---------------------------------------------------------------------------
export interface PaymentQueueFilters {
  page?: number
  search?: string
  milestone__plot__project?: string
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'all'
  mismatch?: 'true'
  stale?: 'true'
}

export function usePaymentVerificationStats(project?: string) {
  return useQuery({
    queryKey: ['payment-verification-queue', 'stats', project ?? 'all'],
    queryFn: async () => {
      const { data } = await api.get<PaymentVerificationStats>('/admin/payment-verification-queue/stats/', {
        params: { milestone__plot__project: project || undefined },
      })
      return data
    },
  })
}

export function usePaymentVerificationQueue(filters: PaymentQueueFilters) {
  return useQuery({
    queryKey: ['payment-verification-queue', filters],
    queryFn: async () => {
      const { data } = await api.get<Paginated<PaymentProofQueueItem>>('/admin/payment-verification-queue/', { params: filters })
      return data
    },
  })
}

export function useApprovePaymentProof(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { corrected_amount?: string; corrected_date?: string }) => {
      const { data } = await api.post<PaymentProofQueueItem>(`/admin/payment-verification-queue/${id}/approve/`, payload)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-verification-queue'] })
      qc.invalidateQueries({ queryKey: ['milestones'] })
      qc.invalidateQueries({ queryKey: ['documents'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
  })
}

export function useRejectPaymentProof(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (reason: string) => {
      const { data } = await api.post<PaymentProofQueueItem>(`/admin/payment-verification-queue/${id}/reject/`, { reason })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-verification-queue'] })
      qc.invalidateQueries({ queryKey: ['milestones'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Milestone change requests
// ---------------------------------------------------------------------------
export interface ChangeRequestFilters {
  page?: number
  status?: string
  plot?: string
  plot__project?: string
  change_type?: string
  search?: string
  ordering?: string
}

/** Count per status, read off page-1 requests. */
export function useChangeRequestCounts(project?: string) {
  return useQuery({
    queryKey: ['change-requests', 'counts', project ?? 'all'],
    queryFn: async () => {
      const statuses = ['PENDING', 'COUNTERED', 'APPROVED', 'DECLINED'] as const
      const results = await Promise.all(
        statuses.map((status) =>
          api.get<Paginated<unknown>>('/admin/milestone-change-requests/', { params: { status, plot__project: project || undefined, page: 1 } }),
        ),
      )
      const [PENDING, COUNTERED, APPROVED, DECLINED] = results.map((r) => r.data.count)
      return { PENDING, COUNTERED, APPROVED, DECLINED, all: PENDING + COUNTERED + APPROVED + DECLINED }
    },
  })
}

export function useChangeRequests(filters: ChangeRequestFilters) {
  return useQuery({
    queryKey: ['change-requests', filters],
    queryFn: async () => {
      const { data } = await api.get<Paginated<MilestoneChangeRequest>>('/admin/milestone-change-requests/', { params: filters })
      return data
    },
  })
}

export function useApproveChangeRequest(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (schedule?: ScheduleItem[]) => {
      const { data } = await api.post<MilestoneChangeRequest>(`/admin/milestone-change-requests/${id}/approve/`, schedule ? { schedule } : {})
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['change-requests'] })
      qc.invalidateQueries({ queryKey: ['milestones'] })
    },
  })
}

export function useDeclineChangeRequest(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (reason: string) => {
      const { data } = await api.post<MilestoneChangeRequest>(`/admin/milestone-change-requests/${id}/decline/`, { reason })
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['change-requests'] }),
  })
}

export function useCounterChangeRequest(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { schedule: ScheduleItem[]; note?: string }) => {
      const { data } = await api.post<MilestoneChangeRequest>(`/admin/milestone-change-requests/${id}/counter/`, payload)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['change-requests'] }),
  })
}

// ---------------------------------------------------------------------------
// Payment overview
// ---------------------------------------------------------------------------
export function usePaymentOverview(filters: { project?: string; start_date?: string; end_date?: string }) {
  return useQuery({
    queryKey: ['payment-overview', filters],
    queryFn: async () => {
      const { data } = await api.get<PaymentOverviewSummary>('/admin/payment-overview/', { params: filters })
      return data
    },
  })
}

export function usePaymentInsights(filters: { project?: string; start_date?: string; end_date?: string }) {
  return useQuery({
    queryKey: ['payment-overview', 'insights', filters],
    queryFn: async () => {
      const { data } = await api.get<PaymentInsights>('/admin/payment-overview/insights/', { params: filters })
      return data
    },
    // keep the previous render on screen while a new range loads (no skeleton flash)
    placeholderData: keepPreviousData,
  })
}
