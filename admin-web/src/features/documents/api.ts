import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { DocumentItem, DocumentStats, Paginated } from '@/types'

/**
 * Save a document's file. Goes through the authenticated download endpoint because browsers ignore
 * <a download> for cross-origin media URLs (and would just open the PDF instead).
 */
export async function downloadDocument(id: number, fallbackName = 'document.pdf') {
  const res = await api.get<Blob>(`/admin/documents/${id}/download/`, { responseType: 'blob' })
  const match = /filename="?([^";]+)"?/i.exec(res.headers['content-disposition'] ?? '')
  const href = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = href
  a.download = match?.[1] ?? fallbackName
  a.click()
  URL.revokeObjectURL(href)
}

export interface DocumentFilters {
  page?: number
  search?: string
  doc_type?: string
  status?: string
  customer?: number | string
  project?: number | string
  is_visible_to_customer?: string
}

export function useDocumentStats(project?: string) {
  return useQuery({
    queryKey: ['documents', 'stats', project ?? 'all'],
    queryFn: async () => {
      const { data } = await api.get<DocumentStats>('/admin/documents/stats/', { params: { project: project || undefined } })
      return data
    },
  })
}

export function useDocuments(filters: DocumentFilters, enabled = true) {
  return useQuery({
    enabled,
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

/** PATCH a document — multipart when replacing the file, JSON otherwise. */
export function useUpdateDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id: number; values: Partial<Omit<DocumentCreateValues, 'file'>> & { file?: File } }) => {
      if (values.file) {
        const form = new FormData()
        Object.entries(values).forEach(([k, v]) => v !== undefined && form.append(k, v instanceof File ? v : String(v)))
        const { data } = await api.patch<DocumentItem>(`/admin/documents/${id}/`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
        return data
      }
      const { data } = await api.patch<DocumentItem>(`/admin/documents/${id}/`, values)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  })
}
