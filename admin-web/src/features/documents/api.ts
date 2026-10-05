import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { DocumentItem, Paginated } from '@/types'

export interface DocumentFilters {
  page?: number
  search?: string
  doc_type?: string
  status?: string
  customer?: number | string
  project?: number | string
}

export function useDocuments(filters: DocumentFilters) {
  return useQuery({
    queryKey: ['documents', filters],
    queryFn: async () => {
      const { data } = await api.get<Paginated<DocumentItem>>('/admin/documents/', { params: filters })
      return data
    },
  })
}

export interface DocumentCreateValues {
  customer?: number
  project?: number
  name: string
  doc_type: string
  status?: string
  file?: File
  is_visible_to_customer?: boolean
}

export function useCreateDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: DocumentCreateValues) => {
      const form = new FormData()
      if (values.customer) form.append('customer', String(values.customer))
      if (values.project) form.append('project', String(values.project))
      form.append('name', values.name)
      form.append('doc_type', values.doc_type)
      form.append('status', values.status ?? 'IN_PROGRESS')
      form.append('is_visible_to_customer', String(values.is_visible_to_customer ?? true))
      if (values.file) form.append('file', values.file)
      const { data } = await api.post<DocumentItem>('/admin/documents/', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  })
}

export function useDeleteDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/documents/${id}/`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  })
}
