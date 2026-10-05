import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AdminUser, AuditLogEntry, CompanySettings, Paginated } from '@/types'

// ---------------------------------------------------------------------------
// Admin Users
// ---------------------------------------------------------------------------
export function useAdminUsers(filters: { page?: number; search?: string; role?: string } = {}) {
  return useQuery({
    queryKey: ['admin-users', filters],
    queryFn: async () => {
      const { data } = await api.get<Paginated<AdminUser>>('/admin/admin-users/', { params: filters })
      return data
    },
  })
}

export interface AdminUserFormValues {
  email: string
  first_name?: string
  last_name?: string
  phone?: string
  role: string
  password?: string
  is_active?: boolean
}

export function useCreateAdminUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: AdminUserFormValues) => {
      const { data } = await api.post<AdminUser>('/admin/admin-users/', values)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })
}

export function useUpdateAdminUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id: number; values: Partial<AdminUserFormValues> }) => {
      const { data } = await api.patch<AdminUser>(`/admin/admin-users/${id}/`, values)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })
}

export function useDeleteAdminUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/admin-users/${id}/`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------
export function useAuditLog(filters: { page?: number; search?: string; action?: string } = {}) {
  return useQuery({
    queryKey: ['audit-log', filters],
    queryFn: async () => {
      const { data } = await api.get<Paginated<AuditLogEntry>>('/admin/audit-log/', { params: filters })
      return data
    },
  })
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export function useCompanySettings() {
  return useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const { data } = await api.get<CompanySettings>('/admin/settings/')
      return data
    },
  })
}

export function useUpdateCompanySettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: CompanySettings) => {
      const { data } = await api.put<CompanySettings>('/admin/settings/', values)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['company-settings'] }),
  })
}
