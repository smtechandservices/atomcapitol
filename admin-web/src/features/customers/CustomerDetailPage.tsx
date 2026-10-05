'use client'

import { useState, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select, FieldWrap } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { ErrorState, EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format'
import { useCustomer, useUpdateCustomer } from './api'
import { useMilestones } from '@/features/payments/api'
import { useDocuments } from '@/features/documents/api'
import { useTickets } from '@/features/tickets/api'
import { useAllSalesPeople, useSalesPerson } from '@/features/sales/api'

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const toast = useToast()
  const { data: customer, isLoading, error } = useCustomer(id)
  const updateCustomer = useUpdateCustomer(Number(id))
  const { data: salesPeople } = useAllSalesPeople()
  const salesPerson = useSalesPerson(customer?.assigned_sales_person)

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', address: '', is_active: true, assigned_sales_person: '' })

  const plotId = customer?.plot?.id
  const milestones = useMilestones({ plot: plotId })
  const documents = useDocuments({ customer: id })
  const tickets = useTickets({ search: customer?.email })

  if (isLoading) return <FullPageSpinner />
  if (error || !customer) return <ErrorState message={apiErrorMessage(error, 'Customer not found')} />

  const startEdit = () => {
    setForm({
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      is_active: customer.is_active,
      assigned_sales_person: customer.assigned_sales_person ? String(customer.assigned_sales_person) : '',
    })
    setEditing(true)
  }

  const save = async () => {
    try {
      await updateCustomer.mutateAsync({
        name: form.name,
        phone: form.phone,
        address: form.address,
        is_active: form.is_active,
        assigned_sales_person: form.assigned_sales_person ? Number(form.assigned_sales_person) : null,
      })
      toast.success('Customer updated')
      setEditing(false)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <div>
      <button onClick={() => router.push('/customers')} className="mb-3 flex items-center gap-1 text-sm text-ink-400 hover:text-ink-700">
        <ArrowLeft className="size-4" /> Back to customers
      </button>
      <PageHeader
        title={customer.name || customer.email}
        subtitle={customer.email}
        actions={<Badge>{customer.kyc_status}</Badge>}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader
              title="Profile"
              actions={
                !editing ? (
                  <Button size="sm" variant="outline" onClick={startEdit}>
                    Edit
                  </Button>
                ) : undefined
              }
            />
            <CardBody>
              {editing ? (
                <div className="space-y-4">
                  <FieldWrap label="Name">
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </FieldWrap>
                  <FieldWrap label="Phone">
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </FieldWrap>
                  <FieldWrap label="Address">
                    <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                  </FieldWrap>
                  <FieldWrap label="Assigned sales person">
                    <Select value={form.assigned_sales_person} onChange={(e) => setForm({ ...form, assigned_sales_person: e.target.value })}>
                      <option value="">None</option>
                      {salesPeople?.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </FieldWrap>
                  <FieldWrap label="Active">
                    <Select value={form.is_active ? 'true' : 'false'} onChange={(e) => setForm({ ...form, is_active: e.target.value === 'true' })}>
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </Select>
                  </FieldWrap>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                    <Button variant="secondary" loading={updateCustomer.isPending} onClick={save}>
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <Info label="Phone" value={customer.phone || '—'} />
                  <Info label="Active" value={<Badge tone={customer.is_active ? 'success' : 'neutral'}>{customer.is_active ? 'Yes' : 'No'}</Badge>} />
                  <Info label="Address" value={customer.address || '—'} full />
                  <Info label="Created" value={formatDateTime(customer.created_at)} />
                  <Info label="Last login" value={formatDateTime(customer.last_login_at)} />
                </dl>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Milestones & payments" subtitle={customer.plot ? undefined : 'No plot assigned yet'} />
            <CardBody className="p-0">
              {!customer.plot ? (
                <EmptyState title="No plot assigned" />
              ) : (milestones.data?.results.length ?? 0) === 0 ? (
                <EmptyState title="No milestones generated yet" />
              ) : (
                <ul className="divide-y divide-ink-100">
                  {milestones.data?.results.map((m) => (
                    <li key={m.id} className="flex items-center justify-between px-5 py-3 text-sm">
                      <div>
                        <p className="font-medium text-ink-700">{m.name}</p>
                        <p className="text-xs text-ink-400">Due {formatDate(m.due_date)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-ink-700">{formatCurrency(m.amount)}</p>
                        <Badge>{m.status}</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Documents" />
            <CardBody className="p-0">
              {(documents.data?.results.length ?? 0) === 0 ? (
                <EmptyState title="No documents yet" />
              ) : (
                <ul className="divide-y divide-ink-100">
                  {documents.data?.results.map((d) => (
                    <li key={d.id} className="flex items-center justify-between px-5 py-3 text-sm">
                      <div>
                        <p className="font-medium text-ink-700">{d.name}</p>
                        <p className="text-xs text-ink-400">{d.doc_type.replaceAll('_', ' ')}</p>
                      </div>
                      <Badge tone={d.status === 'ISSUED' ? 'success' : 'warning'}>{d.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Tickets" subtitle="Matched by email — see full thread in Tickets" />
            <CardBody className="p-0">
              {(tickets.data?.results.length ?? 0) === 0 ? (
                <EmptyState title="No tickets raised" />
              ) : (
                <ul className="divide-y divide-ink-100">
                  {tickets.data?.results.map((t) => (
                    <li key={t.id}>
                      <Link href={`/tickets/${t.id}`} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-gold-50/60">
                        <div>
                          <p className="font-medium text-ink-700">{t.subject}</p>
                          <p className="text-xs text-ink-400">{t.category}</p>
                        </div>
                        <Badge>{t.status}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Plot" />
            <CardBody>
              {customer.plot ? (
                <dl className="space-y-3 text-sm">
                  <Info label="Project" value={customer.plot.project_name} />
                  <Info label="Plot" value={customer.plot.plot_number} />
                  <Info label="Size" value={customer.plot.size} />
                  <Info label="Role" value={customer.plot_role ?? '—'} />
                  <Info label="Status" value={<Badge>{customer.plot.status}</Badge>} />
                </dl>
              ) : (
                <p className="text-sm text-ink-400">
                  No plot assigned. Assign one from{' '}
                  <Link href="/plots" className="text-gold-700 underline">
                    Plot Inventory
                  </Link>
                  .
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Sales contact" />
            <CardBody>
              {salesPerson.data ? (
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-ink-700">{salesPerson.data.name}</p>
                  <p className="text-ink-500">{salesPerson.data.phone}</p>
                  <p className="text-ink-500">{salesPerson.data.email}</p>
                </div>
              ) : (
                <p className="text-sm text-ink-400">No sales person assigned.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
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
