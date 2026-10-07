import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Paginated, Plot, PlotAssignmentHistoryEntry } from '@/types'

export interface PlotFilters {
  page?: number
  search?: string
  project?: string
  status?: string
}

export function usePlots(filters: PlotFilters) {
  return useQuery({
    queryKey: ['plots', filters],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Plot>>('/admin/plots/', { params: filters })
      return data
    },
  })
}

export function usePlot(id: number | null) {
  return useQuery({
    queryKey: ['plots', 'detail', id],
    queryFn: async () => {
      const { data } = await api.get<Plot>(`/admin/plots/${id}/`)
      return data
    },
    enabled: id !== null,
  })
}

/** Plot counts per status (optionally for one project) — reads `count` off three page-1 requests. */
export function usePlotStatusCounts(project?: number | string) {
  return useQuery({
    queryKey: ['plots', 'status-counts', project ?? 'all'],
    queryFn: async () => {
      const statuses = ['AVAILABLE', 'BOOKED', 'SOLD'] as const
      const results = await Promise.all(
        statuses.map((status) => api.get<Paginated<unknown>>('/admin/plots/', { params: { project: project || undefined, status, page: 1 } })),
      )
      const [available, booked, sold] = results.map((r) => r.data.count)
      return { available, booked, sold, total: available + booked + sold }
    },
  })
}

export interface BulkRowError {
  row: number
  error: string
}

export function usePlotHistory(plotId: number | undefined) {
  return useQuery({
    queryKey: ['plot-history', plotId],
    queryFn: async () => {
      const { data } = await api.get<PlotAssignmentHistoryEntry[]>(`/admin/plots/${plotId}/history/`)
      return data
    },
    enabled: !!plotId,
  })
}

export interface PlotFormValues {
  project: number
  plot_number: string
  size: string
  block_sector?: string
  price: string
}

export function useCreatePlot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: PlotFormValues) => {
      const { data } = await api.post<Plot>('/admin/plots/', values)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plots'] }),
  })
}

export function useUpdatePlot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id: number; values: Partial<PlotFormValues> & { status?: string } }) => {
      const { data } = await api.patch<Plot>(`/admin/plots/${id}/`, values)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plots'] })
      qc.invalidateQueries({ queryKey: ['project'] })
    },
  })
}

export interface AssignPayload {
  email: string
  role?: 'PRIMARY' | 'CO_APPLICANT'
  name?: string
  phone?: string
  total_value?: string
  amount_paid_outside_app?: string
  instalment_count?: number
}

export function useAssignPlot(plotId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: AssignPayload) => {
      const { data } = await api.post<Plot>(`/admin/plots/${plotId}/assign/`, payload)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plots'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['plot-history', plotId] })
    },
  })
}

/** Assign where the plot is chosen at submit time (customer pages), not fixed per hook. */
export function useAssignToPlot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ plotId, payload }: { plotId: number; payload: AssignPayload }) => {
      const { data } = await api.post<Plot>(`/admin/plots/${plotId}/assign/`, payload)
      return data
    },
    onSuccess: (_data, { plotId }) => {
      qc.invalidateQueries({ queryKey: ['plots'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['customer'] })
      qc.invalidateQueries({ queryKey: ['plot-history', plotId] })
    },
  })
}

export function useUnassignPlot(plotId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { customer_id: number; reason?: string }) => {
      const { data } = await api.post(`/admin/plots/${plotId}/unassign/`, payload)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plots'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['plot-history', plotId] })
    },
  })
}

export function useTransferPlot(plotId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { customer_id: number; new_email: string; reason?: string }) => {
      const { data } = await api.post<Plot>(`/admin/plots/${plotId}/transfer/`, payload)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plots'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['plot-history', plotId] })
    },
  })
}

export function useGenerateSchedule(plotId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/admin/plots/${plotId}/generate-schedule/`)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['milestones'] })
      qc.invalidateQueries({ queryKey: ['plots'] })
    },
  })
}

export function useBulkImportPlots() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ project, file }: { project: number; file: File }) => {
      const form = new FormData()
      form.append('project', String(project))
      form.append('file', file)
      const { data } = await api.post<{ created: number; errors: BulkRowError[] }>('/admin/plots/bulk-import/', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plots'] }),
  })
}

export function useBulkAssignPlots() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      const { data } = await api.post<{ assigned: number; errors: BulkRowError[] }>('/admin/plots/bulk-assign/', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plots'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

export function usePlotDeleteCheck(id: number, enabled: boolean) {
  return useQuery({
    queryKey: ['plots', 'delete-check', id],
    queryFn: async () => (await api.get<{ can_delete: boolean; reasons: string[] }>(`/admin/plots/${id}/delete-check/`)).data,
    enabled,
    staleTime: 0,
  })
}

export function useDeletePlot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/plots/${id}/`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plots'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['projects-all'] })
    },
  })
}
