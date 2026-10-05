'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Input, Select, FieldWrap, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { useCreateProject, useProjects, type ProjectFormValues } from './api'
import type { Project } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'

const emptyForm: ProjectFormValues = {
  name: '',
  location: '',
  description: '',
  development_status: 'PLANNING',
  amenities: [],
}

export function ProjectsPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<ProjectFormValues>(emptyForm)
  const [amenitiesText, setAmenitiesText] = useState('')

  const router = useRouter()
  const toast = useToast()
  const { data, isLoading, error } = useProjects({ page, search: search || undefined, development_status: status || undefined })
  const createProject = useCreateProject()

  const columns: Column<Project>[] = [
    { key: 'name', header: 'Project', render: (p) => <span className="font-medium text-ink-800">{p.name}</span> },
    { key: 'location', header: 'Location', render: (p) => p.location || '—' },
    { key: 'plots', header: 'Plots', render: (p) => p.plot_count },
    { key: 'status', header: 'Status', render: (p) => <Badge>{p.development_status}</Badge> },
    {
      key: 'published',
      header: 'Published',
      render: (p) => <Badge tone={p.is_published ? 'success' : 'neutral'}>{p.is_published ? 'Published' : 'Draft'}</Badge>,
    },
  ]

  const submit = async () => {
    try {
      const payload = { ...form, amenities: amenitiesText.split(',').map((a) => a.trim()).filter(Boolean) }
      const created = await createProject.mutateAsync(payload)
      toast.success('Project created')
      setCreateOpen(false)
      setForm(emptyForm)
      setAmenitiesText('')
      router.push(`/projects/${created.id}`)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to create project'))
    }
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Manage townships / projects shown in the CustomerApp"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> New project
          </Button>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 p-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
            <Input
              className="pl-9"
              placeholder="Search by name or location"
              value={search}
              onChange={(e) => {
                setPage(1)
                setSearch(e.target.value)
              }}
            />
          </div>
          <Select
            className="w-48"
            value={status}
            onChange={(e) => {
              setPage(1)
              setStatus(e.target.value)
            }}
          >
            <option value="">All statuses</option>
            <option value="PLANNING">Planning</option>
            <option value="UNDER_CONSTRUCTION">Under construction</option>
            <option value="READY">Ready</option>
            <option value="COMPLETED">Completed</option>
          </Select>
        </div>
        <DataTable
          columns={columns}
          rows={data?.results ?? []}
          rowKey={(r) => r.id}
          isLoading={isLoading}
          error={error ? apiErrorMessage(error) : null}
          onRowClick={(row) => router.push(`/projects/${row.id}`)}
          page={page}
          onPageChange={setPage}
          count={data?.count}
          emptyTitle="No projects yet"
          emptySubtitle="Create your first project/township to start adding plots."
        />
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New project"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="secondary" loading={createProject.isPending} onClick={submit} disabled={!form.name}>
              Create project
            </Button>
          </>
        }
      >
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
          <FieldWrap label="Amenities" hint="Comma-separated, e.g. Clubhouse, 24x7 security">
            <Input value={amenitiesText} onChange={(e) => setAmenitiesText(e.target.value)} />
          </FieldWrap>
        </div>
      </Modal>
    </div>
  )
}
