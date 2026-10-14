'use client'

import { useEffect, useRef, useState, type DragEvent } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import clsx from 'clsx'
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  ImagePlus,
  Images,
  LandPlot,
  MapPin,
  Maximize2,
  Pencil,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FullPageSpinner, Spinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { absoluteMediaUrl, fileName, formatCurrency, formatDate } from '@/lib/format'
import { usePlotStatusCounts, usePlots } from '@/features/plots/api'
import { useCan } from '@/lib/permissions'
import { DeleteProjectModal } from './DeleteProjectModal'
import type { ProjectImage, ProjectImageType } from '@/types'
import {
  useAddProjectImage,
  useDeleteProjectImage,
  useProject,
  useTogglePublish,
  useUpdateProject,
  useUploadBrochure,
  type ProjectFormValues,
} from './api'
import {
  CoverPlaceholder,
  DevStatusPill,
  DevStatusStepper,
  ProjectFormModal,
  PublishPill,
  coverImageUrl,
  formToPayload,
  projectToForm,
} from './shared'

const IMAGE_TABS: { value: ProjectImageType; label: string; hint: string }[] = [
  { value: 'GALLERY', label: 'Gallery', hint: 'Photos and renders of the township' },
  { value: 'LAYOUT', label: 'Layout plans', hint: 'Site and plot layout drawings' },
]

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const toast = useToast()
  const { data: project, isLoading, error } = useProject(id)
  const { data: plotStats, isLoading: statsLoading } = usePlotStatusCounts(id)
  const { data: plots } = usePlots({ project: id, page: 1 })
  const updateProject = useUpdateProject(Number(id))
  const togglePublish = useTogglePublish(Number(id))
  const canDelete = useCan()('projectDelete')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const uploadBrochure = useUploadBrochure(Number(id))
  const addImage = useAddProjectImage(Number(id))
  const deleteImage = useDeleteProjectImage(Number(id))

  const [editInitial, setEditInitial] = useState<ProjectFormValues | null>(null)
  const [confirmUnpublish, setConfirmUnpublish] = useState(false)
  const [imageTab, setImageTab] = useState<ProjectImageType>('GALLERY')
  const [pendingDelete, setPendingDelete] = useState<ProjectImage | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [uploadingCount, setUploadingCount] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const brochureInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)

  if (isLoading) return <FullPageSpinner />
  if (error || !project) return <ErrorState message={apiErrorMessage(error, 'Project not found')} />

  const cover = coverImageUrl(project)
  const tabImages = project.images.filter((i) => i.image_type === imageTab)
  const galleryCount = project.images.filter((i) => i.image_type === 'GALLERY').length
  const layoutCount = project.images.filter((i) => i.image_type === 'LAYOUT').length
  const hasCoords = !!(project.latitude && project.longitude)

  const checklist = [
    { label: 'Description written', done: !!project.description.trim() },
    { label: 'Location set', done: !!project.location.trim() },
    { label: 'Gallery images', done: galleryCount > 0 },
    { label: 'Layout plan', done: layoutCount > 0 },
    { label: 'Brochure uploaded', done: !!project.brochure },
    { label: 'Plots added', done: project.plot_count > 0 },
  ]
  const readiness = checklist.filter((c) => c.done).length

  const saveEdit = async (values: ProjectFormValues) => {
    try {
      await updateProject.mutateAsync(formToPayload(values))
      toast.success('Project updated')
      setEditInitial(null)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const setPublished = async (publish: boolean) => {
    try {
      await togglePublish.mutateAsync(publish)
      toast.success(publish ? 'Project is now live in the app' : 'Project unpublished')
      setConfirmUnpublish(false)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const uploadImages = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (!images.length) return
    setUploadingCount(images.length)
    let ok = 0
    for (const file of images) {
      try {
        await addImage.mutateAsync({ image: file, image_type: imageTab })
        ok += 1
      } catch (err) {
        toast.error(`${file.name}: ${apiErrorMessage(err)}`)
      }
      setUploadingCount((n) => n - 1)
    }
    if (ok) toast.success(ok === 1 ? 'Image added' : `${ok} images added`)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    uploadImages(Array.from(e.dataTransfer.files))
  }

  const removeImage = async () => {
    if (!pendingDelete) return
    try {
      await deleteImage.mutateAsync(pendingDelete.id)
      toast.success('Image removed')
      setPendingDelete(null)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const stat = (n: number | undefined) => (statsLoading ? '…' : (n ?? 0))
  const pct = (n: number) => (plotStats?.total ? (n / plotStats.total) * 100 : 0)

  return (
    <div className="space-y-5">
      <Link href="/projects" className="inline-flex items-center gap-1 text-sm text-ink-400 transition-colors hover:text-ink-700">
        <ArrowLeft className="size-4" /> All projects
      </Link>

      {/* Hero */}
      <Card className="overflow-hidden">
        <div className="relative h-56 sm:h-64">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- dynamic Django media host, not a next/image candidate
            <img src={cover} alt={project.name} className="size-full object-cover" />
          ) : (
            <CoverPlaceholder name={project.name} className="size-full [&_span]:text-5xl" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-ink-900/85 via-ink-900/30 to-ink-900/10" />

          <div className="absolute right-4 top-4 flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-white/30 bg-white/10 text-white backdrop-blur hover:bg-white/20"
              onClick={() => setEditInitial(projectToForm(project))}
            >
              <Pencil className="size-3.5" /> Edit
            </Button>
            {project.is_published ? (
              <Button
                size="sm"
                variant="outline"
                className="border-white/30 bg-white/10 text-white backdrop-blur hover:bg-white/20"
                onClick={() => setConfirmUnpublish(true)}
              >
                <EyeOff className="size-3.5" /> Unpublish
              </Button>
            ) : (
              <Button size="sm" variant="secondary" loading={togglePublish.isPending} onClick={() => setPublished(true)}>
                <Eye className="size-3.5" /> Publish
              </Button>
            )}
          </div>

          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <PublishPill published={project.is_published} />
              <DevStatusPill status={project.development_status} />
            </div>
            <h1 className="text-2xl font-semibold text-white sm:text-3xl">{project.name}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-100">
              <MapPin className="size-4 shrink-0 text-gold-300" />
              {project.location || 'No location set'}
            </p>
          </div>
        </div>
        <div className="overflow-x-auto border-t border-ink-100 px-5 py-4">
          <div className="min-w-[560px]">
            <DevStatusStepper status={project.development_status} />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* About */}
          <Card>
            <CardHeader
              title="About this project"
              actions={
                <Button variant="ghost" size="sm" onClick={() => setEditInitial(projectToForm(project))}>
                  <Pencil className="size-3.5" /> Edit
                </Button>
              }
            />
            <CardBody className="space-y-5">
              {project.description ? (
                <p className="whitespace-pre-line text-sm leading-relaxed text-ink-600">{project.description}</p>
              ) : (
                <p className="text-sm italic text-ink-300">No description yet — customers will see an empty overview.</p>
              )}
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Amenities</h4>
                {project.amenities.length ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {project.amenities.map((a) => (
                      <div key={a} className="flex items-center gap-2 rounded-lg border border-ink-100 bg-ink-50/50 px-3 py-2 text-sm text-ink-700">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-gold-100 text-gold-700">
                          <Check className="size-3" />
                        </span>
                        {a}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-300">None listed.</p>
                )}
              </div>
            </CardBody>
          </Card>

          {/* Plot inventory */}
          <Card>
            <CardHeader
              title="Plot inventory"
              subtitle={plotStats?.total ? `${Math.round(pct(plotStats.sold + plotStats.booked))}% booked or sold` : undefined}
              actions={
                <Link
                  href={`/plots?project=${project.id}`}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-100"
                >
                  Manage plots <ArrowUpRight className="size-3.5" />
                </Link>
              }
            />
            <CardBody className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Total', value: stat(plotStats?.total), dot: 'bg-ink-700' },
                  { label: 'Available', value: stat(plotStats?.available), dot: 'bg-emerald-500' },
                  { label: 'Booked', value: stat(plotStats?.booked), dot: 'bg-amber-500' },
                  { label: 'Sold', value: stat(plotStats?.sold), dot: 'bg-gold-500' },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border border-ink-100 px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-xs text-ink-400">
                      <span className={clsx('size-1.5 rounded-full', s.dot)} />
                      {s.label}
                    </p>
                    <p className="mt-0.5 text-xl font-semibold tabular-nums text-ink-800">{s.value}</p>
                  </div>
                ))}
              </div>

              {plotStats && plotStats.total > 0 && (
                <div className="flex h-2 overflow-hidden rounded-full bg-ink-100">
                  <div className="bg-gold-500 transition-all" style={{ width: `${pct(plotStats.sold)}%` }} title={`Sold: ${plotStats.sold}`} />
                  <div className="bg-amber-500 transition-all" style={{ width: `${pct(plotStats.booked)}%` }} title={`Booked: ${plotStats.booked}`} />
                  <div className="bg-emerald-500 transition-all" style={{ width: `${pct(plotStats.available)}%` }} title={`Available: ${plotStats.available}`} />
                </div>
              )}

              {plots && plots.results.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-ink-100">
                  <table className="w-full min-w-max text-left text-sm">
                    <thead>
                      <tr className="border-b border-ink-100 bg-ink-50/60 text-xs font-semibold uppercase tracking-wide text-ink-400">
                        <th className="px-3 py-2">Plot</th>
                        <th className="px-3 py-2">Block / sector</th>
                        <th className="px-3 py-2">Size</th>
                        <th className="px-3 py-2 text-right">Price</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {plots.results.slice(0, 6).map((pl) => (
                        <tr key={pl.id} className="text-ink-700">
                          <td className="px-3 py-2 font-medium text-ink-800">{pl.plot_number}</td>
                          <td className="px-3 py-2">{pl.block_sector || '—'}</td>
                          <td className="px-3 py-2">{pl.size}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(pl.price)}</td>
                          <td className="px-3 py-2">
                            <Badge>{pl.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {plots.count > 6 && (
                    <Link href={`/plots?project=${project.id}`} className="block border-t border-ink-100 px-3 py-2 text-center text-xs font-medium text-ink-500 hover:bg-ink-50 hover:text-ink-700">
                      View all {plots.count} plots
                    </Link>
                  )}
                </div>
              ) : (
                plotStats?.total === 0 && (
                  <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-ink-200 px-4 py-8 text-center">
                    <LandPlot className="size-6 text-ink-300" />
                    <p className="text-sm font-medium text-ink-600">No plots in this project yet</p>
                    <p className="text-xs text-ink-400">Add plots individually or via CSV import from the plot inventory.</p>
                    <Link href={`/plots?project=${project.id}`} className="mt-1 text-xs font-semibold text-gold-700 hover:text-gold-800">
                      Go to plot inventory →
                    </Link>
                  </div>
                )
              )}
            </CardBody>
          </Card>

          {/* Media */}
          <Card>
            <CardHeader
              title="Images"
              subtitle={IMAGE_TABS.find((t) => t.value === imageTab)?.hint}
              actions={
                <>
                  <Button size="sm" variant="outline" onClick={() => imageInput.current?.click()} loading={uploadingCount > 0}>
                    <Upload className="size-3.5" /> Upload
                  </Button>
                  <input
                    ref={imageInput}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={async (e) => {
                      const files = Array.from(e.target.files ?? [])
                      e.target.value = ''
                      await uploadImages(files)
                    }}
                  />
                </>
              }
            />
            <div className="flex gap-1 border-b border-ink-100 px-5">
              {IMAGE_TABS.map((t) => {
                const count = t.value === 'GALLERY' ? galleryCount : layoutCount
                return (
                  <button
                    key={t.value}
                    onClick={() => setImageTab(t.value)}
                    className={clsx(
                      '-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                      imageTab === t.value ? 'border-gold-500 text-ink-800' : 'border-transparent text-ink-400 hover:text-ink-700',
                    )}
                  >
                    {t.label}
                    <span className={clsx('rounded-full px-1.5 text-[11px] tabular-nums', imageTab === t.value ? 'bg-gold-100 text-gold-800' : 'bg-ink-100 text-ink-500')}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
            <CardBody>
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={clsx('grid grid-cols-2 gap-3 rounded-lg sm:grid-cols-3', dragOver && 'ring-2 ring-gold-400 ring-offset-4')}
              >
                {tabImages.map((img, i) => (
                  <div key={img.id} className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-ink-100 bg-ink-50">
                    {/* eslint-disable-next-line @next/next/no-img-element -- dynamic Django media host, not a next/image candidate */}
                    <img
                      src={absoluteMediaUrl(img.image) ?? undefined}
                      alt={img.caption}
                      className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    {imageTab === 'GALLERY' && i === 0 && (
                      <span className="absolute left-2 top-2 rounded-full bg-gold-500 px-2 py-0.5 text-[10px] font-semibold text-ink-900 shadow-sm">Cover</span>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-ink-900/50 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => setLightboxIndex(i)}
                        className="flex size-9 items-center justify-center rounded-full bg-white/90 text-ink-800 hover:bg-white"
                        aria-label="View image"
                      >
                        <Maximize2 className="size-4" />
                      </button>
                      <button
                        onClick={() => setPendingDelete(img)}
                        className="flex size-9 items-center justify-center rounded-full bg-red-600/90 text-white hover:bg-red-600"
                        aria-label="Delete image"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    {img.caption && (
                      <p className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-ink-900/70 to-transparent px-2 pb-1.5 pt-4 text-xs text-white">
                        {img.caption}
                      </p>
                    )}
                  </div>
                ))}
                {Array.from({ length: uploadingCount }).map((_, i) => (
                  <div key={`up-${i}`} className="flex aspect-[4/3] items-center justify-center rounded-lg border border-ink-100 bg-ink-50">
                    <Spinner className="size-6" />
                  </div>
                ))}
                <button
                  onClick={() => imageInput.current?.click()}
                  className={clsx(
                    'flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed text-center transition-colors',
                    dragOver ? 'border-gold-400 bg-gold-50 text-gold-700' : 'border-ink-200 text-ink-400 hover:border-gold-400 hover:bg-gold-50/50 hover:text-gold-700',
                    tabImages.length === 0 && 'col-span-2 aspect-auto py-10 sm:col-span-3',
                  )}
                >
                  <ImagePlus className="size-6" />
                  <span className="text-xs font-medium">{tabImages.length === 0 ? `Drop ${imageTab === 'LAYOUT' ? 'layout plans' : 'images'} here or click to upload` : 'Add more'}</span>
                </button>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Publishing readiness" subtitle={`${readiness} of ${checklist.length} complete`} />
            <CardBody className="space-y-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                <div
                  className={clsx('h-full rounded-full transition-all', readiness === checklist.length ? 'bg-emerald-500' : 'bg-gold-500')}
                  style={{ width: `${(readiness / checklist.length) * 100}%` }}
                />
              </div>
              <ul className="space-y-2">
                {checklist.map((c) => (
                  <li key={c.label} className="flex items-center gap-2.5 text-sm">
                    {c.done ? (
                      <span className="flex size-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <Check className="size-3" />
                      </span>
                    ) : (
                      <Circle className="size-5 text-ink-200" />
                    )}
                    <span className={c.done ? 'text-ink-700' : 'text-ink-400'}>{c.label}</span>
                  </li>
                ))}
              </ul>
              <div className={clsx('rounded-lg px-3 py-2.5 text-xs', project.is_published ? 'bg-emerald-50 text-emerald-700' : 'bg-ink-50 text-ink-500')}>
                {project.is_published ? 'Live — customers can see this project in the app.' : 'Draft — hidden from customers until published.'}
              </div>
              {project.is_published ? (
                <Button variant="outline" className="w-full" onClick={() => setConfirmUnpublish(true)}>
                  <EyeOff className="size-4" /> Unpublish
                </Button>
              ) : (
                <Button variant="secondary" className="w-full" loading={togglePublish.isPending} onClick={() => setPublished(true)}>
                  <Eye className="size-4" /> Publish to app
                </Button>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Brochure" />
            <CardBody className="space-y-3">
              {project.brochure ? (
                <a
                  href={absoluteMediaUrl(project.brochure) ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center gap-3 rounded-lg border border-ink-100 p-3 transition-colors hover:border-gold-300 hover:bg-gold-50/40"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
                    <FileText className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink-800">{fileName(project.brochure)}</span>
                    <span className="text-xs text-ink-400">Click to open</span>
                  </span>
                  <ExternalLink className="size-4 shrink-0 text-ink-300 group-hover:text-ink-600" />
                </a>
              ) : (
                <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-ink-200 px-4 py-6 text-center">
                  <FileText className="size-6 text-ink-300" />
                  <p className="text-sm text-ink-500">No brochure uploaded</p>
                  <p className="text-xs text-ink-400">PDF or image</p>
                </div>
              )}
              <Button variant="outline" size="sm" className="w-full" onClick={() => brochureInput.current?.click()} loading={uploadBrochure.isPending}>
                <Upload className="size-3.5" /> {project.brochure ? 'Replace brochure' : 'Upload brochure'}
              </Button>
              <input
                ref={brochureInput}
                type="file"
                accept="application/pdf,image/*"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  try {
                    await uploadBrochure.mutateAsync(file)
                    toast.success('Brochure uploaded')
                  } catch (err) {
                    toast.error(apiErrorMessage(err))
                  } finally {
                    e.target.value = ''
                  }
                }}
              />
            </CardBody>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Location" />
            {hasCoords && (
              <iframe
                title="Project location map"
                src={`https://maps.google.com/maps?q=${project.latitude},${project.longitude}&z=14&output=embed`}
                className="h-44 w-full border-0 border-b border-ink-100"
                loading="lazy"
              />
            )}
            <CardBody className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-gold-600" />
                <span className={project.location ? 'text-ink-700' : 'text-ink-300'}>{project.location || 'No address set'}</span>
              </div>
              {hasCoords ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-ink-400">
                    {Number(project.latitude).toFixed(5)}, {Number(project.longitude).toFixed(5)}
                  </span>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${project.latitude},${project.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-gold-700 hover:text-gold-800"
                  >
                    Open in Maps <ExternalLink className="size-3" />
                  </a>
                </div>
              ) : (
                <button onClick={() => setEditInitial(projectToForm(project))} className="text-xs font-semibold text-gold-700 hover:text-gold-800">
                  + Add map coordinates
                </button>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <dl className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="flex items-center gap-2 text-ink-400">
                    <CalendarDays className="size-4" /> Created
                  </dt>
                  <dd className="text-ink-700">{formatDate(project.created_at)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="flex items-center gap-2 text-ink-400">
                    <Images className="size-4" /> Images
                  </dt>
                  <dd className="text-ink-700">{project.images.length}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-ink-400">Project ID</dt>
                  <dd className="font-mono text-xs text-ink-500">#{project.id}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          {canDelete && (
            <Card className="border-red-100">
              <CardBody className="space-y-2">
                <p className="text-sm font-semibold text-red-700">Danger zone</p>
                <p className="text-xs text-ink-500">Only possible while no plot has buyers or payment history. Unpublish instead to hide it from the app.</p>
                <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="size-3.5" /> Delete project
                </Button>
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      {deleteOpen && <DeleteProjectModal project={project} onClose={() => setDeleteOpen(false)} />}

      <ProjectFormModal
        open={!!editInitial}
        title="Edit project"
        submitLabel="Save changes"
        initial={editInitial ?? projectToForm(project)}
        loading={updateProject.isPending}
        onClose={() => setEditInitial(null)}
        onSubmit={saveEdit}
      />

      <ConfirmDialog
        open={confirmUnpublish}
        title="Unpublish project?"
        message={`${project.name} will be hidden from customers in the app. Existing plot owners are not affected.`}
        confirmLabel="Unpublish"
        danger
        loading={togglePublish.isPending}
        onConfirm={() => setPublished(false)}
        onClose={() => setConfirmUnpublish(false)}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete image?"
        message="This image will be removed from the project and the customer app. This can't be undone."
        confirmLabel="Delete"
        danger
        loading={deleteImage.isPending}
        onConfirm={removeImage}
        onClose={() => setPendingDelete(null)}
      />

      {lightboxIndex !== null && tabImages[lightboxIndex] && (
        <Lightbox images={tabImages} index={lightboxIndex} onChange={setLightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </div>
  )
}

function Lightbox({
  images,
  index,
  onChange,
  onClose,
}: {
  images: ProjectImage[]
  index: number
  onChange: (i: number) => void
  onClose: () => void
}) {
  const img = images[index]
  const prev = () => onChange((index - 1 + images.length) % images.length)
  const next = () => onChange((index + 1) % images.length)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') onChange((index - 1 + images.length) % images.length)
      else if (e.key === 'ArrowRight') onChange((index + 1) % images.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, images.length, onChange, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/90 p-6 backdrop-blur-sm" onClick={onClose}>
      <button onClick={onClose} className="absolute right-4 top-4 rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Close">
        <X className="size-6" />
      </button>
      {images.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation()
              prev()
            }}
            className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Previous image"
          >
            <ChevronLeft className="size-6" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              next()
            }}
            className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Next image"
          >
            <ChevronRight className="size-6" />
          </button>
        </>
      )}
      <figure className="flex max-h-full flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element -- dynamic Django media host, not a next/image candidate */}
        <img src={absoluteMediaUrl(img.image) ?? undefined} alt={img.caption} className="max-h-[80vh] max-w-full rounded-lg object-contain shadow-2xl" />
        <figcaption className="text-sm text-white/70">
          {img.caption ? `${img.caption} · ` : ''}
          {index + 1} / {images.length}
        </figcaption>
      </figure>
    </div>
  )
}
