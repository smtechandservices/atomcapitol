'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Input, Select, FieldWrap } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import type { CustomerListItem } from '@/types'
import { useCreateCustomer, useCustomers, type CustomerCreateValues } from './api'

const emptyForm: CustomerCreateValues = { email: '', name: '', phone: '', address: '' }

export function CustomersPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [kycStatus, setKycStatus] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<CustomerCreateValues>(emptyForm)

  const router = useRouter()
  const toast = useToast()
  const { data, isLoading, error } = useCustomers({ page, search: search || undefined, kyc_status: kycStatus || undefined })
  const createCustomer = useCreateCustomer()

  const columns: Column<CustomerListItem>[] = [
    { key: 'name', header: 'Name', render: (c) => <span className="font-medium text-ink-800">{c.name || '—'}</span> },
    { key: 'email', header: 'Email', render: (c) => c.email },
    { key: 'project', header: 'Project', render: (c) => c.project_name ?? '—' },
    { key: 'plot', header: 'Plot', render: (c) => c.plot_number ?? '—' },
    { key: 'kyc', header: 'KYC status', render: (c) => <Badge>{c.kyc_status}</Badge> },
    { key: 'sales', header: 'Sales person', render: (c) => c.sales_person_name ?? '—' },
    { key: 'active', header: 'Active', render: (c) => <Badge tone={c.is_active ? 'success' : 'neutral'}>{c.is_active ? 'Yes' : 'No'}</Badge> },
  ]

  const submit = async () => {
    try {
      const created = await createCustomer.mutateAsync(form)
      toast.success('Customer created — assign a plot next from Plot Inventory')
      setCreateOpen(false)
      setForm(emptyForm)
      router.push(`/customers/${created.id}`)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Every buyer on record — invite new ones, then assign a plot from Plot Inventory"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Add / Invite customer
          </Button>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 p-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
            <Input
              className="pl-9"
              placeholder="Search by name, email, phone or plot"
              value={search}
              onChange={(e) => {
                setPage(1)
                setSearch(e.target.value)
              }}
            />
          </div>
          <Select
            className="w-48"
            value={kycStatus}
            onChange={(e) => {
              setPage(1)
              setKycStatus(e.target.value)
            }}
          >
            <option value="">All KYC statuses</option>
            <option value="NOT_STARTED">Not started</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </Select>
        </div>
        <DataTable
          columns={columns}
          rows={data?.results ?? []}
          rowKey={(r) => r.id}
          isLoading={isLoading}
          error={error ? apiErrorMessage(error) : null}
          onRowClick={(row) => router.push(`/customers/${row.id}`)}
          page={page}
          onPageChange={setPage}
          count={data?.count}
        />
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add / Invite customer"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="secondary" loading={createCustomer.isPending} onClick={submit} disabled={!form.email}>
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FieldWrap label="Email" required hint="This is what makes the email valid for app login once a plot is assigned">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </FieldWrap>
          <FieldWrap label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FieldWrap>
          <FieldWrap label="Phone">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </FieldWrap>
          <FieldWrap label="Address">
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </FieldWrap>
        </div>
      </Modal>
    </div>
  )
}
