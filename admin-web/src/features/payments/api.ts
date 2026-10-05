import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Milestone, MilestoneChangeRequest, Paginated, PaymentOverviewSummary, PaymentProofQueueItem, ScheduleItem } from '@/types'

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------
export function useMilestones(filters: { plot?: number; status?: string; page?: number }) {
  return useQuery({
    queryKey: ['milestones', filters],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Milestone>>('/admin/milestones/', { params: filters })
      return data
    },
    enabled: filters.plot !== undefined || filters.status !== undefined || filters.page !== undefined,
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['milestones'] }),
  })
}

export function useUpdateMilestone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id: number; values: Partial<MilestoneFormValues> }) => {
      const { data } = await api.patch<Milestone>(`/admin/milestones/${id}/`, values)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['milestones'] }),
  })
}

export function useDeleteMilestone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/milestones/${id}/`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['milestones'] }),
  })
}

// ---------------------------------------------------------------------------
// Payment verification queue
// ---------------------------------------------------------------------------
export function usePaymentVerificationQueue(filters: { page?: number; project?: string }) {
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
export function useChangeRequests(filters: { page?: number; status?: string; plot?: string }) {
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
