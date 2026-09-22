'use client'

import { useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Trash2, Upload, FileText } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea, FieldWrap } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { absoluteMediaUrl } from '@/lib/format'
import {
  useAddProjectImage,
  useDeleteProjectImage,
  useProject,
  useTogglePublish,
  useUpdateProject,
  useUploadBrochure,
} from './api'

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const toast = useToast()
  const { data: project, isLoading, error } = useProject(id)
  const updateProject = useUpdateProject(Number(id))
  const togglePublish = useTogglePublish(Number(id))
  const uploadBrochure = useUploadBrochure(Number(id))
  const addImage = useAddProjectImage(Number(id))
  const deleteImage = useDeleteProjectImage(Number(id))

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', location: '', description: '', development_status: 'PLANNING', amenities: '' })
  const brochureInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const [imageType, setImageType] = useState<'GALLERY' | 'LAYOUT'>('GALLERY')

  if (isLoading) return <FullPageSpinner />
  if (error || !project) return <ErrorState message={apiErrorMessage(error, 'Project not found')} />

  const startEdit = () => {
    setForm({
      name: project.name,
      location: project.location,
      description: project.description,
      development_status: project.development_status,
      amenities: project.amenities.join(', '),
    })
    setEditing(true)
  }

  const saveEdit = async () => {
    try {
      await updateProject.mutateAsync({
        ...form,
        amenities: form.amenities.split(',').map((a) => a.trim()).filter(Boolean),
      })
      toast.success('Project updated')
      setEditing(false)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <div>
      <button onClick={() => router.push('/projects')} className="mb-3 flex items-center gap-1 text-sm text-ink-400 hover:text-ink-700">
        <ArrowLeft className="size-4" /> Back to projects
      </button>
      <PageHeader
        title={project.name}
        subtitle={project.location}
        actions={
          <>
            <Badge tone={project.is_published ? 'success' : 'neutral'}>{project.is_published ? 'Published' : 'Draft'}</Badge>
            <Button
              variant={project.is_published ? 'outline' : 'secondary'}
              loading={togglePublish.isPending}
              onClick={() => togglePublish.mutate(!project.is_published)}
            >
              {project.is_published ? 'Unpublish' : 'Publish'}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader
              title="Project details"
              actions={
                !editing ? (
                  <Button variant="outline" size="sm" onClick={startEdit}>
                    Edit
                  </Button>
                ) : undefined
              }
            />
            <CardBody>
              {editing ? (
                <div className="space-y-4">
                  <FieldWrap label="Name" required>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </FieldWrap>
                  <FieldWrap label="Location">
                    <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                  </FieldWrap>
                  <FieldWrap label="Development status">
                    <Select value={form.development_status} onChange={(e) => setForm({ ...form, development_status: e.target.value })}>
                      <option value="PLANNING">Planning</option>
                      <option value="UNDER_CONSTRUCTION">Under construction</option>
                      <option value="READY">Ready</option>
                      <option value="COMPLETED">Completed</option>
                    </Select>
                  </FieldWrap>
                  <FieldWrap label="Description">
                    <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </FieldWrap>
                  <FieldWrap label="Amenities" hint="Comma-separated">
                    <Input value={form.amenities} onChange={(e) => setForm({ ...form, amenities: e.target.value })} />
                  </FieldWrap>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                    <Button variant="secondary" loading={updateProject.isPending} onClick={saveEdit}>
                      Save changes
                    </Button>
                  </div>
                </div>
              ) : (
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-xs text-ink-400">Development status</dt>
                    <dd className="mt-0.5">
                      <Badge>{project.development_status}</Badge>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-400">Plots</dt>
                    <dd className="mt-0.5 font-medium text-ink-700">{project.plot_count}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-ink-400">Description</dt>
                    <dd className="mt-0.5 text-ink-700">{project.description || '—'}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-ink-400">Amenities</dt>
                    <dd className="mt-1 flex flex-wrap gap-1.5">
                      {project.amenities.length ? (
                        project.amenities.map((a) => (
                          <span key={a} className="rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-600">
                            {a}
                          </span>
                        ))
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </dd>
                  </div>
                </dl>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Gallery & layout images"
              actions={
                <>
                  <Select className="w-32" value={imageType} onChange={(e) => setImageType(e.target.value as 'GALLERY' | 'LAYOUT')}>
                    <option value="GALLERY">Gallery</option>
                    <option value="LAYOUT">Layout</option>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => imageInput.current?.click()}
                    loading={addImage.isPending}
                  >
                    <Upload className="size-4" /> Add image
                  </Button>
                  <input
                    ref={imageInput}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      try {
                        await addImage.mutateAsync({ image: file, image_type: imageType })
                        toast.success('Image added')
                      } catch (err) {
                        toast.error(apiErrorMessage(err))
                      } finally {
                        e.target.value = ''
                      }
                    }}
                  />
                </>
              }
            />
            <CardBody>
              {project.images.length === 0 ? (
                <p className="text-sm text-ink-400">No images uploaded yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {project.images.map((img) => (
                    <div key={img.id} className="group relative overflow-hidden rounded-lg border border-ink-100">
                      {/* eslint-disable-next-line @next/next/no-img-element -- dynamic Django media host, not a next/image candidate */}
                      <img src={absoluteMediaUrl(img.image) ?? undefined} alt={img.caption} className="h-28 w-full object-cover" />
                      <span className="absolute left-1.5 top-1.5 rounded-full bg-ink-900/70 px-2 py-0.5 text-[10px] font-medium text-white">
                        {img.image_type}
                      </span>
                      <button
                        onClick={async () => {
                          try {
                            await deleteImage.mutateAsync(img.id)
                          } catch (err) {
                            toast.error(apiErrorMessage(err))
                          }
                        }}
                        className="absolute right-1.5 top-1.5 rounded-full bg-red-600/90 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Brochure" />
            <CardBody className="space-y-3">
              {project.brochure ? (
                <a
                  href={absoluteMediaUrl(project.brochure) ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-ink-100 px-3 py-2 text-sm text-ink-700 hover:bg-ink-50"
                >
                  <FileText className="size-4" /> View current brochure
                </a>
              ) : (
                <p className="text-sm text-ink-400">No brochure uploaded.</p>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => brochureInput.current?.click()}
                loading={uploadBrochure.isPending}
              >
                <Upload className="size-4" /> {project.brochure ? 'Replace brochure' : 'Upload brochure'}
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
        </div>
      </div>
    </div>
  )
}
