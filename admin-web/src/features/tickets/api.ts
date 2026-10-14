import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Paginated, TicketAssignee, TicketDetail, TicketListItem, TicketStats } from '@/types'

export interface TicketFilters {
  page?: number
  search?: string
  status?: string
  /** comma-separated, e.g. "OPEN,IN_PROGRESS" */
  status__in?: string
  category?: string
  assigned_to?: string
  assigned_to__isnull?: string
  /** active tickets where the customer spoke last */
  awaiting?: string
}

export function useTicketStats() {
  return useQuery({
    queryKey: ['tickets', 'stats'],
    queryFn: async () => {
      const { data } = await api.get<TicketStats>('/admin/tickets/stats/')
      return data
    },
  })
}

/** Admins who can be assigned tickets (works for SUPPORT users, unlike /admin/admin-users/). */
export function useTicketAssignees() {
  return useQuery({
    queryKey: ['ticket-assignees'],
    queryFn: async () => {
      const { data } = await api.get<TicketAssignee[]>('/admin/tickets/assignees/')
      return data
    },
    staleTime: 5 * 60_000,
  })
}

export function useTickets(filters: TicketFilters, enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['tickets', filters],
    queryFn: async () => {
      const { data } = await api.get<Paginated<TicketListItem>>('/admin/tickets/', { params: filters })
      return data
    },
  })
}

export function useTicket(id: number | string | undefined) {
  return useQuery({
    queryKey: ['ticket', id],
    queryFn: async () => {
      const { data } = await api.get<TicketDetail>(`/admin/tickets/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export function useReplyTicket(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ message, attachment }: { message: string; attachment?: File }) => {
      const form = new FormData()
      form.append('message', message)
      if (attachment) form.append('attachment', attachment)
      const { data } = await api.post<TicketDetail>(`/admin/tickets/${id}/reply/`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', String(id)] })
      qc.invalidateQueries({ queryKey: ['tickets'] })
    },
  })
}

export function useAssignTicket(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (assigned_to: number | null) => {
      const { data } = await api.post<TicketDetail>(`/admin/tickets/${id}/assign/`, { assigned_to })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', String(id)] })
      qc.invalidateQueries({ queryKey: ['tickets'] })
    },
  })
}

export function useSetTicketStatus(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (status: string) => {
      const { data } = await api.post<TicketDetail>(`/admin/tickets/${id}/status/`, { status })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', String(id)] })
      qc.invalidateQueries({ queryKey: ['tickets'] })
    },
  })
}
