'use client'

import { useState } from 'react'
import { Download, Plus, Search, Upload, UploadCloud } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Input, Select, FieldWrap, FileInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { useAllProjects } from '@/features/projects/api'
import type { Plot } from '@/types'
import {
  useBulkAssignPlots,
  useBulkImportPlots,
  useCreatePlot,
  usePlots,
  type BulkRowError,
  type PlotFormValues,
} from './api'
import { PlotDrawer } from './PlotDrawer'

const emptyForm: PlotFormValues = {
  project: 0,
  plot_number: '',
  size: '',
  block_sector: '',
  rate_per_sq_yd: '',
  plc_percent: '',
  plc_type: '',
}

const IMPORT_SAMPLE = [
  'plot_number,size,block_sector,rate_per_sq_yd,plc_percent,plc_type',
  'A-101,200,Block A,25000,10,Corner',
  'A-102,150,Block A,25000,5,Park facing',
  'A-103,180,Block A,25000,0,',
]

const ASSIGN_SAMPLE = [
  'project,plot_number,email,role,name,phone,total_value,amount_paid_outside_app,instalment_count',
  'Green Valley,A-101,buyer@example.com,PRIMARY,Ravi Kumar,9876543210,5500000,500000,10',
]

function downloadCsv(filename: string, lines: string[]) {
  const url = URL.createObjectURL(new Blob([lines.join('\n') + '\n'], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Mirrors Plot.save(): size x rate x (1 + PLC%)
function computeTotal(size: string, rate: string, plc: string): number | null {
  const area = Number(size)
  const perYd = Number(rate)
  if (!size || !rate || !(area > 0) || !(perYd >= 0)) return null
  return area * perYd * (1 + (Number(plc) || 0) / 100)
}

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
  const [importFile, setImportFile] = useState<File | null>(null)
  const [assignFile, setAssignFile] = useState<File | null>(null)
  const [importErrors, setImportErrors] = useState<BulkRowError[]>([])
  const [assignErrors, setAssignErrors] = useState<BulkRowError[]>([])

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
  const formTotal = computeTotal(form.size, form.rate_per_sq_yd, form.plc_percent)

  const columns: Column<Plot>[] = [
    { key: 'plot_number', header: 'Plot', render: (p) => <span className="font-medium text-ink-800">{p.plot_number}</span> },
    { key: 'project', header: 'Project', render: (p) => p.project_name },
    { key: 'size', header: 'Size', render: (p) => (Number(p.size) ? `${p.size} sq. yd` : p.size) },
    { key: 'block', header: 'Block/Sector', render: (p) => p.block_sector || '—' },
    { key: 'price', header: 'Total price', render: (p) => formatCurrency(p.price) },
    { key: 'status', header: 'Status', render: (p) => <Badge>{p.status}</Badge> },
    {
      key: 'buyer',
      header: 'Primary buyer',
      render: (p) => p.buyers.find((b) => b.plot_role === 'PRIMARY')?.email ?? <span className="text-ink-300">Unassigned</span>,
    },
  ]

  const submitCreate = async () => {
    try {
      await createPlot.mutateAsync({ ...form, plc_percent: form.plc_percent || '0' })
      toast.success('Plot created')
      setCreateOpen(false)
      setForm(emptyForm)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const openImport = () => {
    setImportFile(null)
    setImportErrors([])
    setImportOpen(true)
  }

  const openAssign = () => {
    setAssignFile(null)
    setAssignErrors([])
    setAssignOpen(true)
  }

  const submitImport = async () => {
    if (!importFile || !importProject) return
    try {
      const res = await bulkImport.mutateAsync({ project: Number(importProject), file: importFile })
      setImportErrors(res.errors)
      if (res.errors.length) {
        toast.error(`Imported ${res.created.length} plot(s), ${res.errors.length} row(s) failed`)
      } else {
        toast.success(`Imported ${res.created.length} plot(s)`)
        setImportOpen(false)
      }
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const submitAssignCsv = async () => {
    if (!assignFile) return
    try {
      const res = await bulkAssign.mutateAsync(assignFile)
      setAssignErrors(res.errors)
      if (res.errors.length) {
        toast.error(`Assigned ${res.assigned.length} buyer(s), ${res.errors.length} row(s) failed`)
      } else {
        toast.success(`Assigned ${res.assigned.length} buyer(s)`)
        setAssignOpen(false)
      }
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
            <Button variant="outline" onClick={openAssign}>
              <UploadCloud className="size-4" /> Bulk assign
            </Button>
            <Button variant="outline" onClick={openImport}>
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
              disabled={!form.project || !form.plot_number || formTotal === null}
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
            <FieldWrap label="Size (sq. yd)" required hint="e.g. 200">
              <Input type="number" min="0" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
            </FieldWrap>
            <FieldWrap label="Block / Sector">
              <Input value={form.block_sector} onChange={(e) => setForm({ ...form, block_sector: e.target.value })} />
            </FieldWrap>
          </div>
          <FieldWrap label="Price per sq. yd" required>
            <Input
              type="number"
              min="0"
              value={form.rate_per_sq_yd}
              onChange={(e) => setForm({ ...form, rate_per_sq_yd: e.target.value })}
            />
          </FieldWrap>
          <div className="grid grid-cols-2 gap-3">
            <FieldWrap label="PLC (%)">
              <Input
                type="number"
                min="0"
                max="100"
                placeholder="0"
                value={form.plc_percent}
                onChange={(e) => setForm({ ...form, plc_percent: e.target.value })}
              />
            </FieldWrap>
            <FieldWrap label="PLC type" hint="e.g. Corner, Park facing">
              <Input value={form.plc_type} onChange={(e) => setForm({ ...form, plc_type: e.target.value })} />
            </FieldWrap>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 text-sm">
            <span className="text-ink-500">Total price</span>
            <span className="font-semibold text-ink-800">{formatCurrency(formTotal)}</span>
          </div>
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
            <Button variant="secondary" loading={bulkImport.isPending} onClick={submitImport} disabled={!importProject || !importFile}>
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
          <FieldWrap
            label="CSV file"
            required
            hint="Columns: plot_number, size (sq. yd), block_sector, rate_per_sq_yd, plc_percent, plc_type. Total price is calculated automatically."
          >
            <FileInput file={importFile} onChange={setImportFile} accept=".csv,text/csv" />
          </FieldWrap>
          <Button variant="outline" size="sm" onClick={() => downloadCsv('plots-import-sample.csv', IMPORT_SAMPLE)}>
            <Download className="size-4" /> Download sample CSV
          </Button>
          <RowErrors errors={importErrors} />
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
            <Button variant="secondary" loading={bulkAssign.isPending} onClick={submitAssignCsv} disabled={!assignFile}>
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
          <FileInput file={assignFile} onChange={setAssignFile} accept=".csv,text/csv" />
        </FieldWrap>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => downloadCsv('plots-assign-sample.csv', ASSIGN_SAMPLE)}
        >
          <Download className="size-4" /> Download sample CSV
        </Button>
        <div className="mt-4">
          <RowErrors errors={assignErrors} />
        </div>
      </Modal>
    </div>
  )
}

function RowErrors({ errors }: { errors: BulkRowError[] }) {
  if (!errors.length) return null
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
      <p className="mb-1 font-medium">These rows were not imported. Fix them and upload again.</p>
      <ul className="max-h-40 space-y-0.5 overflow-y-auto">
        {errors.map((e) => (
          <li key={e.row}>
            Row {e.row}: {e.error}
          </li>
        ))}
      </ul>
    </div>
  )
}
