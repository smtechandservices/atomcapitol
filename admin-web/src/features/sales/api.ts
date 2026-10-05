import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Paginated, SalesPerson } from '@/types'

export function useSalesTeam(filters: { page?: number; search?: string } = {}) {
  return useQuery({
    queryKey: ['sales-team', filters],
    queryFn: async () => {
      const { data } = await api.get<Paginated<SalesPerson>>('/admin/sales-team/', { params: filters })
      return data
    },
  })
}

export function useAllSalesPeople() {
  return useQuery({
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

export function useUpdateSalesPerson(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: Partial<{ name: string; phone: string; email: string; is_active: boolean }>) => {
      const { data } = await api.patch<SalesPerson>(`/admin/sales-team/${id}/`, values)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-team'] })
      qc.invalidateQueries({ queryKey: ['sales-team-all'] })
    },
  })
}

export function useAssignCustomersToSalesPerson(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (customer_ids: number[]) => {
      const { data } = await api.post<{ detail: string }>(`/admin/sales-team/${id}/assign-customers/`, { customer_ids })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-team'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}
