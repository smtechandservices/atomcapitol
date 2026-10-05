'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, FieldWrap } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { absoluteMediaUrl, formatDate } from '@/lib/format'
import type { Banner } from '@/types'
import { useBanners, useCreateBanner, useDeleteBanner, useUpdateBanner, type BannerFormValues } from './api'

const emptyForm: BannerFormValues = { title: '', link_target: '', display_order: 0 }

export function BannersPage() {
  const { data, isLoading, error } = useBanners()
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Banner | null>(null)
  const [form, setForm] = useState<BannerFormValues>(emptyForm)
  const [file, setFile] = useState<File | null>(null)

  const toast = useToast()
  const createBanner = useCreateBanner()
  const deleteBanner = useDeleteBanner()

  const submit = async () => {
    if (!file) return
    try {
      await createBanner.mutateAsync({ ...form, image: file })
      toast.success('Banner created — customers notified')
      setCreateOpen(false)
      setForm(emptyForm)
      setFile(null)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <div>
      <PageHeader
        title="Banners"
        subtitle="Dashboard carousel shown to customers"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> New banner
          </Button>
        }
      />

      {isLoading && <FullPageSpinner />}
      {!isLoading && error && <ErrorState message={apiErrorMessage(error)} />}
      {!isLoading && !error && (data?.results.length ?? 0) === 0 && (
        <Card>
          <EmptyState title="No banners yet" />
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.results.map((banner) => (
          <BannerCard key={banner.id} banner={banner} onDelete={() => setDeleteTarget(banner)} />
        ))}
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New banner"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="secondary" loading={createBanner.isPending} onClick={submit} disabled={!form.title || !file}>
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FieldWrap label="Title" required>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </FieldWrap>
          <FieldWrap label="Image" required>
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block text-sm" />
          </FieldWrap>
          <FieldWrap label="Link target" hint="e.g. project:12 or a screen name">
            <Input value={form.link_target} onChange={(e) => setForm({ ...form, link_target: e.target.value })} />
          </FieldWrap>
          <div className="grid grid-cols-3 gap-3">
            <FieldWrap label="Display order">
              <Input type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) })} />
            </FieldWrap>
            <FieldWrap label="Start date">
              <Input type="date" value={form.start_date ?? ''} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </FieldWrap>
            <FieldWrap label="End date">
              <Input type="date" value={form.end_date ?? ''} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </FieldWrap>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete banner"
        message={`Remove "${deleteTarget?.title}" from the customer app?`}
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

function BannerCard({ banner, onDelete }: { banner: Banner; onDelete: () => void }) {
  const toast = useToast()
  const updateBanner = useUpdateBanner(banner.id)

  return (
    <Card className="overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={absoluteMediaUrl(banner.image) ?? undefined} alt={banner.title} className="h-36 w-full object-cover" />
      <CardBody>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium text-ink-800">{banner.title}</p>
            <p className="text-xs text-ink-400">Order {banner.display_order}</p>
          </div>
          <button onClick={onDelete} className="text-ink-300 hover:text-red-600">
            <Trash2 className="size-4" />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <Badge tone={banner.is_active ? 'success' : 'neutral'}>{banner.is_active ? 'Active' : 'Inactive'}</Badge>
          <button
            className="text-xs text-gold-700 underline"
            onClick={async () => {
              try {
                await updateBanner.mutateAsync({ is_active: !banner.is_active })
              } catch (err) {
                toast.error(apiErrorMessage(err))
              }
            }}
          >
            {banner.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
        {(banner.start_date || banner.end_date) && (
          <p className="mt-1 text-xs text-ink-400">
            {formatDate(banner.start_date)} – {formatDate(banner.end_date)}
          </p>
        )}
      </CardBody>
    </Card>
  )
}
