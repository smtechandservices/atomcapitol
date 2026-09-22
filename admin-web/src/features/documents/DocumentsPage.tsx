'use client'

import { useState } from 'react'
import { Plus, Search, Trash2, ExternalLink } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Input, Select, FieldWrap } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { absoluteMediaUrl, formatDate } from '@/lib/format'
import type { DocumentItem } from '@/types'
import { useCreateDocument, useDeleteDocument, useDocuments } from './api'
import { useCustomers } from '@/features/customers/api'

export function DocumentsPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [docType, setDocType] = useState('')
  const [status, setStatus] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null)

  const toast = useToast()
  const { data, isLoading, error } = useDocuments({ page, search: search || undefined, doc_type: docType || undefined, status: status || undefined })
  const deleteDocument = useDeleteDocument()

  const columns: Column<DocumentItem>[] = [
    { key: 'name', header: 'Name', render: (d) => <span className="font-medium text-ink-800">{d.name}</span> },
    { key: 'customer', header: 'Customer', render: (d) => d.customer_email ?? '—' },
    { key: 'type', header: 'Type', render: (d) => <Badge>{d.doc_type}</Badge> },
    { key: 'status', header: 'Status', render: (d) => <Badge tone={d.status === 'ISSUED' ? 'success' : 'warning'}>{d.status}</Badge> },
    { key: 'date', header: 'Uploaded', render: (d) => formatDate(d.created_at) },
    {
      key: 'actions',
      header: '',
      render: (d) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {d.file && (
            <a href={absoluteMediaUrl(d.file) ?? undefined} target="_blank" rel="noreferrer" className="text-ink-400 hover:text-ink-700">
              <ExternalLink className="size-4" />
            </a>
          )}
          <button onClick={() => setDeleteTarget(d)} className="text-ink-400 hover:text-red-600">
            <Trash2 className="size-4" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Documents"
        subtitle="Registry & legal documents; payment receipts auto-generate on payment approval"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Upload document
          </Button>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 p-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
            <Input
              className="pl-9"
              placeholder="Search by name or customer email"
              value={search}
              onChange={(e) => {
                setPage(1)
                setSearch(e.target.value)
              }}
            />
          </div>
          <Select
            className="w-48"
            value={docType}
            onChange={(e) => {
              setPage(1)
              setDocType(e.target.value)
            }}
          >
            <option value="">All types</option>
            <option value="PAYMENT_RECEIPT">Payment receipt</option>
            <option value="REGISTRY">Registry</option>
            <option value="LEGAL">Legal</option>
            <option value="OTHER">Other</option>
          </Select>
          <Select
            className="w-40"
            value={status}
            onChange={(e) => {
              setPage(1)
              setStatus(e.target.value)
            }}
          >
            <option value="">All statuses</option>
            <option value="ISSUED">Issued</option>
            <option value="IN_PROGRESS">In progress</option>
          </Select>
        </div>
        <DataTable
          columns={columns}
          rows={data?.results ?? []}
          rowKey={(r) => r.id}
          isLoading={isLoading}
          error={error ? apiErrorMessage(error) : null}
          page={page}
          onPageChange={setPage}
          count={data?.count}
        />
      </Card>

      {createOpen && <CreateDocumentModal onClose={() => setCreateOpen(false)} />}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete document"
        message={`Remove "${deleteTarget?.name}"? The customer will no longer be able to see it.`}
        confirmLabel="Delete"
        danger
        loading={deleteDocument.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return
          try {
            await deleteDocument.mutateAsync(deleteTarget.id)
            toast.success('Document deleted')
            setDeleteTarget(null)
          } catch (err) {
            toast.error(apiErrorMessage(err))
          }
        }}
      />
    </div>
  )
}

function CreateDocumentModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const createDocument = useCreateDocument()
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [docType, setDocType] = useState('REGISTRY')
  const [status, setStatus] = useState('IN_PROGRESS')
  const [file, setFile] = useState<File | null>(null)

  const { data: customers } = useCustomers({ search: customerSearch || undefined, page: 1 })

  const submit = async () => {
    if (!customerId || !name) return
    try {
      await createDocument.mutateAsync({ customer: customerId, name, doc_type: docType, status, file: file ?? undefined, is_visible_to_customer: true })
      toast.success('Document uploaded')
      onClose()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Upload document"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" loading={createDocument.isPending} onClick={submit} disabled={!customerId || !name}>
            Upload
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FieldWrap label="Customer" required hint="Search by email or name, then pick a match">
          <Input placeholder="buyer@example.com" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} />
          {customerSearch && (
            <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-ink-100">
              {customers?.results.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setCustomerId(c.id)
                    setCustomerSearch(`${c.name || c.email} (${c.email})`)
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gold-50"
                >
                  {c.name || '—'} &middot; {c.email}
                </button>
              ))}
            </div>
          )}
        </FieldWrap>
        <FieldWrap label="Document name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sale Deed" />
        </FieldWrap>
        <div className="grid grid-cols-2 gap-3">
          <FieldWrap label="Type">
            <Select value={docType} onChange={(e) => setDocType(e.target.value)}>
              <option value="REGISTRY">Registry</option>
              <option value="LEGAL">Legal</option>
              <option value="OTHER">Other</option>
            </Select>
          </FieldWrap>
          <FieldWrap label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="ISSUED">Issued</option>
              <option value="IN_PROGRESS">In progress</option>
            </Select>
          </FieldWrap>
        </div>
        <FieldWrap label="File" hint="Optional while marked In progress">
          <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block text-sm" />
        </FieldWrap>
      </div>
    </Modal>
  )
}
