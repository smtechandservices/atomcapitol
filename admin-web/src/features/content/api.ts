import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Banner, NotificationCampaign, Paginated } from '@/types'

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

export function useUpdateBanner(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: Partial<Pick<BannerFormValues, 'is_active' | 'display_order' | 'title' | 'link_target'>>) => {
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
export function useCampaigns(filters: { page?: number; status?: string } = {}) {
  return useQuery({
    queryKey: ['campaigns', filters],
    queryFn: async () => {
      const { data } = await api.get<Paginated<NotificationCampaign>>('/admin/notifications/campaigns/', { params: filters })
      return data
    },
  })
}

export function useDeliveryLog() {
  return useQuery({
    queryKey: ['campaigns-delivery-log'],
    queryFn: async () => {
      const { data } = await api.get<NotificationCampaign[]>('/admin/notifications/campaigns/delivery-log/')
      return data
    },
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

export function useScheduleCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, scheduled_at }: { id: number; scheduled_at: string }) => {
      const { data } = await api.post<NotificationCampaign>(`/admin/notifications/campaigns/${id}/schedule/`, { scheduled_at })
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  })
}
