'use client'

import { useRef, useState, type DragEvent } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import clsx from 'clsx'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileSpreadsheet,
  LandPlot,
  Plus,
  Search,
  Upload,
  UploadCloud,
  UserPlus,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, StatCard } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Input, Select, FieldWrap } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { useAllProjects } from '@/features/projects/api'
import type { Plot, PlotStatus } from '@/types'
import {
  useBulkAssignPlots,
  useBulkImportPlots,
  useCreatePlot,
  usePlotStatusCounts,
  usePlots,
  type BulkRowError,
  type PlotFormValues,
} from './api'
import { PlotDrawer } from './PlotDrawer'

const PLOT_STATUSES: { value: PlotStatus; label: string; dot: string; pill: string }[] = [
  { value: 'AVAILABLE', label: 'Available', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  { value: 'BOOKED', label: 'Booked', dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-800 ring-amber-200' },
  { value: 'SOLD', label: 'Sold', dot: 'bg-gold-500', pill: 'bg-gold-50 text-gold-800 ring-gold-200' },
]

const emptyForm: PlotFormValues = { project: 0, plot_number: '', size: '', block_sector: '', price: '' }

type BulkResult = { kind: 'import' | 'assign'; ok: number; errors: BulkRowError[] }

export function PlotsPage() {
  const searchParams = useSearchParams()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState(searchParams.get('project') ?? '')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedPlotId, setSelectedPlotId] = useState<number | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [form, setForm] = useState<PlotFormValues>(emptyForm)
  const [importProject, setImportProject] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [assignFile, setAssignFile] = useState<File | null>(null)
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null)

  const toast = useToast()
  const { data: projects } = useAllProjects()
  const { data: counts } = usePlotStatusCounts(projectFilter || undefined)
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
  const hasFilters = !!(search || projectFilter || statusFilter)
  const activeProject = projects?.find((p) => String(p.id) === projectFilter)

  const resetTo = (fn: () => void) => {
    setPage(1)
    fn()
  }

  const columns: Column<Plot>[] = [
    {
      key: 'plot_number',
      header: 'Plot',
      render: (p) => (
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink-500 ring-1 ring-ink-100">
            <LandPlot className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-ink-800">{p.plot_number}</p>
            <p className="text-xs text-ink-400">{p.block_sector || 'No block/sector'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'project',
      header: 'Project',
      render: (p: Plot) => (
        <Link href={`/projects/${p.project}`} onClick={(e) => e.stopPropagation()} className="text-ink-600 hover:text-gold-700 hover:underline">
          {p.project_name}
        </Link>
      ),
    },
    { key: 'size', header: 'Size', render: (p) => <span className="text-ink-600">{p.size}</span> },
    {
      key: 'price',
      header: 'Price',
      className: 'text-right',
      render: (p) => <span className="font-medium tabular-nums text-ink-800">{formatCurrency(p.price)}</span>,
    },
    { key: 'status', header: 'Status', render: (p) => <PlotStatusPill status={p.status} /> },
    { key: 'buyer', header: 'Buyer', render: (p) => <BuyerCell plot={p} /> },
    {
      key: 'open',
      header: '',
      className: 'w-10',
      render: () => <ChevronRight className="size-4 text-ink-300" />,
    },
  ]

  const openCreate = () => {
    setForm({ ...emptyForm, project: Number(projectFilter) || 0 })
    setCreateOpen(true)
  }

  const openImport = () => {
    setImportProject(projectFilter)
    setImportFile(null)
    setBulkResult(null)
    setImportOpen(true)
  }

  const openAssign = () => {
    setAssignFile(null)
    setBulkResult(null)
    setAssignOpen(true)
  }

  const submitCreate = async () => {
    try {
      await createPlot.mutateAsync(form)
      toast.success(`Plot ${form.plot_number} created`)
      setCreateOpen(false)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const submitImport = async () => {
    if (!importFile || !importProject) return
    try {
      const res = await bulkImport.mutateAsync({ project: Number(importProject), file: importFile })
      if (res.errors.length) {
        setBulkResult({ kind: 'import', ok: res.created, errors: res.errors })
      } else {
        toast.success(`Imported ${res.created} plot(s)`)
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
      if (res.errors.length) {
        setBulkResult({ kind: 'assign', ok: res.assigned, errors: res.errors })
      } else {
        toast.success(`Assigned ${res.assigned} buyer(s)`)
        setAssignOpen(false)
      }
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const statusTabs = [{ value: '', label: 'All', dot: '', count: counts?.total }, ...PLOT_STATUSES.map((s) => ({ ...s, count: counts?.[s.value.toLowerCase() as 'available' | 'booked' | 'sold'] }))]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Plot Inventory"
        subtitle={activeProject ? `Plots in ${activeProject.name}` : 'Add plots, assign buyers by email, and manage transfers'}
        actions={
          <>
            <Button variant="outline" onClick={openAssign}>
              <UploadCloud className="size-4" /> Bulk assign
            </Button>
            <Button variant="outline" onClick={openImport}>
              <Upload className="size-4" /> Bulk import
            </Button>
            <Button variant="secondary" onClick={openCreate}>
              <Plus className="size-4" /> New plot
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total plots" value={counts?.total ?? '—'} icon={<LandPlot className="size-5" />} accent="ink" className="py-6" />
        <StatCard label="Available" value={counts?.available ?? '—'} icon={<CheckCircle2 className="size-5" />} accent="success" className="py-6" />
        <StatCard label="Booked" value={counts?.booked ?? '—'} icon={<UserPlus className="size-5" />} accent="ink" className="py-6" />
        <StatCard label="Sold" value={counts?.sold ?? '—'} icon={<LandPlot className="size-5" />} accent="gold" className="py-6" />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4">
          <div className="flex items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
              <Input
                className="pl-9"
                placeholder="Search by plot number or block"
                value={search}
                onChange={(e) => resetTo(() => setSearch(e.target.value))}
              />
            </div>
            {/* Select is w-full by default, so the wrapper sets its width */}
            <div className="w-56 shrink-0">
              <Select value={projectFilter} onChange={(e) => resetTo(() => setProjectFilter(e.target.value))}>
                <option value="">All projects</option>
                {projects?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 pb-0.5">
              {statusTabs.map((s) => {
                const active = statusFilter === s.value
                return (
                  <button
                    key={s.value || 'all'}
                    onClick={() => resetTo(() => setStatusFilter(s.value))}
                    className={clsx(
                      'flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      active ? 'border-ink-800 bg-ink-800 text-white' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:bg-ink-50',
                    )}
                  >
                    {s.dot && <span className={clsx('size-1.5 rounded-full', s.dot)} />}
                    {s.label}
                    {s.count !== undefined && (
                      <span className={clsx('rounded-full px-1.5 text-[10px] tabular-nums', active ? 'bg-white/15 text-gold-200' : 'bg-ink-100 text-ink-500')}>
                        {s.count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {hasFilters && (
              <button
                onClick={() =>
                  resetTo(() => {
                    setSearch('')
                    setProjectFilter('')
                    setStatusFilter('')
                  })
                }
                className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-ink-400 hover:bg-ink-50 hover:text-ink-700"
              >
                <X className="size-3.5" /> Clear filters
              </button>
            )}
          </div>
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
          emptyTitle={hasFilters ? 'No matching plots' : 'No plots yet'}
          emptySubtitle={hasFilters ? 'Try a different search or filter.' : 'Add plots one by one, or bulk import them from a CSV.'}
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
          <div className="grid grid-cols-2 gap-3">
            <FieldWrap label="Plot number" required>
              <Input autoFocus value={form.plot_number} onChange={(e) => setForm({ ...form, plot_number: e.target.value })} placeholder="e.g. A-101" />
            </FieldWrap>
            <FieldWrap label="Block / Sector">
              <Input value={form.block_sector} onChange={(e) => setForm({ ...form, block_sector: e.target.value })} placeholder="e.g. Sector 4" />
            </FieldWrap>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldWrap label="Size" required>
              <Input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} placeholder="e.g. 1200 sq.ft" />
            </FieldWrap>
            <FieldWrap label="Price" required hint={form.price ? formatCurrency(form.price) : undefined}>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">₹</span>
                <Input
                  type="number"
                  min={0}
                  className="pl-7"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="0"
                />
              </div>
            </FieldWrap>
          </div>
        </div>
      </Modal>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Bulk import plots"
        footer={
          bulkResult ? (
            <Button variant="secondary" onClick={() => setImportOpen(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setImportOpen(false)}>
                Cancel
              </Button>
              <Button variant="secondary" loading={bulkImport.isPending} onClick={submitImport} disabled={!importProject || !importFile}>
                Import plots
              </Button>
            </>
          )
        }
      >
        {bulkResult ? (
          <BulkResultView result={bulkResult} />
        ) : (
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
            <CsvDropzone file={importFile} onChange={setImportFile} columns={['plot_number', 'size', 'block_sector', 'price']} />
          </div>
        )}
      </Modal>

      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Bulk assign buyers"
        footer={
          bulkResult ? (
            <Button variant="secondary" onClick={() => setAssignOpen(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setAssignOpen(false)}>
                Cancel
              </Button>
              <Button variant="secondary" loading={bulkAssign.isPending} onClick={submitAssignCsv} disabled={!assignFile}>
                Assign buyers
              </Button>
            </>
          )
        }
      >
        {bulkResult ? (
          <BulkResultView result={bulkResult} />
        ) : (
          <CsvDropzone
            file={assignFile}
            onChange={setAssignFile}
            columns={['project', 'plot_number', 'email', 'role', 'name', 'phone', 'total_value', 'amount_paid_outside_app', 'instalment_count']}
          />
        )}
      </Modal>
    </div>
  )
}

function PlotStatusPill({ status }: { status: string }) {
  const meta = PLOT_STATUSES.find((s) => s.value === status)
  if (!meta) return <span className="text-xs text-ink-400">{status}</span>
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1', meta.pill)}>
      <span className={clsx('size-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

function BuyerCell({ plot }: { plot: Plot }) {
  const primary = plot.buyers.find((b) => b.plot_role === 'PRIMARY')
  const others = plot.buyers.length - (primary ? 1 : 0)
  if (!primary) {
    return (
      <span className="inline-flex items-center gap-2 text-xs text-ink-300">
        <span className="size-7 rounded-full border border-dashed border-ink-200" />
        Unassigned
      </span>
    )
  }
  const label = primary.name || primary.email
  const initials = label
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink-800 text-[10px] font-semibold text-gold-300">{initials}</span>
      <div className="min-w-0">
        <p className="max-w-[200px] truncate text-sm text-ink-800">{label}</p>
        {primary.name && <p className="max-w-[200px] truncate text-xs text-ink-400">{primary.email}</p>}
      </div>
      {others > 0 && (
        <span className="shrink-0 rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-500" title="Co-applicants">
          +{others}
        </span>
      )}
    </div>
  )
}

function CsvDropzone({ file, onChange, columns }: { file: File | null; onChange: (f: File | null) => void; columns: string[] }) {
  const input = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) onChange(dropped)
  }

  return (
    <div className="space-y-3">
      <span className="block text-xs font-medium text-ink-600">
        CSV file<span className="text-red-500"> *</span>
      </span>
      {file ? (
        <div className="flex items-center gap-3 rounded-lg border border-ink-200 p-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <FileSpreadsheet className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink-800">{file.name}</p>
            <p className="text-xs text-ink-400">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
          <button onClick={() => onChange(null)} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label="Remove file">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={clsx(
            'flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors',
            dragOver ? 'border-gold-400 bg-gold-50 text-gold-700' : 'border-ink-200 text-ink-400 hover:border-gold-400 hover:bg-gold-50/50 hover:text-gold-700',
          )}
        >
          <UploadCloud className="size-7" />
          <span className="text-sm font-medium">Drop a CSV here or click to browse</span>
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(e) => {
          onChange(e.target.files?.[0] ?? null)
          e.target.value = ''
        }}
      />
      <div>
        <p className="mb-1.5 text-xs text-ink-400">Expected columns</p>
        <div className="flex flex-wrap gap-1">
          {columns.map((c) => (
            <code key={c} className="rounded bg-ink-50 px-1.5 py-0.5 font-mono text-[11px] text-ink-600 ring-1 ring-ink-100">
              {c}
            </code>
          ))}
        </div>
      </div>
    </div>
  )
}

function BulkResultView({ result }: { result: BulkResult }) {
  const noun = result.kind === 'import' ? 'plot(s) imported' : 'buyer(s) assigned'
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-emerald-50 px-4 py-3">
          <p className="text-2xl font-semibold tabular-nums text-emerald-700">{result.ok}</p>
          <p className="text-xs text-emerald-700">{noun}</p>
        </div>
        <div className="rounded-lg bg-red-50 px-4 py-3">
          <p className="text-2xl font-semibold tabular-nums text-red-700">{result.errors.length}</p>
          <p className="text-xs text-red-700">row(s) failed</p>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-ink-100">
        <div className="flex items-center gap-2 border-b border-ink-100 bg-ink-50/60 px-3 py-2 text-xs font-semibold text-ink-500">
          <AlertTriangle className="size-3.5 text-amber-500" /> Rows that need fixing
        </div>
        <ul className="max-h-64 divide-y divide-ink-100 overflow-y-auto">
          {result.errors.map((e, i) => (
            <li key={i} className="flex gap-3 px-3 py-2 text-sm">
              <span className="shrink-0 font-mono text-xs leading-5 text-ink-400">Row {e.row}</span>
              <span className="text-ink-700">{e.error}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
