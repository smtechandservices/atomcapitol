import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AllotmentPage, AllotmentRow, AllotmentStatus } from '@/types'

export interface AllotmentFilters {
  page?: number
  search?: string
  project?: string
  letter_status?: AllotmentStatus
}

export function useAllotments(filters: AllotmentFilters) {
  return useQuery({
    queryKey: ['allotments', filters],
    queryFn: async () => {
      const { data } = await api.get<AllotmentPage>('/admin/allotments/', { params: filters })
      return data
    },
    placeholderData: keepPreviousData,
  })
}

/** Issues (or re-issues with today's figures) the letter into the buyers' Documents; all buyers when `customers` is left out. */
export function useIssueAllotment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ plot, customers }: { plot: number; customers?: number[] }) => {
      const { data } = await api.post<AllotmentRow>(`/admin/allotments/${plot}/issue/`, { customers })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['allotments'] })
      qc.invalidateQueries({ queryKey: ['documents'] })
    },
  })
}
