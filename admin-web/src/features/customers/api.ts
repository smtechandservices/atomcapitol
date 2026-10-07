import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { CustomerDetail, CustomerListItem, Paginated } from '@/types'

export interface CustomerFilters {
  page?: number
  search?: string
  kyc_status?: string
  is_active?: string
  assigned_plot__isnull?: string
  assigned_sales_person?: string | number
  assigned_sales_person__isnull?: string
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

/** Headline counts for the customers page — reads `count` off page-1 requests. */
export function useCustomerCounts() {
  return useQuery({
    queryKey: ['customers', 'counts'],
    queryFn: async () => {
      const filters: Record<string, Record<string, string>> = {
        total: {},
        notStarted: { kyc_status: 'NOT_STARTED' },
        submitted: { kyc_status: 'SUBMITTED' },
        approved: { kyc_status: 'APPROVED' },
        rejected: { kyc_status: 'REJECTED' },
        noPlot: { assigned_plot__isnull: 'true' },
      }
      const entries = await Promise.all(
        Object.entries(filters).map(async ([key, params]) => {
          const { data } = await api.get<Paginated<unknown>>('/admin/customers/', { params: { ...params, page: 1 } })
          return [key, data.count] as const
        }),
      )
      return Object.fromEntries(entries) as Record<keyof typeof filters, number>
    },
    staleTime: 30_000,
  })
}

/** Picker lookup: searches all customers, or lists those without a plot when the search is empty. */
export function useCustomerLookup(search: string, enabled = true) {
  return useQuery({
    queryKey: ['customers', 'lookup', search],
    queryFn: async () => {
      const params = search ? { search } : { assigned_plot__isnull: 'true' }
      const { data } = await api.get<Paginated<CustomerListItem>>('/admin/customers/', { params })
      return data
    },
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
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

export function useCustomerDeleteCheck(id: number, enabled: boolean) {
  return useQuery({
    queryKey: ['customer', String(id), 'delete-check'],
    queryFn: async () => (await api.get<{ can_delete: boolean; reasons: string[] }>(`/admin/customers/${id}/delete-check/`)).data,
    enabled,
    staleTime: 0,
  })
}

export function useDeleteCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/customers/${id}/`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}

/** Super admin override of the overall KYC status (normally derived from the KYC submission). */
export function useSetCustomerKycStatus(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ kyc_status, reason }: { kyc_status: string; reason: string }) => {
      const { data } = await api.post<CustomerDetail>(`/admin/customers/${id}/set-kyc-status/`, { kyc_status, reason })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['customer', String(id)] })
      qc.invalidateQueries({ queryKey: ['kyc-queue'] })
    },
  })
}
