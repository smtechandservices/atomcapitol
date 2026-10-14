'use client'

import { useRef, useState, type DragEvent } from 'react'
import clsx from 'clsx'
import { FileText, UploadCloud, X } from 'lucide-react'

/** Drag-and-drop / click-to-pick for a single file, showing the chosen file with a remove button. */
export function FileDropzone({
  file,
  onChange,
  accept,
  hint,
  compact,
}: {
  file: File | null
  onChange: (file: File | null) => void
  accept?: string
  hint?: string
  compact?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) onChange(dropped)
  }

  return (
    <div>
      {file ? (
        <div className="flex items-center gap-3 rounded-lg border border-ink-200 p-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gold-50 text-gold-700">
            <FileText className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink-800">{file.name}</p>
            <p className="text-xs text-ink-400">{file.size >= 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${(file.size / 1024).toFixed(0)} KB`}</p>
          </div>
          <button type="button" onClick={() => onChange(null)} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label="Remove file">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={clsx(
            'flex w-full flex-col items-center gap-1.5 rounded-lg border-2 border-dashed px-4 text-center transition-colors',
            compact ? 'py-5' : 'py-8',
            dragOver ? 'border-gold-400 bg-gold-50 text-gold-700' : 'border-ink-200 text-ink-400 hover:border-gold-400 hover:bg-gold-50/50 hover:text-gold-700',
          )}
        >
          <UploadCloud className="size-6" />
          <span className="text-sm font-medium">Drop a file here or click to browse</span>
          {hint && <span className="text-xs text-ink-400">{hint}</span>}
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          onChange(e.target.files?.[0] ?? null)
          e.target.value = ''
        }}
      />
    </div>
  )
}
