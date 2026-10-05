'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'

type ToastKind = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

interface ToastContextValue {
  push: (kind: ToastKind, message: string) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

let idSeq = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = idSeq++
    setItems((prev) => [...prev, { id, kind, message }])
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id))
    }, 4500)
  }, [])

  const value: ToastContextValue = {
    push,
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={clsx(
              'flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm shadow-lg',
              item.kind === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-800',
              item.kind === 'error' && 'border-red-200 bg-red-50 text-red-800',
              item.kind === 'info' && 'border-sky-200 bg-sky-50 text-sky-800',
            )}
          >
            {item.kind === 'success' && <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}
            {item.kind === 'error' && <XCircle className="mt-0.5 size-4 shrink-0" />}
            {item.kind === 'info' && <Info className="mt-0.5 size-4 shrink-0" />}
            <span className="flex-1">{item.message}</span>
            <button onClick={() => setItems((prev) => prev.filter((t) => t.id !== item.id))}>
              <X className="size-3.5 opacity-60 hover:opacity-100" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
