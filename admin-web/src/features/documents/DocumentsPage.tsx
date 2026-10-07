'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  Eye,
  EyeOff,
  FileText,
  Files,
  Landmark,
  Plus,
  Receipt,
  Scale,
  Search,
  Trash2,
  Upload,
  UserRound,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, StatCard } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Input, Select, FieldWrap } from '@/components/ui/Field'
import { Drawer, Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FilePreview } from '@/components/ui/FilePreview'
import { FileDropzone } from '@/components/ui/FileDropzone'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { absoluteMediaUrl, formatDate, formatDateTime } from '@/lib/format'
import { useAllProjects } from '@/features/projects/api'
import { useCustomerLookup } from '@/features/customers/api'
import type { CustomerListItem, DocumentItem, DocumentType } from '@/types'
import { downloadDocument, useCreateDocument, useDeleteDocument, useDocumentStats, useDocuments, useUpdateDocument } from './api'

const TYPE_META: Record<DocumentType, { label: string; plural: string; icon: ReactNode; tile: string; chip: string }> = {
  PAYMENT_RECEIPT: {
    label: 'Payment receipt',
    plural: 'Receipts',
    icon: <Receipt className="size-4" />,
    tile: 'bg-emerald-50 text-emerald-600',
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  },
  REGISTRY: { label: 'Registry', plural: 'Registry', icon: <Landmark className="size-4" />, tile: 'bg-sky-50 text-sky-600', chip: 'bg-sky-50 text-sky-700 ring-sky-200' },
  LEGAL: { label: 'Legal', plural: 'Legal', icon: <Scale className="size-4" />, tile: 'bg-violet-50 text-violet-600', chip: 'bg-violet-50 text-violet-700 ring-violet-200' },
  OTHER: { label: 'Other', plural: 'Other', icon: <FileText className="size-4" />, tile: 'bg-ink-50 text-ink-500', chip: 'bg-ink-50 text-ink-600 ring-ink-200' },
}

const NAME_PRESETS: Record<Exclude<DocumentType, 'PAYMENT_RECEIPT'>, string[]> = {
  REGISTRY: ['Sale Deed', 'Registry Copy', 'Mutation Certificate'],
  LEGAL: ['Allotment Letter', 'Agreement to Sell', 'Builder Buyer Agreement', 'NOC', 'Possession Letter'],
  OTHER: ['Welcome Letter', 'Site Visit Report'],
}

/** Customers only see documents attached to them (customer = me), so project-only documents never reach the app. */
type Visibility = 'visible' | 'hidden' | 'project-only'
const visibilityOf = (d: DocumentItem): Visibility => (!d.customer ? 'project-only' : d.is_visible_to_customer ? 'visible' : 'hidden')

