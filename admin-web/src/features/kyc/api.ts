import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { KycQueueDetail, KycQueueListItem, KycQueueStats, Paginated } from '@/types'

export interface KycQueueFilters {
  page?: number
  search?: string
  view?: 'queue' | 'approved' | 'rejected' | 'all'
  needs?: 'step2' | 'step3' | 'both'
  flagged?: 'true'
  stale?: 'true'
}

export function useKycQueue(filters: KycQueueFilters) {
  return useQuery({
    queryKey: ['kyc-queue', filters],
    queryFn: async () => {
      const { data } = await api.get<Paginated<KycQueueListItem>>('/admin/kyc-queue/', { params: filters })
      return data
    },
  })
}

export function useKycQueueStats() {
  return useQuery({
    queryKey: ['kyc-queue', 'stats'],
    queryFn: async () => {
      const { data } = await api.get<KycQueueStats>('/admin/kyc-queue/stats/')
      return data
    },
  })
}

export function useKycSubmission(id: number | string | undefined) {
  return useQuery({
    queryKey: ['kyc-submission', id],
    queryFn: async () => {
      const { data } = await api.get<KycQueueDetail>(`/admin/kyc-queue/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export interface KycDecisionPayload {
  step2_decision?: 'APPROVED' | 'REJECTED'
  step2_reason?: string
  step3_decision?: 'APPROVED' | 'REJECTED'
  step3_reason?: string
}

export function useDecideKyc(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: KycDecisionPayload) => {
      const { data } = await api.post<KycQueueDetail>(`/admin/kyc-queue/${id}/decide/`, payload)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kyc-submission', String(id)] })
      qc.invalidateQueries({ queryKey: ['kyc-queue'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
  })
}
