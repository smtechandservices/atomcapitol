'use client'

import { useRef, useState } from 'react'
import { Plus, Search, Upload, UploadCloud } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Input, Select, FieldWrap } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { useAllProjects } from '@/features/projects/api'
import type { Plot } from '@/types'
import { useBulkAssignPlots, useBulkImportPlots, useCreatePlot, usePlots, type PlotFormValues } from './api'
import { PlotDrawer } from './PlotDrawer'

const emptyForm: PlotFormValues = { project: 0, plot_number: '', size: '', block_sector: '', price: '' }

export function PlotsPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedPlotId, setSelectedPlotId] = useState<number | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [form, setForm] = useState<PlotFormValues>(emptyForm)
  const [importProject, setImportProject] = useState('')
  const importFile = useRef<HTMLInputElement>(null)
  const assignFile = useRef<HTMLInputElement>(null)

  const toast = useToast()
  const { data: projects } = useAllProjects()
  const { data, isLoading, error } = usePlots({
    page,
    search: search || undefined,
    project: projectFilter || undefined,
    status: statusFilter || undefined,
  })
  const createPlot = useCreatePlot()
  const bulkImport = useBulkImportPlots()
  const bulkAssign = useBulkAssignPlots()

  const selectedPlot = data?.results.find((p) => p.id === selectedPlotId) ?? null

  const columns: Column<Plot>[] = [
    { key: 'plot_number', header: 'Plot', render: (p) => <span className="font-medium text-ink-800">{p.plot_number}</span> },
    { key: 'project', header: 'Project', render: (p) => p.project_name },
    { key: 'size', header: 'Size', render: (p) => p.size },
    { key: 'block', header: 'Block/Sector', render: (p) => p.block_sector || '—' },
    { key: 'price', header: 'Price', render: (p) => formatCurrency(p.price) },
    { key: 'status', header: 'Status', render: (p) => <Badge>{p.status}</Badge> },
    {
      key: 'buyer',
      header: 'Primary buyer',
      render: (p) => p.buyers.find((b) => b.plot_role === 'PRIMARY')?.email ?? <span className="text-ink-300">Unassigned</span>,
    },
  ]

  const submitCreate = async () => {
    try {
      await createPlot.mutateAsync(form)
      toast.success('Plot created')
      setCreateOpen(false)
      setForm(emptyForm)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const submitImport = async () => {
    const file = importFile.current?.files?.[0]
    if (!file || !importProject) return
    try {
      const res = await bulkImport.mutateAsync({ project: Number(importProject), file })
      toast.success(`Imported ${res.created} plot(s)${res.errors.length ? `, ${res.errors.length} error(s)` : ''}`)
      setImportOpen(false)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const submitAssignCsv = async () => {
    const file = assignFile.current?.files?.[0]
    if (!file) return
    try {
      const res = await bulkAssign.mutateAsync(file)
      toast.success(`Assigned ${res.assigned} buyer(s)${res.errors.length ? `, ${res.errors.length} error(s)` : ''}`)
      setAssignOpen(false)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <div>
      <PageHeader
        title="Plot Inventory"
        subtitle="Add plots, assign buyers by email, and manage transfers"
        actions={
          <>
            <Button variant="outline" onClick={() => setAssignOpen(true)}>
              <UploadCloud className="size-4" /> Bulk assign
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" /> Bulk import
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> New plot
            </Button>
          </>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 p-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
            <Input
              className="pl-9"
              placeholder="Search by plot number or block"
              value={search}
              onChange={(e) => {
                setPage(1)
                setSearch(e.target.value)
              }}
            />
          </div>
          <Select
            className="w-56"
            value={projectFilter}
            onChange={(e) => {
              setPage(1)
              setProjectFilter(e.target.value)
            }}
          >
            <option value="">All projects</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select
            className="w-40"
            value={statusFilter}
            onChange={(e) => {
              setPage(1)
              setStatusFilter(e.target.value)
            }}
          >
            <option value="">All statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="BOOKED">Booked</option>
            <option value="SOLD">Sold</option>
          </Select>
        </div>
        <DataTable
          columns={columns}
          rows={data?.results ?? []}
          rowKey={(r) => r.id}
          isLoading={isLoading}
          error={error ? apiErrorMessage(error) : null}
          onRowClick={(row) => setSelectedPlotId(row.id)}
          page={page}
          onPageChange={setPage}
          count={data?.count}
          emptyTitle="No plots yet"
        />
      </Card>

      {selectedPlot && <PlotDrawer plot={selectedPlot} onClose={() => setSelectedPlotId(null)} />}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New plot"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              loading={createPlot.isPending}
              onClick={submitCreate}
              disabled={!form.project || !form.plot_number || !form.size || !form.price}
            >
              Create plot
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FieldWrap label="Project" required>
            <Select value={form.project || ''} onChange={(e) => setForm({ ...form, project: Number(e.target.value) })}>
              <option value="">Select project</option>
              {projects?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FieldWrap>
          <FieldWrap label="Plot number" required>
            <Input value={form.plot_number} onChange={(e) => setForm({ ...form, plot_number: e.target.value })} />
          </FieldWrap>
          <div className="grid grid-cols-2 gap-3">
            <FieldWrap label="Size" required hint="e.g. 1200 sq.ft">
              <Input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
            </FieldWrap>
            <FieldWrap label="Block / Sector">
              <Input value={form.block_sector} onChange={(e) => setForm({ ...form, block_sector: e.target.value })} />
            </FieldWrap>
          </div>
          <FieldWrap label="Price" required>
            <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </FieldWrap>
        </div>
      </Modal>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Bulk import plots (CSV)"
        footer={
          <>
            <Button variant="ghost" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button variant="secondary" loading={bulkImport.isPending} onClick={submitImport} disabled={!importProject}>
              Import
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FieldWrap label="Project" required>
            <Select value={importProject} onChange={(e) => setImportProject(e.target.value)}>
              <option value="">Select project</option>
              {projects?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FieldWrap>
          <FieldWrap label="CSV file" required hint="Columns: plot_number, size, block_sector, price">
            <input ref={importFile} type="file" accept=".csv" className="block text-sm" />
          </FieldWrap>
        </div>
      </Modal>

      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Bulk assign buyers (CSV)"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button variant="secondary" loading={bulkAssign.isPending} onClick={submitAssignCsv}>
              Assign
            </Button>
          </>
        }
      >
        <FieldWrap
          label="CSV file"
          required
          hint="Columns: project, plot_number, email, role, name, phone, total_value, amount_paid_outside_app, instalment_count"
        >
          <input ref={assignFile} type="file" accept=".csv" className="block text-sm" />
        </FieldWrap>
      </Modal>
    </div>
  )
}
