'use client'

import { useState, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CalendarDays, Check, Copy, LandPlot, Lock, LogIn, Mail, MapPin, Pencil, Phone, Plus, Trash2, UserRound } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select, FieldWrap, Textarea } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { ErrorState, EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { absoluteMediaUrl, formatAge, formatCurrency, formatDate, formatDateTime } from '@/lib/format'
import { useCustomer, useUpdateCustomer } from './api'
import { useMilestones } from '@/features/payments/api'
import { useDocuments } from '@/features/documents/api'
import { useTickets } from '@/features/tickets/api'
import { useAllSalesPeople, useSalesPerson } from '@/features/sales/api'
import { useAssignToPlot } from '@/features/plots/api'
import { useCan } from '@/lib/permissions'
import { DeleteCustomerModal } from './DeleteCustomerModal'
import { AccountControls } from './AccountControls'
import { AssignPlotFields, assignPlotReady, emptyAssignPlot, toAssignPayload, type AssignPlotValue } from '@/features/plots/AssignPlotFields'

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const toast = useToast()
  const { data: customer, isLoading, error } = useCustomer(id)
  const updateCustomer = useUpdateCustomer(Number(id))
  // Customer pages are open to Support and Accounts, but milestones/documents/sales are Accounts-only
  // and tickets are Support-only on the backend — only load (and show) what this role can read.
  const can = useCan()
  const canPay = can('payments')
  const canDocs = can('documents')
  const canTickets = can('tickets')
  const canSales = can('sales')
  const canPlots = can('projects')
  const canEdit = can('customerEdit')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const { data: salesPeople } = useAllSalesPeople(canSales)
  const salesPerson = useSalesPerson(canSales ? customer?.assigned_sales_person : null)

  const [editing, setEditing] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assign, setAssign] = useState<AssignPlotValue>(emptyAssignPlot)
  const assignToPlot = useAssignToPlot()
  const [form, setForm] = useState({ name: '', phone: '', address: '' })
  const [pickingSales, setPickingSales] = useState(false)
  const [salesChoice, setSalesChoice] = useState('')

  const plotId = customer?.plot?.id
  const milestones = useMilestones({ plot: canPay ? plotId : undefined })
  const documents = useDocuments({ customer: id }, canDocs)
  const tickets = useTickets({ search: customer?.email }, canTickets && !!customer?.email)

  if (isLoading) return <FullPageSpinner />
  if (error || !customer) return <ErrorState message={apiErrorMessage(error, 'Customer not found')} />

  const startEdit = () => {
    setForm({
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
    })
    setEditing(true)
  }

  const save = async () => {
    try {
      await updateCustomer.mutateAsync({
        name: form.name,
        phone: form.phone,
        address: form.address,
      })
      toast.success('Customer updated')
      setEditing(false)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const setSalesPerson = async (salesId: number | null) => {
    try {
      await updateCustomer.mutateAsync({ assigned_sales_person: salesId })
      toast.success(salesId ? 'Sales person assigned' : 'Sales person removed')
      setPickingSales(false)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const startPickingSales = () => {
    setSalesChoice(customer.assigned_sales_person ? String(customer.assigned_sales_person) : '')
    setPickingSales(true)
  }

  const closeAssign = () => {
    setAssignOpen(false)
    setAssign(emptyAssignPlot)
  }

  const submitAssign = async () => {
    if (!assign.plot) return
    try {
      await assignToPlot.mutateAsync({ plotId: assign.plot.id, payload: toAssignPayload(customer.email, assign) })
      toast.success(`Assigned to plot ${assign.plot.plot_number}`)
      closeAssign()
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
                !editing && canEdit ? (
                  <Button size="sm" variant="outline" onClick={startEdit}>
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                ) : undefined
              }
            />
            <CardBody>
              {editing ? (
                <div className="space-y-4">
                  <FieldWrap label="Email" hint="The customer's app sign-in — it can't be changed here.">
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
                      <Input value={customer.email} readOnly disabled className="pl-9 pr-9" />
                      <Lock className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-300" />
                    </div>
                  </FieldWrap>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FieldWrap label="Full name">
                      <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </FieldWrap>
                    <FieldWrap label="Phone">
                      <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91" />
                    </FieldWrap>
                  </div>
                  <FieldWrap label="Address">
                    <Textarea className="min-h-20" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                  </FieldWrap>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                    <Button variant="secondary" loading={updateCustomer.isPending} onClick={save}>
                      Save changes
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Identity */}
                  <div className="flex items-center gap-4">
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-ink-800 text-lg font-semibold text-gold-300">
                      {(customer.name || customer.email)
                        .split(/[\s@.]+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((w) => w[0]?.toUpperCase())
                        .join('')}
                    </span>
                    <div className="min-w-0">
                      <p className={customer.name ? 'truncate text-lg font-semibold text-ink-900' : 'text-lg italic text-ink-400'}>{customer.name || 'No name'}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <KycChip status={customer.kyc_status} />
                        {customer.plot_role && (
                          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600">
                            {customer.plot_role === 'PRIMARY' ? 'Primary buyer' : 'Co-applicant'}
                          </span>
                        )}
                        {/* Super admins see app access in Account controls instead */}
                        {!canEdit && (
                          <span className={customer.is_active ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700' : 'rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-500'}>
                            {customer.is_active ? 'App access on' : 'App access off'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Contact */}
                  <ul className="divide-y divide-ink-100 rounded-lg border border-ink-100">
                    <ContactRow icon={<Mail className="size-4" />} label="Email" href={`mailto:${customer.email}`} value={customer.email} copy />
                    <ContactRow icon={<Phone className="size-4" />} label="Phone" href={customer.phone ? `tel:${customer.phone}` : undefined} value={customer.phone} copy />
                    <ContactRow icon={<MapPin className="size-4" />} label="Address" value={customer.address} multiline />
                  </ul>

                  {/* Meta */}
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-400">
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="size-3.5" /> Customer since {formatDate(customer.created_at)}
                    </span>
                    <span className="flex items-center gap-1.5" title={customer.last_login_at ? formatDateTime(customer.last_login_at) : undefined}>
                      <LogIn className="size-3.5" />
                      {customer.last_login_at ? `Last app sign-in ${formatAge(customer.last_login_at)} ago` : 'Never signed in to the app'}
                    </span>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          {canPay && (
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
          )}

          {canDocs && (
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
          )}
        </div>

        <div className="space-y-5">
          {canEdit && <AccountControls key={`${customer.kyc_status}-${customer.is_active}`} customer={customer} />}

          <Card>
            <CardHeader
              title="Plot"
              actions={
                customer.plot && canPlots ? (
                  <Link href="/plots" className="text-xs font-medium text-ink-500 hover:text-ink-800">
                    Manage
                  </Link>
                ) : undefined
              }
            />
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
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-ink-200 px-4 py-6 text-center">
                  <LandPlot className="size-6 text-ink-300" />
                  <p className="text-sm font-medium text-ink-600">No plot assigned</p>
                  <p className="text-xs text-ink-400">
                    {customer.is_active ? 'Assigning a plot gives this email app access.' : 'App access is revoked until a plot is assigned.'}
                  </p>
                  {canPlots && (
                    <Button size="sm" variant="secondary" className="mt-1" onClick={() => setAssignOpen(true)}>
                      <Plus className="size-3.5" /> Assign plot
                    </Button>
                  )}
                </div>
              )}
            </CardBody>
          </Card>

          {canSales && (
          <Card>
            <CardHeader
              title="Sales contact"
              actions={
                customer.assigned_sales_person && !pickingSales ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={startPickingSales}>
                      Change
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:bg-red-50"
                      loading={updateCustomer.isPending}
                      onClick={() => setSalesPerson(null)}
                    >
                      Remove
                    </Button>
                  </>
                ) : undefined
              }
            />
            <CardBody>
              {pickingSales ? (
                <div className="space-y-3">
                  <Select value={salesChoice} onChange={(e) => setSalesChoice(e.target.value)} autoFocus>
                    <option value="">Select sales person</option>
                    {salesPeople
                      ?.filter((sp) => sp.is_active || sp.id === customer.assigned_sales_person)
                      .map((sp) => (
                        <option key={sp.id} value={sp.id}>
                          {sp.name} · {sp.customer_count} customer{sp.customer_count === 1 ? '' : 's'}
                        </option>
                      ))}
                  </Select>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setPickingSales(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={updateCustomer.isPending}
                      disabled={!salesChoice || salesChoice === String(customer.assigned_sales_person ?? '')}
                      onClick={() => setSalesPerson(Number(salesChoice))}
                    >
                      {customer.assigned_sales_person ? 'Save' : 'Assign'}
                    </Button>
                  </div>
                </div>
              ) : salesPerson.data ? (
                <div className="flex items-start gap-3">
                  {salesPerson.data.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- dynamic Django media host, not a next/image candidate
                    <img src={absoluteMediaUrl(salesPerson.data.photo) ?? undefined} alt="" className="size-10 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gold-100 text-gold-700">
                      <UserRound className="size-5" />
                    </span>
                  )}
                  <div className="min-w-0 space-y-1 text-sm">
                    <p className="font-medium text-ink-800">{salesPerson.data.name}</p>
                    {salesPerson.data.phone && (
                      <a href={`tel:${salesPerson.data.phone}`} className="flex items-center gap-1.5 text-ink-500 hover:text-ink-800">
                        <Phone className="size-3.5" /> {salesPerson.data.phone}
                      </a>
                    )}
                    {salesPerson.data.email && (
                      <a href={`mailto:${salesPerson.data.email}`} className="flex items-center gap-1.5 truncate text-ink-500 hover:text-ink-800">
                        <Mail className="size-3.5 shrink-0" /> <span className="truncate">{salesPerson.data.email}</span>
                      </a>
                    )}
                  </div>
                </div>
              ) : customer.assigned_sales_person ? (
                <p className="text-sm text-ink-400">Loading…</p>
              ) : (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-ink-200 px-4 py-5 text-center">
                  <UserRound className="size-6 text-ink-300" />
                  <p className="text-sm text-ink-500">No sales person assigned</p>
                  <Button size="sm" variant="outline" onClick={startPickingSales}>
                    <Plus className="size-3.5" /> Assign sales person
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>
          )}

          {canTickets && (
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
          )}

          {canEdit && (
            <Card className="border-red-100">
              <CardBody className="space-y-2">
                <p className="text-sm font-semibold text-red-700">Danger zone</p>
                <p className="text-xs text-ink-500">Only for wrongly created customers with no plot and no history. Otherwise unassign or mark them inactive.</p>
                <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="size-3.5" /> Delete customer
                </Button>
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      {deleteOpen && <DeleteCustomerModal customer={customer} onClose={() => setDeleteOpen(false)} />}

      <Modal
        open={assignOpen}
        onClose={closeAssign}
        title={`Assign plot to ${customer.name || customer.email}`}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={closeAssign}>
              Cancel
            </Button>
            <Button variant="secondary" loading={assignToPlot.isPending} onClick={submitAssign} disabled={!assignPlotReady(assign)}>
              Assign plot
            </Button>
          </>
        }
      >
        <AssignPlotFields value={assign} onChange={setAssign} />
      </Modal>
    </div>
  )
}

const KYC_CHIP: Record<string, { label: string; cls: string }> = {
  NOT_STARTED: { label: 'KYC not started', cls: 'bg-ink-100 text-ink-600' },
  SUBMITTED: { label: 'KYC submitted', cls: 'bg-sky-50 text-sky-700' },
  APPROVED: { label: 'KYC approved', cls: 'bg-emerald-50 text-emerald-700' },
  REJECTED: { label: 'KYC rejected', cls: 'bg-red-50 text-red-700' },
}

function KycChip({ status }: { status: string }) {
  const m = KYC_CHIP[status] ?? KYC_CHIP.NOT_STARTED
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}>{m.label}</span>
}

function ContactRow({ icon, label, value, href, copy, multiline }: { icon: ReactNode; label: string; value: string; href?: string; copy?: boolean; multiline?: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <li className="group flex items-start gap-3 px-3 py-2.5">
      <span className="mt-0.5 text-ink-300">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink-400">{label}</p>
        {value ? (
          href ? (
            <a href={href} className="block truncate text-sm font-medium text-ink-800 hover:text-gold-700">
              {value}
            </a>
          ) : (
            <p className={multiline ? 'whitespace-pre-line text-sm text-ink-800' : 'truncate text-sm font-medium text-ink-800'}>{value}</p>
          )
        ) : (
          <p className="text-sm text-ink-300">Not added</p>
        )}
      </div>
      {copy && value && (
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          className="shrink-0 rounded-md p-1 text-ink-300 opacity-0 transition-opacity hover:bg-ink-100 hover:text-ink-700 group-hover:opacity-100"
          aria-label={`Copy ${label.toLowerCase()}`}
          title={copied ? 'Copied' : `Copy ${label.toLowerCase()}`}
        >
          {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
        </button>
      )}
    </li>
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
