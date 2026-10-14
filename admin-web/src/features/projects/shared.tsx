'use client'

import { useState, type KeyboardEvent } from 'react'
import clsx from 'clsx'
import { Building2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, FieldWrap, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { absoluteMediaUrl } from '@/lib/format'
import type { Project, ProjectDevelopmentStatus } from '@/types'
import type { ProjectFormValues } from './api'

export const DEV_STATUSES: { value: ProjectDevelopmentStatus; label: string; dot: string }[] = [
  { value: 'PLANNING', label: 'Planning', dot: 'bg-sky-500' },
  { value: 'UNDER_CONSTRUCTION', label: 'Under construction', dot: 'bg-amber-500' },
  { value: 'READY', label: 'Ready', dot: 'bg-gold-500' },
  { value: 'COMPLETED', label: 'Completed', dot: 'bg-emerald-500' },
]

export function devStatusMeta(status: string) {
  return DEV_STATUSES.find((s) => s.value === status) ?? DEV_STATUSES[0]
}

/** Cover = first gallery image, falling back to any image. */
export function coverImageUrl(project: Project): string | null {
  const img = project.images.find((i) => i.image_type === 'GALLERY') ?? project.images[0]
  return img ? absoluteMediaUrl(img.image) : null
}

export function DevStatusPill({ status, className }: { status: string; className?: string }) {
  const meta = devStatusMeta(status)
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-semibold text-ink-700 shadow-sm ring-1 ring-ink-100 backdrop-blur',
        className,
      )}
    >
      <span className={clsx('size-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

export function PublishPill({ published, className }: { published: boolean; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold shadow-sm',
        published ? 'bg-emerald-500 text-white' : 'bg-ink-800/80 text-ink-50',
        className,
      )}
    >
      <span className={clsx('size-1.5 rounded-full', published ? 'bg-white' : 'bg-ink-300')} />
      {published ? 'Live' : 'Draft'}
    </span>
  )
}

