import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { tokenStore } from './tokens'

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000/api'

export const api = axios.create({
  baseURL: API_BASE_URL,
})

api.interceptors.request.use((config) => {
  const token = tokenStore.getAccess()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const refresh = tokenStore.getRefresh()
  if (!refresh) return null
  try {
    const { data } = await axios.post(`${API_BASE_URL}/auth/token/refresh/`, { refresh })
    tokenStore.setAccess(data.access)
    return data.access as string
  } catch {
    return null
  }
}

const AUTH_ROUTES = ['/admin/auth/login/', '/auth/token/refresh/']

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
    const url = original?.url || ''
    const isAuthRoute = AUTH_ROUTES.some((r) => url.includes(r))

    if (error.response?.status === 401 && original && !original._retry && !isAuthRoute) {
      original._retry = true
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null
        })
      }
      const newAccess = await refreshPromise
      if (newAccess) {
        original.headers = original.headers ?? {}
        original.headers.Authorization = `Bearer ${newAccess}`
        return api(original)
      }
      tokenStore.clear()
    }
    return Promise.reject(error)
  },
)

export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as unknown
    if (typeof data === 'string') return data
    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>
      const errors = obj.errors as Record<string, string[]> | undefined
      if (errors && Object.keys(errors).length > 0) {
        const firstKey = Object.keys(errors)[0]
        const messages = errors[firstKey]
        const text = Array.isArray(messages) ? messages.join(', ') : String(messages)
        return firstKey === 'non_field_errors' ? text : `${firstKey}: ${text}`
      }
      if (typeof obj.detail === 'string') return obj.detail
      if (typeof obj.message === 'string') return obj.message
    }
    if (err.message) return err.message
  }
  return fallback
}
