'use client'

import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { CalendarRange, ImageIcon, Link2, Pencil, Plus, Power, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, FieldWrap } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FileDropzone } from '@/components/ui/FileDropzone'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { absoluteMediaUrl, formatDate } from '@/lib/format'
import type { Banner } from '@/types'
import { useBanners, useCreateBanner, useDeleteBanner, useUpdateBanner } from './api'

type Schedule = 'live' | 'scheduled' | 'ended' | 'inactive'

/** Mirrors Banner.is_currently_active() on the backend — what customers actually see today. */
function scheduleOf(b: Banner): Schedule {
  if (!b.is_active) return 'inactive'
  const today = new Date().toISOString().slice(0, 10)
  if (b.start_date && today < b.start_date) return 'scheduled'
  if (b.end_date && today > b.end_date) return 'ended'
  return 'live'
}

const SCHEDULE_META: Record<Schedule, { label: string; pill: string; dot: string }> = {
  live: { label: 'Live in app', pill: 'bg-emerald-500 text-white', dot: 'bg-white' },
  scheduled: { label: 'Scheduled', pill: 'bg-sky-500 text-white', dot: 'bg-white' },
  ended: { label: 'Ended', pill: 'bg-ink-800/80 text-ink-50', dot: 'bg-ink-300' },
  inactive: { label: 'Turned off', pill: 'bg-ink-800/80 text-ink-50', dot: 'bg-ink-300' },
}

interface FormState {
  title: string
  link_target: string
  display_order: number
  start_date: string
  end_date: string
  is_active: boolean
}

const emptyForm: FormState = { title: '', link_target: '', display_order: 0, start_date: '', end_date: '', is_active: true }

export function BannersPage() {
  const { data, isLoading, error } = useBanners()
  const [editing, setEditing] = useState<Banner | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Banner | null>(null)
  const toast = useToast()
  const deleteBanner = useDeleteBanner()

  const banners = data?.results ?? []
  const liveCount = banners.filter((b) => scheduleOf(b) === 'live').length
  const nextOrder = banners.reduce((m, b) => Math.max(m, b.display_order), -1) + 1

  return (
    <div className="space-y-5">
      <PageHeader
        title="Banners"
        subtitle={
          banners.length
            ? `Dashboard carousel in the customer app · ${liveCount} of ${banners.length} live right now`
            : 'Dashboard carousel shown to customers in the app'
        }
        actions={
          <Button variant="secondary" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> New banner
          </Button>
        }
      />

      {isLoading ? (
        <FullPageSpinner />
      ) : error ? (
        <ErrorState message={apiErrorMessage(error)} />
      ) : banners.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ImageIcon className="size-6" />}
            title="No banners yet"
            subtitle="Add a banner to show it on every customer's dashboard."
            action={
              <Button variant="secondary" size="sm" className="mt-2" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" /> New banner
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {banners.map((banner) => (
            <BannerCard key={banner.id} banner={banner} onEdit={() => setEditing(banner)} onDelete={() => setDeleteTarget(banner)} />
          ))}
        </div>
      )}

      {createOpen && <BannerFormModal defaults={{ ...emptyForm, display_order: Math.max(0, nextOrder) }} onClose={() => setCreateOpen(false)} />}
      {editing && <BannerFormModal banner={editing} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete banner"
        message={`Remove "${deleteTarget?.title}" from the customer app? This can't be undone — turn it off instead to keep it for later.`}
        confirmLabel="Delete"
        danger
        loading={deleteBanner.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return
          try {
            await deleteBanner.mutateAsync(deleteTarget.id)
            toast.success('Banner deleted')
            setDeleteTarget(null)
          } catch (err) {
            toast.error(apiErrorMessage(err))
          }
        }}
      />
    </div>
  )
}

