import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Paginated, Project, ProjectImage } from '@/types'

export interface ProjectFilters {
  page?: number
  search?: string
  development_status?: string
  is_published?: string
}

export function useProjects(filters: ProjectFilters) {
  return useQuery({
    queryKey: ['projects', filters],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Project>>('/admin/projects/', { params: filters })
      return data
    },
  })
}

/** Fetches every project across all pages — for use in <select> dropdowns elsewhere. */
export function useAllProjects(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['projects-all'],
    queryFn: async () => {
      const all: Project[] = []
      let url: string | null = '/admin/projects/'
      let params: Record<string, unknown> | undefined = { page: 1 }
      while (url) {
        const { data }: { data: Paginated<Project> } = await api.get(url, { params })
        all.push(...data.results)
        url = data.next
        params = undefined
      }
      return all
    },
    staleTime: 60_000,
  })
}

export function useProject(id: number | string | undefined) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const { data } = await api.get<Project>(`/admin/projects/${id}/`)
      return data
    },
    enabled: !!id,
  })
}

export interface ProjectFormValues {
  name: string
  location: string
  description: string
  development_status: string
  latitude?: string | null
  longitude?: string | null
  amenities: string[]
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: ProjectFormValues) => {
      const { data } = await api.post<Project>('/admin/projects/', values)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['projects-all'] })
    },
  })
}

export function useUpdateProject(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: Partial<ProjectFormValues>) => {
      const { data } = await api.patch<Project>(`/admin/projects/${id}/`, values)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['projects-all'] })
      qc.invalidateQueries({ queryKey: ['project', String(id)] })
    },
  })
}

export function useTogglePublish(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (publish: boolean) => {
      const { data } = await api.post<Project>(`/admin/projects/${id}/${publish ? 'publish' : 'unpublish'}/`)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['projects-all'] })
      qc.invalidateQueries({ queryKey: ['project', String(id)] })
    },
  })
}

export function useUploadBrochure(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('brochure', file)
      const { data } = await api.patch<Project>(`/admin/projects/${id}/`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', String(id)] }),
  })
}

export function useAddProjectImage(projectId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      image,
      image_type,
      caption,
    }: {
      image: File
      image_type: 'LAYOUT' | 'GALLERY'
      caption?: string
    }) => {
      const form = new FormData()
      form.append('image', image)
      form.append('image_type', image_type)
      if (caption) form.append('caption', caption)
      const { data } = await api.post<ProjectImage>(`/admin/projects/${projectId}/images/`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', String(projectId)] }),
  })
}

export function useDeleteProjectImage(projectId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (imageId: number) => {
      await api.delete(`/admin/projects/${projectId}/images/${imageId}/`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', String(projectId)] }),
  })
}

export interface ProjectDeleteSummary {
  can_delete: boolean
  blocked_plots: { plot_id: number; plot_number: string; reasons: string[] }[]
  blocked_count: number
  will_delete: { plots: number; milestones: number; documents: number; images: number }
}

export function useProjectDeleteCheck(id: number, enabled: boolean) {
  return useQuery({
    queryKey: ['project', String(id), 'delete-check'],
    queryFn: async () => (await api.get<ProjectDeleteSummary>(`/admin/projects/${id}/delete-check/`)).data,
    enabled,
    staleTime: 0,
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/projects/${id}/`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['projects-all'] })
      qc.invalidateQueries({ queryKey: ['plots'] })
    },
  })
}
