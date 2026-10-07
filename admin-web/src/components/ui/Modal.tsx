import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import clsx from 'clsx'

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  if (!open) return null
  const sizeClass = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size]

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink-900/50 backdrop-blur-sm">
      {/* min-h-full + items-center centers short modals; tall ones grow past it and scroll without clipping the top */}
      <div className="flex min-h-full items-center justify-center px-4 py-8">
        <div className={clsx('w-full rounded-xl bg-white shadow-xl', sizeClass)}>
          <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
            <h3 className="text-sm font-semibold text-ink-800">{title}</h3>
            <button onClick={onClose} className="rounded-lg p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700">
              <X className="size-4" />
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-ink-100 px-5 py-4">{footer}</div>}
        </div>
      </div>
    </div>
  )
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink-900/50 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
          <h3 className="text-base font-semibold text-ink-800">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-ink-100 px-6 py-4">{footer}</div>}
      </div>
    </div>
  )
}