/** Gradient placeholder used where a project has no images yet. */
export function CoverPlaceholder({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
  return (
    <div
      className={clsx(
        'relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-ink-700 via-ink-800 to-ink-900',
        className,
      )}
    >
      <div className="absolute -right-10 -top-10 size-40 rounded-full bg-gold-500/15 blur-2xl" />
      <div className="absolute -bottom-12 -left-8 size-36 rounded-full bg-gold-300/10 blur-2xl" />
      {initials ? (
        <span className="relative text-3xl font-semibold tracking-wider text-gold-300/80">{initials}</span>
      ) : (
        <Building2 className="relative size-10 text-gold-300/70" />
      )}
    </div>
  )
}

/** Chip input for amenities: Enter or comma adds, Backspace on empty removes last. */
export function AmenitiesInput({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState('')

  const commit = (raw: string) => {
    const items = raw.split(',').map((a) => a.trim()).filter(Boolean)
    if (!items.length) return
    onChange([...value, ...items.filter((i) => !value.some((v) => v.toLowerCase() === i.toLowerCase()))])
    setDraft('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit(draft)
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2 py-1.5 focus-within:border-gold-500 focus-within:ring-2 focus-within:ring-gold-100">
      {value.map((a) => (
        <span key={a} className="inline-flex items-center gap-1 rounded-full bg-gold-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-gold-800 ring-1 ring-gold-200">
          {a}
          <button
            type="button"
            onClick={() => onChange(value.filter((v) => v !== a))}
            className="rounded-full p-0.5 text-gold-700 hover:bg-gold-200"
            aria-label={`Remove ${a}`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => commit(draft)}
        placeholder={value.length ? 'Add another…' : 'e.g. Clubhouse, 24x7 security'}
        className="min-w-[140px] flex-1 border-0 bg-transparent px-1 py-0.5 text-sm text-ink-800 placeholder:text-ink-300 focus:outline-none"
      />
    </div>
  )
}

export const emptyProjectForm: ProjectFormValues = {
  name: '',
  location: '',
  description: '',
  development_status: 'PLANNING',
  latitude: '',
  longitude: '',
  amenities: [],
}

export function projectToForm(p: Project): ProjectFormValues {
  return {
    name: p.name,
    location: p.location,
    description: p.description,
    development_status: p.development_status,
    latitude: p.latitude ?? '',
    longitude: p.longitude ?? '',
    amenities: p.amenities,
  }
}

/** Blank coordinate strings must go to the API as null, not "". */
export function formToPayload(values: ProjectFormValues) {
  return {
    ...values,
    latitude: values.latitude?.trim() || null,
    longitude: values.longitude?.trim() || null,
  }
}

export function ProjectFormModal({
  open,
  title,
  submitLabel,
  initial,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean
  title: string
  submitLabel: string
  initial: ProjectFormValues
  loading?: boolean
  onClose: () => void
  onSubmit: (values: ProjectFormValues) => void
}) {
  const [form, setForm] = useState<ProjectFormValues>(initial)
  const [openedWith, setOpenedWith] = useState(initial)
  // Reset the form whenever the modal is re-opened with fresh initial values.
  if (openedWith !== initial) {
    setOpenedWith(initial)
    setForm(initial)
  }
  const set = <K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) => setForm((f) => ({ ...f, [key]: value }))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" loading={loading} onClick={() => onSubmit(form)} disabled={!form.name.trim()}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <section className="space-y-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Basics</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FieldWrap label="Project name" required>
              <Input autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Atom Greens Phase II" />
            </FieldWrap>
            <FieldWrap label="Location">
              <Input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="City, area" />
            </FieldWrap>
          </div>
          <FieldWrap label="Description" hint="Shown to customers on the project page in the app.">
            <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} />
          </FieldWrap>
        </section>

        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Development status</h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DEV_STATUSES.map((s) => {
              const active = form.development_status === s.value
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => set('development_status', s.value)}
                  className={clsx(
                    'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition-colors',
                    active ? 'border-gold-500 bg-gold-50 text-ink-800 ring-2 ring-gold-100' : 'border-ink-200 text-ink-500 hover:border-ink-300 hover:bg-ink-50',
                  )}
                >
                  <span className={clsx('size-2 shrink-0 rounded-full', s.dot)} />
                  {s.label}
                </button>
              )
            })}
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Amenities</h4>
          <AmenitiesInput value={form.amenities} onChange={(v) => set('amenities', v)} />
          <p className="text-xs text-ink-400">Press Enter or comma to add.</p>
        </section>

        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Map coordinates</h4>
          <div className="grid grid-cols-2 gap-4">
            <FieldWrap label="Latitude">
              <Input inputMode="decimal" value={form.latitude ?? ''} onChange={(e) => set('latitude', e.target.value)} placeholder="12.971599" />
            </FieldWrap>
            <FieldWrap label="Longitude">
              <Input inputMode="decimal" value={form.longitude ?? ''} onChange={(e) => set('longitude', e.target.value)} placeholder="77.594566" />
            </FieldWrap>
          </div>
        </section>
      </div>
    </Modal>
  )
}

/** Horizontal tracker across the four development phases. */
export function DevStatusStepper({ status }: { status: string }) {
  const current = Math.max(0, DEV_STATUSES.findIndex((s) => s.value === status))
  return (
    <ol className="flex items-center">
      {DEV_STATUSES.map((s, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={s.value} className={clsx('flex items-center', i < DEV_STATUSES.length - 1 && 'flex-1')}>
            <div className="flex items-center gap-2">
              <span
                className={clsx(
                  'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                  done && 'bg-gold-500 text-ink-900',
                  active && 'bg-ink-800 text-gold-300 ring-4 ring-gold-100',
                  !done && !active && 'bg-ink-100 text-ink-400',
                )}
              >
                {i + 1}
              </span>
              <span className={clsx('whitespace-nowrap text-xs font-medium', active ? 'text-ink-800' : done ? 'text-ink-600' : 'text-ink-300')}>
                {s.label}
              </span>
            </div>
            {i < DEV_STATUSES.length - 1 && <span className={clsx('mx-3 h-0.5 flex-1 rounded-full', i < current ? 'bg-gold-400' : 'bg-ink-100')} />}
          </li>
        )
      })}
    </ol>
  )
}
