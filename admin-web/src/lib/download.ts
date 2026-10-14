import { api } from './api'
import { absoluteMediaUrl } from './format'

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Downloads a media file. The `download` attribute is ignored cross-origin, so fetch it as a blob;
 * if the storage host blocks that (CORS), fall back to opening it in a new tab. */
export async function downloadMedia(path: string, filename?: string) {
  const url = absoluteMediaUrl(path)
  if (!url) return
  const name = filename ?? decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? 'download')
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(String(res.status))
    saveBlob(await res.blob(), name)
  } catch {
    window.open(url, '_blank', 'noopener')
  }
}

/** Downloads a file from an authenticated API endpoint. */
export async function downloadFromApi(path: string, filename: string) {
  const { data } = await api.get<Blob>(path, { responseType: 'blob' })
  saveBlob(data, filename)
}
