'use client'

import { Download, ExternalLink } from 'lucide-react'
import { absoluteMediaUrl } from '@/lib/format'
import { downloadMedia } from '@/lib/download'

/** View + download icon buttons for a media file (e.g. a generated receipt PDF). */
export function FileActions({ path, filename, label = 'file' }: { path: string; filename?: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <a
        href={absoluteMediaUrl(path) ?? undefined}
        target="_blank"
        rel="noreferrer"
        className="text-ink-400 hover:text-ink-700"
        aria-label={`View ${label}`}
        title={`View ${label}`}
      >
        <ExternalLink className="size-4" />
      </a>
      <button
        type="button"
        onClick={() => downloadMedia(path, filename)}
        className="text-ink-400 hover:text-ink-700"
        aria-label={`Download ${label}`}
        title={`Download ${label}`}
      >
        <Download className="size-4" />
      </button>
    </span>
  )
}
