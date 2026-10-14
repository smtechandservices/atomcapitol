import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Paginated, SalesPerson } from '@/types'

export function useSalesTeam(filters: { page?: number; search?: string; is_active?: string } = {}) {
  return useQuery({
    queryKey: ['sales-team', filters],
    queryFn: async () => {
      const { data } = await api.get<Paginated<SalesPerson>>('/admin/sales-team/', { params: filters })
      return data
    },
  })
}

export function useAllSalesPeople(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['sales-team-all'],
    queryFn: async () => {
      const all: SalesPerson[] = []
      let url: string | null = '/admin/sales-team/'
      let params: Record<string, unknown> | undefined = { page: 1 }
      while (url) {
        const { data }: { data: Paginated<SalesPerson> } = await api.get(url, { params })
        all.push(...data.results)
        url = data.next
        params = undefined
      }
      return all
    },
    staleTime: 60_000,
  })
}

export function useSalesPerson(id: number | null | undefined) {
  return useQuery({
    queryKey: ['sales-person', id],
    queryFn: async () => {
      const { data } = await api.get<SalesPerson>(`/admin/sales-team/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateSalesPerson() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: { name: string; phone: string; email: string; photo?: File }) => {
      const form = new FormData()
      form.append('name', values.name)
      form.append('phone', values.phone)
      form.append('email', values.email)
      form.append('is_active', 'true')
      if (values.photo) form.append('photo', values.photo)
      const { data } = await api.post<SalesPerson>('/admin/sales-team/', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-team'] })
      qc.invalidateQueries({ queryKey: ['sales-team-all'] })
    },
  })
}

const invalidateSales = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['sales-team'] })
  qc.invalidateQueries({ queryKey: ['sales-team-all'] })
  qc.invalidateQueries({ queryKey: ['sales-person'] })
  qc.invalidateQueries({ queryKey: ['customers'] })
  qc.invalidateQueries({ queryKey: ['customer'] })
}

export interface SalesPersonValues {
  name?: string
  phone?: string
  email?: string
  is_active?: boolean
  photo?: File
}

/** PATCH — multipart only when a new photo is attached. */
export function useUpdateSalesPerson() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id: number; values: SalesPersonValues }) => {
      if (values.photo) {
        const form = new FormData()
        Object.entries(values).forEach(([k, v]) => v !== undefined && form.append(k, v instanceof File ? v : String(v)))
        const { data } = await api.patch<SalesPerson>(`/admin/sales-team/${id}/`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
        return data
      }
      const { data } = await api.patch<SalesPerson>(`/admin/sales-team/${id}/`, values)
      return data
    },
    onSuccess: () => invalidateSales(qc),
  })
}

export function useDeleteSalesPerson() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/sales-team/${id}/`)
    },
    onSuccess: () => invalidateSales(qc),
  })
}

/** Link customers to a sales person — also moves them away from whoever had them. */
export function useAssignCustomers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ salesPersonId, customerIds }: { salesPersonId: number; customerIds: number[] }) => {
      const { data } = await api.post<{ detail: string; updated: number }>(`/admin/sales-team/${salesPersonId}/assign-customers/`, { customer_ids: customerIds })
      return data
    },
    onSuccess: () => invalidateSales(qc),
  })
}

export function useUnassignCustomers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ salesPersonId, customerIds }: { salesPersonId: number; customerIds: number[] }) => {
      const { data } = await api.post<{ detail: string; updated: number }>(`/admin/sales-team/${salesPersonId}/unassign-customers/`, { customer_ids: customerIds })
      return data
    },
    onSuccess: () => invalidateSales(qc),
  })
}

/** Hand all of one sales person's customers to another. */
export function useMoveAllCustomers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ fromId, toId }: { fromId: number; toId: number }) => {
      const { data } = await api.post<{ detail: string; updated: number }>(`/admin/sales-team/${fromId}/move-customers/`, { to_sales_person: toId })
      return data
    },
    onSuccess: () => invalidateSales(qc),
  })
}