export function DocumentsPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [project, setProject] = useState('')
  const [docType, setDocType] = useState<DocumentType | ''>('')
  const [status, setStatus] = useState('')
  const [visibility, setVisibility] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)

  const { data: projects } = useAllProjects()
  const { data: stats } = useDocumentStats(project || undefined)
  const { data, isLoading, error } = useDocuments({
    page,
    search: search || undefined,
    project: project || undefined,
    doc_type: docType || undefined,
    status: status || undefined,
    is_visible_to_customer: visibility || undefined,
  })
  const rows = data?.results ?? []
  const openDoc = rows.find((d) => d.id === openId) ?? null
  const hasFilters = !!(search || project || docType || status || visibility)

  const resetTo = (fn: () => void) => {
    setPage(1)
    fn()
  }

  const columns: Column<DocumentItem>[] = [
    {
      key: 'name',
      header: 'Document',
      render: (d) => (
        <div className="flex items-center gap-3">
          <span className={clsx('flex size-9 shrink-0 items-center justify-center rounded-lg', TYPE_META[d.doc_type].tile)}>{TYPE_META[d.doc_type].icon}</span>
          <div className="min-w-0">
            <p className="max-w-[260px] truncate font-medium text-ink-800">{d.name}</p>
            <p className="max-w-[260px] truncate text-xs text-ink-400">
              {d.doc_type === 'PAYMENT_RECEIPT' ? `Auto-generated${d.milestone_name ? ` · ${d.milestone_name}` : ''}` : TYPE_META[d.doc_type].label}
            </p>
          </div>
        </div>
      ),
    },
    { key: 'owner', header: 'Belongs to', render: (d) => <OwnerCell doc={d} /> },
    { key: 'status', header: 'Status', render: (d) => <StatusCell doc={d} /> },
    { key: 'visibility', header: 'In customer app', render: (d) => <VisibilityCell doc={d} /> },
    {
      key: 'added',
      header: 'Added',
      render: (d) => (
        <div>
          <p className="text-ink-600">{formatDate(d.created_at)}</p>
          <p className="max-w-[160px] truncate text-xs text-ink-400">{d.uploaded_by_email ?? (d.doc_type === 'PAYMENT_RECEIPT' ? 'System' : '—')}</p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-20',
      render: (d) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {d.file && <DownloadIconButton doc={d} />}
          <ChevronRight className="size-4 text-ink-300" />
        </div>
      ),
    },
  ]

  const typeTabs: { key: DocumentType | ''; label: string; count?: number }[] = [
    { key: '', label: 'All', count: stats?.total },
    ...(Object.keys(TYPE_META) as DocumentType[]).map((t) => ({ key: t, label: TYPE_META[t].plural, count: stats?.by_type[t] })),
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Documents"
        subtitle="Registry and legal documents for customers — payment receipts are generated automatically when a payment is approved"
        actions={
          <Button variant="secondary" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Upload document
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="All documents" value={stats?.total ?? '—'} icon={<Files className="size-5" />} accent="ink" className="py-6" />
        <StatCard label="Payment receipts (auto)" value={stats?.by_type.PAYMENT_RECEIPT ?? '—'} icon={<Receipt className="size-5" />} accent="success" className="py-6" />
        <StatCard
          label="Registry & legal"
          value={stats ? stats.by_type.REGISTRY + stats.by_type.LEGAL : '—'}
          icon={<Scale className="size-5" />}
          accent="gold"
          className="py-6"
        />
        <StatCard
          label={`In progress${stats?.missing_file ? ` · ${stats.missing_file} without a file` : ''}`}
          value={stats?.in_progress ?? '—'}
          icon={<Clock className="size-5" />}
          accent="danger"
          className="py-6"
        />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4">
          <div className="flex items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
              <Input
                className="pl-9"
                placeholder="Search by document, customer or plot"
                value={search}
                onChange={(e) => resetTo(() => setSearch(e.target.value))}
              />
            </div>
            {/* Select is w-full by default, so the wrappers set their width */}
            <div className="w-52 shrink-0">
              <Select value={project} onChange={(e) => resetTo(() => setProject(e.target.value))}>
                <option value="">All projects</option>
                {projects?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-36 shrink-0">
              <Select value={status} onChange={(e) => resetTo(() => setStatus(e.target.value))}>
                <option value="">Any status</option>
                <option value="ISSUED">Issued</option>
                <option value="IN_PROGRESS">In progress</option>
              </Select>
            </div>
            <div className="w-40 shrink-0">
              <Select value={visibility} onChange={(e) => resetTo(() => setVisibility(e.target.value))}>
                <option value="">Any visibility</option>
                <option value="true">Visible to customer</option>
                <option value="false">Hidden</option>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 pb-0.5">
              {typeTabs.map((t) => {
                const active = docType === t.key
                return (
                  <button
                    key={t.key || 'all'}
                    onClick={() => resetTo(() => setDocType(t.key))}
                    className={clsx(
                      'flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      active ? 'border-ink-800 bg-ink-800 text-white' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:bg-ink-50',
                    )}
                  >
                    {t.key && <span className={clsx('flex', active ? 'text-gold-300' : 'text-ink-400')}>{TYPE_META[t.key].icon}</span>}
                    {t.label}
                    {t.count !== undefined && (
                      <span className={clsx('rounded-full px-1.5 text-[10px] tabular-nums', active ? 'bg-white/15 text-gold-200' : 'bg-ink-100 text-ink-500')}>
                        {t.count}
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
                    setProject('')
                    setDocType('')
                    setStatus('')
                    setVisibility('')
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
          rows={rows}
          rowKey={(r) => r.id}
          isLoading={isLoading}
          error={error ? apiErrorMessage(error) : null}
          onRowClick={(d) => setOpenId(d.id)}
          page={page}
          onPageChange={setPage}
          count={data?.count}
          emptyTitle={hasFilters ? 'No matching documents' : 'No documents yet'}
          emptySubtitle={hasFilters ? 'Try a different search or filter.' : 'Upload a registry or legal document for a customer.'}
        />
      </Card>

      {openDoc && <DocumentDrawer doc={openDoc} onClose={() => setOpenId(null)} />}
      {createOpen && <UploadDocumentModal onClose={() => setCreateOpen(false)} onCreated={(id) => setOpenId(id)} />}
    </div>
  )
}

function OwnerCell({ doc: d }: { doc: DocumentItem }) {
  if (!d.customer) {
    return (
      <div className="flex items-center gap-2">
        <Building2 className="size-4 shrink-0 text-ink-300" />
        <div className="min-w-0">
          <p className="max-w-[200px] truncate text-ink-700">{d.project_name ?? 'No project'}</p>
          <p className="text-xs text-ink-400">Project-wide</p>
        </div>
      </div>
    )
  }
  return (
    <div className="min-w-0">
      <p className="max-w-[220px] truncate text-ink-800">{d.customer_name || d.customer_email}</p>
      <p className="max-w-[220px] truncate text-xs text-ink-400">
        {[d.plot_number, d.project_name].filter(Boolean).join(' · ') || d.customer_email}
      </p>
    </div>
  )
}

function StatusCell({ doc: d }: { doc: DocumentItem }) {
  if (d.status === 'ISSUED') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="size-3.5" /> Issued
      </span>
    )
  }
  return (
    <div>
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
        <Clock className="size-3.5" /> In progress
      </span>
      {!d.file && <p className="text-[11px] text-ink-400">No file yet</p>}
    </div>
  )
}

function VisibilityCell({ doc }: { doc: DocumentItem }) {
  const v = visibilityOf(doc)
  if (v === 'visible')
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-ink-600">
        <Eye className="size-3.5 text-emerald-600" /> Visible
      </span>
    )
  if (v === 'hidden')
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-ink-400">
        <EyeOff className="size-3.5" /> Hidden
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-amber-700" title="The app only shows documents attached to the customer, so project-wide documents aren't shown to anyone">
      <AlertTriangle className="size-3.5" /> Not in app
    </span>
  )
}

function DownloadIconButton({ doc }: { doc: DocumentItem }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  return (
    <button
      title="Download"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await downloadDocument(doc.id, `${doc.name}.pdf`)
        } catch (err) {
          toast.error(apiErrorMessage(err, 'Download failed'))
        } finally {
          setBusy(false)
        }
      }}
      className="flex size-8 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700 disabled:opacity-50"
    >
      {busy ? <Spinner className="size-4" /> : <Download className="size-4" />}
    </button>
  )
}

