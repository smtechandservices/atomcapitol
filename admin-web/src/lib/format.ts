export function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (Number.isNaN(num)) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num)
}

/** Short INR for headline numbers: ₹7.75 Cr, ₹26.2 L, ₹4,500. */
export function formatCurrencyCompact(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (Number.isNaN(num)) return '—'
  if (Math.abs(num) >= 1e7) return `₹${(num / 1e7).toFixed(2).replace(/\.?0+$/, '')} Cr`
  if (Math.abs(num) >= 1e5) return `₹${(num / 1e5).toFixed(1).replace(/\.0$/, '')} L`
  return formatCurrency(num)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function fileName(url: string | null | undefined): string {
  if (!url) return ''
  try {
    return decodeURIComponent(url.split('/').pop() ?? url)
  } catch {
    return url
  }
}

export function absoluteMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (path.startsWith('http')) return path
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000/api').replace(/\/api\/?$/, '')
  return `${base}${path}`
}

/** Compact elapsed time since `value`: "12m", "5h", "3d", "2mo". */
export function formatAge(value: string | null | undefined, now: number = Date.now()): string {
  if (!value) return '—'
  const ms = now - new Date(value).getTime()
  if (Number.isNaN(ms)) return '—'
  const mins = Math.max(0, Math.floor(ms / 60_000))
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 60) return `${days}d`
  return `${Math.floor(days / 30)}mo`
}