function BannerCard({ banner, onEdit, onDelete }: { banner: Banner; onEdit: () => void; onDelete: () => void }) {
  const toast = useToast()
  const update = useUpdateBanner()
  const schedule = scheduleOf(banner)
  const meta = SCHEDULE_META[schedule]

  const toggle = async () => {
    try {
      await update.mutateAsync({ id: banner.id, values: { is_active: !banner.is_active } })
      toast.success(banner.is_active ? 'Banner turned off' : 'Banner turned on')
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <Card className="group flex flex-col overflow-hidden">
      <div className="relative aspect-[2/1] overflow-hidden bg-ink-100">
        {/* eslint-disable-next-line @next/next/no-img-element -- dynamic Django media host, not a next/image candidate */}
        <img
          src={absoluteMediaUrl(banner.image) ?? undefined}
          alt={banner.title}
          className={clsx('size-full object-cover transition-all', schedule !== 'live' && 'opacity-70 grayscale-[40%]')}
        />
        <span className={clsx('absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold shadow-sm', meta.pill)}>
          <span className={clsx('size-1.5 rounded-full', meta.dot)} />
          {meta.label}
        </span>
        <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold text-ink-700 shadow-sm" title="Display order">
          #{banner.display_order}
        </span>
        <button
          onClick={onEdit}
          className="absolute inset-0 flex items-center justify-center bg-ink-900/0 opacity-0 transition-all group-hover:bg-ink-900/30 group-hover:opacity-100"
          aria-label={`Edit ${banner.title}`}
        >
          <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink-800 shadow">
            <Pencil className="size-3.5" /> Edit
          </span>
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink-800">{banner.title}</p>
          <div className="mt-1 space-y-0.5 text-xs text-ink-400">
            <p className="flex items-center gap-1.5 truncate">
              <Link2 className="size-3.5 shrink-0" />
              {banner.link_target ? <span className="truncate font-mono text-ink-500">{banner.link_target}</span> : 'No link'}
            </p>
            <p className="flex items-center gap-1.5">
              <CalendarRange className="size-3.5 shrink-0" />
              {banner.start_date || banner.end_date ? `${banner.start_date ? formatDate(banner.start_date) : 'Now'} – ${banner.end_date ? formatDate(banner.end_date) : 'No end date'}` : 'Always on'}
            </p>
          </div>
        </div>

        <div className="mt-auto flex items-center gap-2 border-t border-ink-100 pt-3">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="size-3.5" /> Edit
          </Button>
          <Button size="sm" variant="ghost" loading={update.isPending} onClick={toggle}>
            <Power className="size-3.5" /> {banner.is_active ? 'Turn off' : 'Turn on'}
          </Button>
          <button onClick={onDelete} className="ml-auto rounded-lg p-1.5 text-ink-300 hover:bg-red-50 hover:text-red-600" aria-label="Delete banner">
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </Card>
  )
}

/** Create (no `banner`) or edit (with `banner`). Editing keeps the current image unless a new one is dropped in. */
function BannerFormModal({ banner, defaults = emptyForm, onClose }: { banner?: Banner; defaults?: FormState; onClose: () => void }) {
  const toast = useToast()
  const create = useCreateBanner()
  const update = useUpdateBanner()
  const [form, setForm] = useState<FormState>(
    banner
      ? {
          title: banner.title,
          link_target: banner.link_target ?? '',
          display_order: banner.display_order,
          start_date: banner.start_date ?? '',
          end_date: banner.end_date ?? '',
          is_active: banner.is_active,
        }
      : defaults,
  )
  const [file, setFile] = useState<File | null>(null)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  // Preview the newly picked image, else the current one.
  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => void (fileUrl && URL.revokeObjectURL(fileUrl)), [fileUrl])
  const previewUrl = fileUrl ?? (banner ? absoluteMediaUrl(banner.image) : null)

  const datesInvalid = !!(form.start_date && form.end_date && form.end_date < form.start_date)
  const valid = form.title.trim() && (banner || file) && !datesInvalid
  const pending = create.isPending || update.isPending

  const submit = async () => {
    try {
      if (banner) {
        await update.mutateAsync({
          id: banner.id,
          values: {
            title: form.title.trim(),
            link_target: form.link_target.trim(),
            display_order: form.display_order,
            start_date: form.start_date || null,
            end_date: form.end_date || null,
            is_active: form.is_active,
            ...(file ? { image: file } : {}),
          },
        })
        toast.success('Banner updated')
      } else {
        await create.mutateAsync({
          title: form.title.trim(),
          link_target: form.link_target.trim(),
          display_order: form.display_order,
          start_date: form.start_date || undefined,
          end_date: form.end_date || undefined,
          is_active: form.is_active,
          image: file ?? undefined,
        })
        toast.success('Banner created — customers notified')
      }
      onClose()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={banner ? 'Edit banner' : 'New banner'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" loading={pending} onClick={submit} disabled={!valid}>
            {banner ? 'Save changes' : 'Create banner'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Preview, roughly as it sits in the app's dashboard carousel */}
        <div className="space-y-2">
          <div className="relative aspect-[2/1] overflow-hidden rounded-xl bg-ink-100 ring-1 ring-ink-100">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- local blob / dynamic media URL
              <img src={previewUrl} alt="" className="size-full object-cover" />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-1 text-ink-300">
                <ImageIcon className="size-8" />
                <span className="text-xs">Preview appears here</span>
              </div>
            )}
            {form.title && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-900/70 to-transparent px-4 pb-3 pt-8">
                <p className="truncate text-sm font-semibold text-white">{form.title}</p>
              </div>
            )}
          </div>
          <FileDropzone
            file={file}
            onChange={setFile}
            accept="image/*"
            hint={banner ? 'Drop a new image to replace the current one' : 'Wide image, about 2:1 (e.g. 1200 × 600)'}
            compact
          />
        </div>

        <FieldWrap label="Title" required>
          <Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Diwali offer — 2% off on full payment" />
        </FieldWrap>

        <div className="grid grid-cols-[1fr_120px] gap-3">
          {/* Free text read by the customer app (also sent as the new-banner notification's deep link). Values below are
              ones the backend already sends as deep links; the app decides what it supports. */}
          <FieldWrap label="Link target" hint="Optional — app screen opened on tap, e.g. projects, payments, home. Leave empty for no link.">
            <Input value={form.link_target} onChange={(e) => set('link_target', e.target.value)} placeholder="Optional" />
          </FieldWrap>
          <FieldWrap label="Order" hint="Lower shows first">
            <Input type="number" min={0} value={form.display_order} onChange={(e) => set('display_order', Math.max(0, Number(e.target.value)))} />
          </FieldWrap>
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <FieldWrap label="Show from" hint="Empty = immediately">
              <Input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
            </FieldWrap>
            <FieldWrap label="Show until" error={datesInvalid ? 'Must be on or after the start date' : undefined} hint="Empty = no end date">
              <Input type="date" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
            </FieldWrap>
          </div>
          {(form.start_date || form.end_date) && (
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, start_date: '', end_date: '' }))}
              className="text-xs font-medium text-ink-400 hover:text-ink-700"
            >
              Clear dates
            </button>
          )}
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-ink-200 px-3 py-2.5">
          <span>
            <span className="block text-sm font-medium text-ink-800">Turned on</span>
            <span className="block text-xs text-ink-400">Off hides it from the app regardless of dates.</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={form.is_active}
            onClick={() => set('is_active', !form.is_active)}
            className={clsx('relative h-5 w-9 shrink-0 rounded-full transition-colors', form.is_active ? 'bg-gold-500' : 'bg-ink-200')}
          >
            <span className={clsx('absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform', form.is_active ? 'translate-x-4.5' : 'translate-x-0.5')} />
          </button>
        </label>

        {banner && <p className="text-xs text-ink-400">Saving changes doesn&apos;t send customers another notification — only new banners do.</p>}
      </div>
    </Modal>
  )
}