function DocumentDrawer({ doc: d, onClose }: { doc: DocumentItem; onClose: () => void }) {
  const toast = useToast()
  const update = useUpdateDocument()
  const remove = useDeleteDocument()
  const [replacement, setReplacement] = useState<File | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const v = visibilityOf(d)
  const isReceipt = d.doc_type === 'PAYMENT_RECEIPT'

  const patch = async (values: Parameters<typeof update.mutateAsync>[0]['values'], message: string) => {
    try {
      await update.mutateAsync({ id: d.id, values })
      toast.success(message)
      return true
    } catch (err) {
      toast.error(apiErrorMessage(err))
      return false
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={d.name}
      footer={
        <>
          <Button variant="ghost" className="mr-auto text-red-600 hover:bg-red-50" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" /> Delete
          </Button>
          {d.file && (
            <Button
              variant="secondary"
              loading={downloading}
              onClick={async () => {
                setDownloading(true)
                try {
                  await downloadDocument(d.id, `${d.name}.pdf`)
                } catch (err) {
                  toast.error(apiErrorMessage(err, 'Download failed'))
                } finally {
                  setDownloading(false)
                }
              }}
            >
              <Download className="size-4" /> Download
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1', TYPE_META[d.doc_type].chip)}>
            {TYPE_META[d.doc_type].icon}
            {TYPE_META[d.doc_type].label}
          </span>
          <StatusCell doc={d} />
        </div>

        {/* Preview, or a place to attach the file */}
        {d.file && !replacement ? (
          <div className="space-y-2">
            <FilePreview title={d.name} url={absoluteMediaUrl(d.file)} height={420} />
            {!isReceipt && (
              <FileDropzone file={replacement} onChange={setReplacement} accept="application/pdf,image/*" hint="Replace with a new version" compact />
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <FileDropzone file={replacement} onChange={setReplacement} accept="application/pdf,image/*" hint={d.file ? 'Replace the current file' : 'PDF or image — this document has no file yet'} />
            {replacement && (
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setReplacement(null)}>
                  Cancel
                </Button>
                <Button
                  variant="secondary"
                  loading={update.isPending}
                  onClick={async () => {
                    if (await patch({ file: replacement }, d.file ? 'File replaced' : 'File attached')) setReplacement(null)
                  }}
                >
                  <Upload className="size-4" /> {d.file ? 'Replace file' : 'Attach file'}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Quick actions */}
        <div className="space-y-2">
          {d.status === 'IN_PROGRESS' && (
            <ActionRow
              icon={<CheckCircle2 className="size-4 text-emerald-600" />}
              title="Mark as issued"
              body={d.file ? 'The document is final and ready for the customer.' : 'Attach the file first.'}
              action={
                <Button size="sm" variant="secondary" disabled={!d.file || update.isPending} onClick={() => patch({ status: 'ISSUED' }, 'Marked as issued')}>
                  Mark issued
                </Button>
              }
            />
          )}
          {v === 'project-only' ? (
            <ActionRow
              icon={<AlertTriangle className="size-4 text-amber-600" />}
              title="Not shown in the customer app"
              body="This document is attached to a project, not a customer. The app only lists documents attached to the signed-in customer."
            />
          ) : (
            <ActionRow
              icon={v === 'visible' ? <Eye className="size-4 text-emerald-600" /> : <EyeOff className="size-4 text-ink-400" />}
              title={v === 'visible' ? 'Visible to the customer' : 'Hidden from the customer'}
              body={v === 'visible' ? 'Shown in their Documents tab in the app.' : 'Only admins can see it.'}
              action={
                <Button
                  size="sm"
                  variant="outline"
                  disabled={update.isPending}
                  onClick={() => patch({ is_visible_to_customer: v !== 'visible' }, v === 'visible' ? 'Hidden from customer' : 'Now visible to customer')}
                >
                  {v === 'visible' ? 'Hide' : 'Show'}
                </Button>
              }
            />
          )}
        </div>

        <dl className="grid grid-cols-2 gap-4 text-sm">
          <Info
            label="Belongs to"
            value={
              d.customer ? (
                <Link href={`/customers/${d.customer}`} className="inline-flex items-center gap-1 text-ink-800 hover:text-gold-700">
                  <UserRound className="size-3.5 text-ink-400" /> {d.customer_name || d.customer_email}
                </Link>
              ) : (
                'Project-wide'
              )
            }
          />
          <Info label="Project" value={d.project_name ?? '—'} />
          {d.plot_number && <Info label="Plot" value={d.plot_number} />}
          {d.milestone_name && <Info label="Milestone" value={d.milestone_name} />}
          <Info label="Added" value={`${formatDateTime(d.created_at)}${d.uploaded_by_email ? ` · ${d.uploaded_by_email}` : isReceipt ? ' · system' : ''}`} full />
          {d.updated_at !== d.created_at && <Info label="Last changed" value={formatDateTime(d.updated_at)} full />}
        </dl>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete document"
        message={
          isReceipt
            ? `"${d.name}" is the customer's payment receipt. Deleting it removes it from their app and it won't be regenerated.`
            : `Delete "${d.name}"? ${v === 'visible' ? 'The customer will no longer see it.' : ''}`
        }
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(d.id)
            toast.success('Document deleted')
            onClose()
          } catch (err) {
            toast.error(apiErrorMessage(err))
          }
        }}
      />
    </Drawer>
  )
}

function ActionRow({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-ink-100 px-3 py-2.5">
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink-800">{title}</p>
        <p className="text-xs text-ink-400">{body}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

function Info({ label, value, full }: { label: string; value: ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : undefined}>
      <dt className="text-xs text-ink-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink-700">{value}</dd>
    </div>
  )
}

function UploadDocumentModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const toast = useToast()
  const create = useCreateDocument()
  const { data: projects } = useAllProjects()
  const [target, setTarget] = useState<'customer' | 'project'>('customer')
  const [customer, setCustomer] = useState<CustomerListItem | null>(null)
  const [projectId, setProjectId] = useState('')
  const [docType, setDocType] = useState<Exclude<DocumentType, 'PAYMENT_RECEIPT'>>('REGISTRY')
  const [name, setName] = useState('')
  const [status, setStatus] = useState<'ISSUED' | 'IN_PROGRESS'>('ISSUED')
  const [visible, setVisible] = useState(true)
  const [file, setFile] = useState<File | null>(null)

  const owned = target === 'customer' ? !!customer : !!projectId
  const valid = owned && name.trim() && (status === 'IN_PROGRESS' || file)

  const submit = async () => {
    try {
      const created = await create.mutateAsync({
        customer: target === 'customer' ? customer?.id : undefined,
        project: target === 'project' ? Number(projectId) : undefined,
        name: name.trim(),
        doc_type: docType,
        status,
        file: file ?? undefined,
        is_visible_to_customer: target === 'customer' ? visible : false,
      })
      toast.success('Document uploaded')
      onClose()
      onCreated(created.id)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Upload document"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" loading={create.isPending} onClick={submit} disabled={!valid}>
            <Upload className="size-4" /> Upload
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <section className="space-y-3">
          <Segmented
            value={target}
            onChange={setTarget}
            options={[
              { value: 'customer', label: 'For a customer', icon: <UserRound className="size-3.5" /> },
              { value: 'project', label: 'Project-wide', icon: <Building2 className="size-3.5" /> },
            ]}
          />
          {target === 'customer' ? (
            <CustomerSearch value={customer} onChange={setCustomer} />
          ) : (
            <>
              <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Select project</option>
                {projects?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <p className="flex gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                Project-wide documents are kept for admins only — the customer app lists documents attached to each customer.
              </p>
            </>
          )}
        </section>

        <section className="space-y-3">
          <FieldWrap label="Type">
            <Segmented
              value={docType}
              onChange={(t) => {
                setDocType(t)
                if (!name || Object.values(NAME_PRESETS).flat().includes(name)) setName('')
              }}
              options={(['REGISTRY', 'LEGAL', 'OTHER'] as const).map((t) => ({ value: t, label: TYPE_META[t].label, icon: TYPE_META[t].icon }))}
            />
          </FieldWrap>
          <FieldWrap label="Document name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sale Deed" />
          </FieldWrap>
          <div className="flex flex-wrap gap-1.5">
            {NAME_PRESETS[docType].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setName(p)}
                className={clsx(
                  'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                  name === p ? 'border-gold-400 bg-gold-50 text-gold-800' : 'border-ink-200 text-ink-500 hover:border-ink-300 hover:bg-ink-50',
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <FieldWrap label="File" required={status === 'ISSUED'}>
            <FileDropzone file={file} onChange={setFile} accept="application/pdf,image/*" hint={status === 'ISSUED' ? 'PDF or image' : 'Optional while in progress'} />
          </FieldWrap>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldWrap label="Status">
              <Segmented
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'ISSUED', label: 'Issued', icon: <CheckCircle2 className="size-3.5" /> },
                  { value: 'IN_PROGRESS', label: 'In progress', icon: <Clock className="size-3.5" /> },
                ]}
              />
            </FieldWrap>
            {target === 'customer' && (
              <FieldWrap label="Customer app">
                <label className="flex h-[38px] cursor-pointer items-center justify-between gap-3 rounded-lg border border-ink-200 px-3">
                  <span className="text-sm text-ink-700">{visible ? 'Visible to customer' : 'Hidden'}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={visible}
                    onClick={() => setVisible(!visible)}
                    className={clsx('relative h-5 w-9 shrink-0 rounded-full transition-colors', visible ? 'bg-gold-500' : 'bg-ink-200')}
                  >
                    <span className={clsx('absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform', visible ? 'translate-x-4.5' : 'translate-x-0.5')} />
                  </button>
                </label>
              </FieldWrap>
            )}
          </div>
        </section>
      </div>
    </Modal>
  )
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: ReactNode }[] }) {
  return (
    <div className="grid gap-1 rounded-lg border border-ink-200 bg-ink-50/50 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx(
            'flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
            value === o.value ? 'bg-white text-ink-800 shadow-sm ring-1 ring-ink-100' : 'text-ink-500 hover:text-ink-700',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Debounced customer search with a pick list; shows the picked customer as a card. */
function CustomerSearch({ value, onChange }: { value: CustomerListItem | null; onChange: (c: CustomerListItem | null) => void }) {
  const [text, setText] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 250)
    return () => clearTimeout(t)
  }, [text])
  const { data, isFetching } = useCustomerLookup(debounced, !value && !!debounced)

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-gold-300 bg-gold-50/50 p-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink-800 text-xs font-semibold text-gold-300">
          {(value.name || value.email).slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-800">{value.name || value.email}</p>
          <p className="truncate text-xs text-ink-500">
            {value.email}
            {value.plot_number && ` · ${value.plot_number} · ${value.project_name}`}
          </p>
        </div>
        <button type="button" onClick={() => onChange(null)} className="rounded-lg p-1 text-ink-400 hover:bg-white hover:text-ink-700" aria-label="Change customer">
          <X className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
        <Input autoFocus className="pl-9 pr-9" placeholder="Search customer by name, email, phone or plot" value={text} onChange={(e) => setText(e.target.value)} />
        {isFetching && <Spinner className="absolute right-3 top-1/2 size-4 -translate-y-1/2" />}
      </div>
      {debounced && (
        <ul className="max-h-52 divide-y divide-ink-100 overflow-y-auto rounded-lg border border-ink-100">
          {data?.results.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onChange(c)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-gold-50/60">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink-800">{c.name || c.email}</p>
                  <p className="truncate text-xs text-ink-400">{c.email}</p>
                </div>
                <span className="shrink-0 text-xs text-ink-400">{c.plot_number ?? 'No plot'}</span>
              </button>
            </li>
          ))}
          {data?.results.length === 0 && <li className="px-3 py-4 text-center text-xs text-ink-400">No customers match.</li>}
        </ul>
      )}
    </div>
  )
}
