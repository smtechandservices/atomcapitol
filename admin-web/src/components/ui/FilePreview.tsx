import type { ReactNode } from 'react'
import { ExternalLink, FileText } from 'lucide-react'

/** Inline preview for an uploaded PDF or image, with an "open in new tab" link. */
export function FilePreview({ url, title, emptyText = 'No file uploaded yet', height = 520 }: { url: string | null; title: string; emptyText?: string; height?: number }) {
  if (!url) return <FilePlaceholder icon={<FileText className="size-6" />} text={emptyText} />
  const isPdf = /\.pdf($|\?)/i.test(url)
  return (
    <div className="space-y-2">
      {isPdf ? (
        // <object> rather than <iframe>: Chrome shows an iframe's title as a hover tooltip that can linger over the page.
        <object data={`${url}#view=FitH`} type="application/pdf" aria-label={title} style={{ height }} className="w-full rounded-lg border border-ink-100 bg-ink-50">
          <a href={url} target="_blank" rel="noreferrer" className="block p-4 text-sm text-gold-700 underline">
            Open {title.toLowerCase()}
          </a>
        </object>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- dynamic Django media host, not a next/image candidate
        <img src={url} alt={title} style={{ maxHeight: height }} className="w-full rounded-lg border border-ink-100 bg-ink-50 object-contain" />
      )}
      <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-800">
        Open in new tab <ExternalLink className="size-3" />
      </a>
    </div>
  )
}

export function FilePlaceholder({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ink-200 text-ink-400">
      {icon}
      <p className="text-sm">{text}</p>
    </div>
  )
}
