import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { CustomerDetail, CustomerListItem, Paginated } from '@/types'

export interface CustomerFilters {
  page?: number
  search?: string
  kyc_status?: string
  is_active?: string
}

export function useCustomers(filters: CustomerFilters) {
  return useQuery({
    queryKey: ['customers', filters],
    queryFn: async () => {
      const { data } = await api.get<Paginated<CustomerListItem>>('/admin/customers/', { params: filters })
      return data
    },
  })
}

export function useCustomer(id: number | string | undefined) {
  return useQuery({
    queryKey: ['customer', id],
    queryFn: async () => {
      const { data } = await api.get<CustomerDetail>(`/admin/customers/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export interface CustomerCreateValues {
  email: string
  name?: string
  phone?: string
  address?: string
}

export function useCreateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: CustomerCreateValues) => {
      const { data } = await api.post<CustomerDetail>('/admin/customers/', values)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}

export function useUpdateCustomer(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: Partial<{ name: string; phone: string; address: string; is_active: boolean; assigned_sales_person: number | null }>) => {
      const { data } = await api.patch<CustomerDetail>(`/admin/customers/${id}/`, values)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['customer', String(id)] })
    },
  })
}
