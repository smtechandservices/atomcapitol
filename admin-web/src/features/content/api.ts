import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Banner, CampaignStats, NotificationCampaign, Paginated } from '@/types'

// ---------------------------------------------------------------------------
// Banners
// ---------------------------------------------------------------------------
export function useBanners(filters: { page?: number } = {}) {
  return useQuery({
    queryKey: ['banners', filters],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Banner>>('/admin/banners/', { params: filters })
      return data
    },
  })
}

export interface BannerFormValues {
  title: string
  image?: File
  link_target?: string
  display_order?: number
  start_date?: string
  end_date?: string
  is_active?: boolean
}

export function useCreateBanner() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: BannerFormValues) => {
      const form = new FormData()
      form.append('title', values.title)
      if (values.image) form.append('image', values.image)
      if (values.link_target) form.append('link_target', values.link_target)
      form.append('display_order', String(values.display_order ?? 0))
      if (values.start_date) form.append('start_date', values.start_date)
      if (values.end_date) form.append('end_date', values.end_date)
      form.append('is_active', String(values.is_active ?? true))
      const { data } = await api.post<Banner>('/admin/banners/', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['banners'] }),
  })
}

/**
 * PATCH a banner. Multipart only when a new image is attached; JSON otherwise so cleared
 * dates can be sent as null. Editing never re-notifies customers (only create does).
 */
export function useUpdateBanner() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id: number; values: Partial<Omit<BannerFormValues, 'start_date' | 'end_date'>> & { start_date?: string | null; end_date?: string | null } }) => {
      if (values.image) {
        const form = new FormData()
        Object.entries(values).forEach(([k, v]) => {
          if (v === undefined) return
          form.append(k, v instanceof File ? v : v === null ? '' : String(v))
        })
        const { data } = await api.patch<Banner>(`/admin/banners/${id}/`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
        return data
      }
      const { data } = await api.patch<Banner>(`/admin/banners/${id}/`, values)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['banners'] }),
  })
}

export function useDeleteBanner() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/banners/${id}/`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['banners'] }),
  })
}

// ---------------------------------------------------------------------------
// Notification campaigns
// ---------------------------------------------------------------------------
export function useCampaigns(filters: { page?: number; status?: string; search?: string } = {}) {
  return useQuery({
    queryKey: ['campaigns', filters],
    queryFn: async () => {
      const { data } = await api.get<Paginated<NotificationCampaign>>('/admin/notifications/campaigns/', { params: filters })
      return data
    },
  })
}

export function useCampaignStats() {
  return useQuery({
    queryKey: ['campaigns', 'stats'],
    queryFn: async () => {
      const { data } = await api.get<CampaignStats>('/admin/notifications/campaigns/stats/')
      return data
    },
  })
}

/** How many customers an audience reaches — the same rule the backend uses when sending. */
export function useRecipientPreview(audience: { target_type: CampaignFormValues['target_type']; target_project?: number | null; target_customers?: number[] }) {
  return useQuery({
    queryKey: ['campaigns', 'preview', audience],
    queryFn: async () => {
      const { data } = await api.get<{ count: number }>('/admin/notifications/campaigns/preview-recipients/', {
        params: {
          target_type: audience.target_type,
          target_project: audience.target_project || undefined,
          target_customers: audience.target_customers?.length ? audience.target_customers.join(',') : undefined,
        },
      })
      return data
    },
    placeholderData: keepPreviousData,
  })
}

export interface CampaignFormValues {
  title: string
  body: string
  target_type: 'ALL' | 'PROJECT' | 'SELECTED'
  target_project?: number | null
  target_customers?: number[]
  channel: 'PUSH' | 'EMAIL' | 'BOTH'
}

export function useCreateCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: CampaignFormValues) => {
      const { data } = await api.post<NotificationCampaign>('/admin/notifications/campaigns/', values)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  })
}

/** Drafts only — the backend refuses edits to sent campaigns. */
export function useUpdateCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id: number; values: CampaignFormValues }) => {
      const { data } = await api.patch<NotificationCampaign>(`/admin/notifications/campaigns/${id}/`, values)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  })
}

export function useDeleteCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/notifications/campaigns/${id}/`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  })
}

export function useSendCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<NotificationCampaign>(`/admin/notifications/campaigns/${id}/send/`)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      qc.invalidateQueries({ queryKey: ['campaigns-delivery-log'] })
    },
  })
}
