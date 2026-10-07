'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import clsx from 'clsx'
import { ChevronRight, Clock, Info, LandPlot, Plus, Search, ShieldCheck, Users, X } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, StatCard } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Input, Select, FieldWrap, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import type { CustomerKYCStatus, CustomerListItem } from '@/types'
import { useAssignToPlot } from '@/features/plots/api'
import { AssignPlotFields, assignPlotReady, emptyAssignPlot, toAssignPayload, type AssignPlotValue } from '@/features/plots/AssignPlotFields'
import { useCan } from '@/lib/permissions'
import { useCreateCustomer, useCustomerCounts, useCustomers, type CustomerCreateValues } from './api'

const KYC_STATUSES: { value: CustomerKYCStatus; label: string; countKey: string; dot: string; pill: string }[] = [
  { value: 'NOT_STARTED', label: 'Not started', countKey: 'notStarted', dot: 'bg-ink-300', pill: 'bg-ink-50 text-ink-600 ring-ink-200' },
  { value: 'SUBMITTED', label: 'Submitted', countKey: 'submitted', dot: 'bg-sky-500', pill: 'bg-sky-50 text-sky-700 ring-sky-200' },
  { value: 'APPROVED', label: 'Approved', countKey: 'approved', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  { value: 'REJECTED', label: 'Rejected', countKey: 'rejected', dot: 'bg-red-500', pill: 'bg-red-50 text-red-700 ring-red-200' },
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const emptyForm: CustomerCreateValues = { email: '', name: '', phone: '', address: '' }

export function CustomersPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [kycStatus, setKycStatus] = useState('')
  const [plotFilter, setPlotFilter] = useState('')
  const [accessFilter, setAccessFilter] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<CustomerCreateValues>(emptyForm)
  const [assignNow, setAssignNow] = useState(false)
  const [assign, setAssign] = useState<AssignPlotValue>(emptyAssignPlot)

  const router = useRouter()
  const toast = useToast()
  const { data: counts } = useCustomerCounts()
  const { data, isLoading, error } = useCustomers({
    page,
    search: search || undefined,
    kyc_status: kycStatus || undefined,
    assigned_plot__isnull: plotFilter || undefined,
    is_active: accessFilter || undefined,
  })
  const createCustomer = useCreateCustomer()
  const assignToPlot = useAssignToPlot()
  const canAssignPlot = useCan()('projects')

  const hasFilters = !!(search || kycStatus || plotFilter || accessFilter)
  const emailValid = EMAIL_RE.test(form.email.trim())

  const resetTo = (fn: () => void) => {
    setPage(1)
    fn()
  }

  const columns: Column<CustomerListItem>[] = [
    {
      key: 'customer',
      header: 'Customer',
      render: (c) => (
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink-800 text-xs font-semibold text-gold-300">
            {initialsOf(c)}
          </span>
          <div className="min-w-0">
            <p className={clsx('max-w-[240px] truncate font-medium', c.name ? 'text-ink-800' : 'italic text-ink-400')}>{c.name || 'No name'}</p>
            <p className="max-w-[240px] truncate text-xs text-ink-400">{c.email}</p>
          </div>
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', render: (c) => (c.phone ? <span className="tabular-nums text-ink-600">{c.phone}</span> : <span className="text-ink-300">—</span>) },
    {
      key: 'plot',
      header: 'Plot',
      render: (c) =>
        c.plot_number ? (
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-medium text-ink-800">
              {c.plot_number}
              {c.plot_role === 'CO_APPLICANT' && (
                <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-500">Co-applicant</span>
              )}
            </p>
            <p className="max-w-[200px] truncate text-xs text-ink-400">{c.project_name}</p>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-ink-200 px-2 py-0.5 text-xs text-ink-400">No plot</span>
        ),
    },
    { key: 'kyc', header: 'KYC', render: (c) => <KycPill status={c.kyc_status} /> },
    {
      key: 'sales',
      header: 'Sales person',
      render: (c) => (c.sales_person_name ? <span className="text-ink-600">{c.sales_person_name}</span> : <span className="text-ink-300">Unassigned</span>),
    },
    {
      key: 'access',
      header: 'App access',
      render: (c) => (
        <span className={clsx('inline-flex items-center gap-1.5 text-xs font-medium', c.is_active ? 'text-emerald-700' : 'text-ink-400')}>
          <span className={clsx('size-1.5 rounded-full', c.is_active ? 'bg-emerald-500' : 'bg-ink-300')} />
          {c.is_active ? 'Active' : 'Revoked'}
        </span>
      ),
    },
    { key: 'open', header: '', className: 'w-10', render: () => <ChevronRight className="size-4 text-ink-300" /> },
  ]

  const closeCreate = () => {
    setCreateOpen(false)
    setForm(emptyForm)
    setAssignNow(false)
    setAssign(emptyAssignPlot)
  }

  const submit = async () => {
    let created
    try {
      created = await createCustomer.mutateAsync({ ...form, email: form.email.trim() })
    } catch (err) {
      toast.error(apiErrorMessage(err))
      return
    }
    // Two calls: if the plot step fails the customer still exists, so land on their page to retry from there.
    if (assignNow && assign.plot) {
      try {
        await assignToPlot.mutateAsync({ plotId: assign.plot.id, payload: toAssignPayload(created.email, assign) })
        toast.success(`Customer created and assigned to plot ${assign.plot.plot_number}`)
      } catch (err) {
        toast.error(`Customer created, but plot assignment failed: ${apiErrorMessage(err)}`)
      }
    } else {
      toast.success('Customer created')
    }
    closeCreate()
    router.push(`/customers/${created.id}`)
  }

  const kycTabs = [{ value: '', label: 'All', dot: '', count: counts?.total }, ...KYC_STATUSES.map((s) => ({ ...s, count: counts?.[s.countKey] }))]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Customers"
        subtitle="Every buyer on record — invite new ones, then assign a plot from Plot Inventory"
        actions={
          <Button variant="secondary" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Add customer
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total customers" value={counts?.total ?? '—'} icon={<Users className="size-5" />} accent="ink" className="py-6" />
        <StatCard label="KYC approved" value={counts?.approved ?? '—'} icon={<ShieldCheck className="size-5" />} accent="success" className="py-6" />
        <StatCard label="Awaiting KYC review" value={counts?.submitted ?? '—'} icon={<Clock className="size-5" />} accent="gold" className="py-6" />
        <StatCard label="Without a plot" value={counts?.noPlot ?? '—'} icon={<LandPlot className="size-5" />} accent="ink" className="py-6" />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4">
          <div className="flex items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
              <Input
                className="pl-9"
                placeholder="Search by name, email, phone or plot"
                value={search}
                onChange={(e) => resetTo(() => setSearch(e.target.value))}
              />
            </div>
            {/* Select is w-full by default, so the wrappers set their width */}
            <div className="w-36 shrink-0">
              <Select value={plotFilter} onChange={(e) => resetTo(() => setPlotFilter(e.target.value))}>
                <option value="">Any plot</option>
                <option value="false">Has a plot</option>
                <option value="true">No plot</option>
              </Select>
            </div>
            <div className="w-36 shrink-0">
              <Select value={accessFilter} onChange={(e) => resetTo(() => setAccessFilter(e.target.value))}>
                <option value="">Any access</option>
                <option value="true">Active</option>
                <option value="false">Revoked</option>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 pb-0.5">
              {kycTabs.map((s) => {
                const active = kycStatus === s.value
                return (
                  <button
                    key={s.value || 'all'}
                    onClick={() => resetTo(() => setKycStatus(s.value))}
                    className={clsx(
                      'flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      active ? 'border-ink-800 bg-ink-800 text-white' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:bg-ink-50',
                    )}
                  >
                    {s.dot && <span className={clsx('size-1.5 rounded-full', s.dot)} />}
                    {s.value ? `KYC ${s.label.toLowerCase()}` : s.label}
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
                    setKycStatus('')
                    setPlotFilter('')
                    setAccessFilter('')
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
          onRowClick={(row) => router.push(`/customers/${row.id}`)}
          page={page}
          onPageChange={setPage}
          count={data?.count}
          emptyTitle={hasFilters ? 'No matching customers' : 'No customers yet'}
          emptySubtitle={hasFilters ? 'Try a different search or filter.' : 'Add a customer, or assign a buyer email directly from Plot Inventory.'}
        />
      </Card>

      <Modal
        open={createOpen}
        onClose={closeCreate}
        title="Add customer"
        size={assignNow ? 'lg' : 'md'}
        footer={
          <>
            <Button variant="ghost" onClick={closeCreate}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              loading={createCustomer.isPending || assignToPlot.isPending}
              onClick={submit}
              disabled={!emailValid || (assignNow && !assignPlotReady(assign))}
            >
              {assignNow ? 'Create & assign plot' : 'Create customer'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex gap-2.5 rounded-lg bg-gold-50 px-3 py-2.5 text-xs text-gold-900 ring-1 ring-gold-200">
            <Info className="mt-0.5 size-4 shrink-0 text-gold-700" />
            <p>The email becomes their app login. They can sign in once a plot is assigned to them.</p>
          </div>
          <FieldWrap label="Email" required error={form.email && !emailValid ? 'Enter a valid email address' : undefined}>
            <Input autoFocus type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" />
          </FieldWrap>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FieldWrap label="Full name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </FieldWrap>
            <FieldWrap label="Phone">
              <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91" />
            </FieldWrap>
          </div>
          <FieldWrap label="Address">
            <Textarea className="min-h-20" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </FieldWrap>

          {canAssignPlot && (
          <div className="overflow-hidden rounded-lg border border-ink-200">
            <label className="flex cursor-pointer items-center justify-between gap-3 px-3 py-3">
              <span>
                <span className="block text-sm font-medium text-ink-800">Assign a plot now</span>
                <span className="block text-xs text-ink-400">Skip this to assign later from their profile or Plot Inventory.</span>
              </span>
              <Switch checked={assignNow} onChange={setAssignNow} />
            </label>
            {assignNow && (
              <div className="border-t border-ink-100 p-3">
                <AssignPlotFields value={assign} onChange={setAssign} />
              </div>
            )}
          </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-gold-500' : 'bg-ink-200')}
    >
      <span className={clsx('absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform', checked ? 'translate-x-4.5' : 'translate-x-0.5')} />
    </button>
  )
}

function initialsOf(c: CustomerListItem) {
  return (c.name || c.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}

function KycPill({ status }: { status: string }) {
  const meta = KYC_STATUSES.find((s) => s.value === status)
  if (!meta) return <span className="text-xs text-ink-400">{status}</span>
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1', meta.pill)}>
      <span className={clsx('size-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}
