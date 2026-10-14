import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import clsx from 'clsx'

const baseFieldClass =
  'w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 placeholder:text-ink-300 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-100 disabled:bg-ink-50 disabled:text-ink-400'

export function FieldWrap({
  label,
  hint,
  error,
  required,
  children,
}: {
  label?: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1 block text-xs font-medium text-ink-600">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </span>
      )}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...rest }, ref) => (
  <input ref={ref} className={clsx(baseFieldClass, className)} {...rest} />
))
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...rest }, ref) => <textarea ref={ref} className={clsx(baseFieldClass, 'min-h-24 resize-y', className)} {...rest} />,
)
Textarea.displayName = 'Textarea'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...rest }, ref) => (
  <select ref={ref} className={clsx(baseFieldClass, className)} {...rest}>
    {children}
  </select>
))
Select.displayName = 'Select'

export function FileInput({
  file,
  onChange,
  accept,
}: {
  file: File | null
  onChange: (file: File | null) => void
  accept?: string
}) {
  return (
    <span className={clsx(baseFieldClass, 'flex cursor-pointer items-center gap-3')}>
      <span className="shrink-0 rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700">
        Choose file
      </span>
      <span className={clsx('truncate', file ? 'text-ink-800' : 'text-ink-300')}>{file ? file.name : 'No file selected'}</span>
      <input
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          onChange(e.target.files?.[0] ?? null)
          // Reset so picking the same file again still fires onChange
          e.target.value = ''
        }}
      />
    </span>
  )
}
