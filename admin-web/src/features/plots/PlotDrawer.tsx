'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import { Building2, ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { Drawer, Modal } from '@/components/ui/Modal'
import { useCan } from '@/lib/permissions'
import { Button } from '@/components/ui/Button'
import { Input, Select, FieldWrap } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { formatCurrency, formatDateTime } from '@/lib/format'
import type { CustomerListItem, Plot, PlotBuyer } from '@/types'
import {
  useAssignPlot,
  useGenerateSchedule,
  usePlotHistory,
  useTransferPlot,
  useUnassignPlot,
  useUpdatePlot,
  type AssignPayload,
} from './api'
import { CustomerPicker, type PickedBuyer } from './CustomerPicker'
import { DeletePlotModal } from './DeletePlotModal'

type AssignDetails = Omit<AssignPayload, 'email'>

const emptyAssign: AssignDetails = { role: 'PRIMARY', name: '', phone: '' }

function otherPlotReason(c: CustomerListItem) {
  return `On plot ${c.plot_number}${c.project_name ? ` · ${c.project_name}` : ''}`
}

export function PlotDrawer({ plot, onClose }: { plot: Plot; onClose: () => void }) {
  const toast = useToast()
  const [buyer, setBuyer] = useState<PickedBuyer>(null)
  const [assignForm, setAssignForm] = useState<AssignDetails>(emptyAssign)
  const [unassignTarget, setUnassignTarget] = useState<PlotBuyer | null>(null)
  const [transferTarget, setTransferTarget] = useState<PlotBuyer | null>(null)
  const [transferBuyer, setTransferBuyer] = useState<PickedBuyer>(null)
  const [reason, setReason] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  const assignPlot = useAssignPlot(plot.id)
  const unassignPlot = useUnassignPlot(plot.id)
  const transferPlot = useTransferPlot(plot.id)
  const generateSchedule = useGenerateSchedule(plot.id)
  const history = usePlotHistory(showHistory ? plot.id : undefined)

  const hasPrimary = plot.buyers.some((b) => b.plot_role === 'PRIMARY')
  const canEditPlot = useCan()('plotEdit')
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const assignRole = hasPrimary ? 'CO_APPLICANT' : assignForm.role

  // One email = one plot (backend assign_plot); someone already on this plot can't be added twice.
  const assignBlock = (c: CustomerListItem) =>
    c.plot_id === plot.id ? 'Already on this plot' : c.plot_id ? otherPlotReason(c) : null
  // Transfers may promote a co-applicant of this plot, but not the outgoing owner.
  const transferBlock = (c: CustomerListItem) =>
    c.id === transferTarget?.id ? 'Current owner' : c.plot_id && c.plot_id !== plot.id ? otherPlotReason(c) : null

  const pickedEmail = (b: PickedBuyer) => (b?.kind === 'existing' ? b.customer.email : b?.kind === 'new' ? b.email : '')
  const pickedOk = (b: PickedBuyer) => !!b && !(b.kind === 'existing' && b.blockedReason)

  const submitAssign = async () => {
    try {
      const isNew = buyer?.kind === 'new'
      await assignPlot.mutateAsync({
        ...assignForm,
        email: pickedEmail(buyer),
        role: assignRole,
        // existing customers keep their stored name/phone
        name: isNew ? assignForm.name : undefined,
        phone: isNew ? assignForm.phone : undefined,
        total_value: assignForm.total_value || undefined,
        amount_paid_outside_app: assignForm.amount_paid_outside_app || undefined,
        instalment_count: assignForm.instalment_count || undefined,
      })
      toast.success('Buyer assigned')
      setAssignForm(emptyAssign)
      setBuyer(null)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const confirmUnassign = async () => {
    if (!unassignTarget) return
    try {
      await unassignPlot.mutateAsync({ customer_id: unassignTarget.id, reason })
      toast.success('Buyer unassigned')
      setUnassignTarget(null)
      setReason('')
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const submitTransfer = async () => {
    if (!transferTarget) return
    try {
      await transferPlot.mutateAsync({ customer_id: transferTarget.id, new_email: pickedEmail(transferBuyer), reason })
      toast.success('Plot transferred')
      setTransferTarget(null)
      setTransferBuyer(null)
      setReason('')
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <Drawer open onClose={onClose} title={`Plot ${plot.plot_number}`}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-100 bg-ink-50/50 px-3 py-2.5">
          <Link href={`/projects/${plot.project}`} className="flex min-w-0 items-center gap-2 text-sm hover:text-gold-700">
            <Building2 className="size-4 shrink-0 text-ink-400" />
            <span className="text-ink-400">Project</span>
            <span className="truncate font-semibold text-ink-800">{plot.project_name}</span>
            <ExternalLink className="size-3.5 shrink-0 text-ink-300" />
          </Link>
          <div className="flex items-center gap-2">
            <Badge>{plot.status}</Badge>
            {canEditPlot && (
              <>
                <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="size-3.5" /> Edit plot
                </Button>
                <button
                  onClick={() => setDeleteOpen(true)}
                  className="rounded-lg p-1.5 text-ink-300 hover:bg-red-50 hover:text-red-600"
                  aria-label="Delete plot"
                  title="Delete plot"
                >
                  <Trash2 className="size-4" />
                </button>
              </>
            )}
          </div>
        </div>

        <section className="grid grid-cols-2 gap-3 text-sm">
          <Info label="Size" value={plot.size} />
          <Info label="Block / Sector" value={plot.block_sector || '—'} />
          <Info label="List price" value={formatCurrency(plot.price)} />
          <Info label="Total value" value={formatCurrency(plot.total_value)} />
          <Info label="Paid outside app" value={formatCurrency(plot.amount_paid_outside_app)} />
          <Info label="Remaining balance" value={formatCurrency(plot.remaining_balance)} />
          <Info label="Instalments" value={plot.instalment_count ?? '—'} />
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-ink-700">Buyers</h4>
            <Button
              size="sm"
              variant="outline"
              loading={generateSchedule.isPending}
              onClick={async () => {
                try {
                  await generateSchedule.mutateAsync()
                  toast.success('Milestone schedule generated')
                } catch (err) {
                  toast.error(apiErrorMessage(err))
                }
              }}
              disabled={!plot.total_value || !plot.instalment_count}
            >
              Generate schedule
            </Button>
          </div>
          {plot.buyers.length === 0 ? (
            <p className="text-sm text-ink-400">No buyer assigned yet.</p>
          ) : (
            <ul className="space-y-2">
              {plot.buyers.map((buyer) => (
                <li key={buyer.id} className="flex items-center justify-between rounded-lg border border-ink-100 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-ink-700">{buyer.name || buyer.email}</p>
                    <p className="text-xs text-ink-400">
                      {buyer.email} &middot; <Badge tone={buyer.plot_role === 'PRIMARY' ? 'gold' : 'neutral'}>{buyer.plot_role}</Badge>{' '}
                      &middot; <Badge>{buyer.kyc_status}</Badge>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {buyer.plot_role === 'PRIMARY' && (
                      <Button size="sm" variant="outline" onClick={() => setTransferTarget(buyer)}>
                        Transfer
                      </Button>
                    )}
                    <Button size="sm" variant="danger" onClick={() => setUnassignTarget(buyer)}>
                      Unassign
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h4 className="mb-2 text-sm font-semibold text-ink-700">
            {hasPrimary ? 'Add co-applicant' : 'Assign primary buyer'}
          </h4>
          <div className="space-y-3 rounded-lg border border-ink-100 p-3">
            <FieldWrap label="Buyer" required>
              <CustomerPicker value={buyer} onChange={setBuyer} blockedReason={assignBlock} />
            </FieldWrap>
            {!hasPrimary && (
              <FieldWrap label="Role">
                <Select
                  value={assignForm.role}
                  onChange={(e) => setAssignForm({ ...assignForm, role: e.target.value as 'PRIMARY' | 'CO_APPLICANT' })}
                >
                  <option value="PRIMARY">Primary</option>
                  <option value="CO_APPLICANT">Co-applicant</option>
                </Select>
              </FieldWrap>
            )}
            {buyer?.kind === 'new' && (
              <div className="grid grid-cols-2 gap-3">
                <FieldWrap label="Name">
                  <Input value={assignForm.name} onChange={(e) => setAssignForm({ ...assignForm, name: e.target.value })} />
                </FieldWrap>
                <FieldWrap label="Phone">
                  <Input value={assignForm.phone} onChange={(e) => setAssignForm({ ...assignForm, phone: e.target.value })} />
                </FieldWrap>
              </div>
            )}
            {assignRole === 'PRIMARY' && (
              <div className="grid grid-cols-3 gap-3">
                <FieldWrap label="Total value">
                  <Input
                    type="number"
                    value={assignForm.total_value ?? ''}
                    onChange={(e) => setAssignForm({ ...assignForm, total_value: e.target.value })}
                  />
                </FieldWrap>
                <FieldWrap label="Paid outside app">
                  <Input
                    type="number"
                    value={assignForm.amount_paid_outside_app ?? ''}
                    onChange={(e) => setAssignForm({ ...assignForm, amount_paid_outside_app: e.target.value })}
                  />
                </FieldWrap>
                <FieldWrap label="Instalments">
                  <Input
                    type="number"
                    value={assignForm.instalment_count ?? ''}
                    onChange={(e) => setAssignForm({ ...assignForm, instalment_count: Number(e.target.value) })}
                  />
                </FieldWrap>
              </div>
            )}
            <Button variant="secondary" loading={assignPlot.isPending} onClick={submitAssign} disabled={!pickedOk(buyer)}>
              {buyer?.kind === 'new' ? 'Create & assign' : 'Assign'}
            </Button>
          </div>
        </section>

        <section>
          <button onClick={() => setShowHistory((s) => !s)} className="text-sm font-semibold text-ink-700 underline">
            {showHistory ? 'Hide' : 'Show'} assignment history
          </button>
          {showHistory && (
            <ul className="mt-2 space-y-2">
              {(history.data ?? []).map((entry) => (
                <li key={entry.id} className="rounded-lg border border-ink-100 px-3 py-2 text-xs text-ink-600">
                  <span className="font-semibold">{entry.action}</span> &middot; {entry.from_email || '—'} → {entry.to_email || '—'}
                  {entry.reason && <> &middot; {entry.reason}</>}
                  <div className="text-ink-400">
                    {formatDateTime(entry.created_at)} by {entry.performed_by_email ?? 'system'}
                  </div>
                </li>
              ))}
              {history.data?.length === 0 && <p className="text-sm text-ink-400">No history yet.</p>}
            </ul>
          )}
        </section>
      </div>

      {editOpen && <EditPlotModal plot={plot} onClose={() => setEditOpen(false)} />}
      {deleteOpen && <DeletePlotModal plot={plot} onClose={() => setDeleteOpen(false)} onDeleted={onClose} />}

      <ConfirmDialog
        open={!!unassignTarget}
        title="Unassign buyer"
        message={`This immediately revokes app access for ${unassignTarget?.email}. Continue?`}
        confirmLabel="Unassign"
        danger
        loading={unassignPlot.isPending}
        onConfirm={confirmUnassign}
        onClose={() => setUnassignTarget(null)}
      />

      {transferTarget && (
        <Drawer
          open
          onClose={() => {
            setTransferTarget(null)
            setTransferBuyer(null)
          }}
          title={`Transfer plot from ${transferTarget.email}`}>
          <div className="space-y-4">
            <FieldWrap label="New buyer" required>
              <CustomerPicker value={transferBuyer} onChange={setTransferBuyer} blockedReason={transferBlock} autoFocus />
            </FieldWrap>
            <FieldWrap label="Reason">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Resale" />
            </FieldWrap>
            <Button variant="secondary" loading={transferPlot.isPending} onClick={submitTransfer} disabled={!pickedOk(transferBuyer)}>
              Confirm transfer
            </Button>
          </div>
        </Drawer>
      )}
    </Drawer>
  )
}

const STATUS_OPTIONS = [
  { value: 'AVAILABLE', label: 'Available', dot: 'bg-emerald-500' },
  { value: 'BOOKED', label: 'Booked', dot: 'bg-amber-500' },
  { value: 'SOLD', label: 'Sold', dot: 'bg-gold-500' },
] as const

/** Super-admin edit of the plot's own attributes. Buyers, schedule and project stay as they are. */
function EditPlotModal({ plot, onClose }: { plot: Plot; onClose: () => void }) {
  const toast = useToast()
  const update = useUpdatePlot()
  const [plotNumber, setPlotNumber] = useState(plot.plot_number)
  const [block, setBlock] = useState(plot.block_sector)
  const [size, setSize] = useState(plot.size)
  const [price, setPrice] = useState(plot.price)
  const [status, setStatus] = useState<Plot['status']>(plot.status)
  const hasBuyers = plot.buyers.length > 0
  const valid = plotNumber.trim() && size.trim() && Number(price) > 0

  const submit = async () => {
    try {
      await update.mutateAsync({
        id: plot.id,
        values: { plot_number: plotNumber.trim(), block_sector: block.trim(), size: size.trim(), price, status },
      })
      toast.success(`Plot ${plotNumber.trim()} updated`)
      onClose()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit plot ${plot.plot_number}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" loading={update.isPending} disabled={!valid} onClick={submit}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-600">
          <Building2 className="size-4 text-ink-400" /> {plot.project_name}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FieldWrap label="Plot number" required hint="Must be unique within the project">
            <Input value={plotNumber} onChange={(e) => setPlotNumber(e.target.value)} />
          </FieldWrap>
          <FieldWrap label="Block / Sector">
            <Input value={block} onChange={(e) => setBlock(e.target.value)} />
          </FieldWrap>
          <FieldWrap label="Size" required>
            <Input value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. 1200 sq.ft" />
          </FieldWrap>
          <FieldWrap label="List price" required hint={Number(price) ? formatCurrency(price) : undefined}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">₹</span>
              <Input type="number" min={0} className="pl-7" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </FieldWrap>
        </div>
        <FieldWrap label="Status">
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-ink-200 bg-ink-50/50 p-1">
            {STATUS_OPTIONS.map((o) => {
              const blocked = o.value === 'AVAILABLE' && hasBuyers
              return (
                <button
                  key={o.value}
                  type="button"
                  disabled={blocked}
                  title={blocked ? 'Unassign the buyers before marking this plot available' : undefined}
                  onClick={() => setStatus(o.value)}
                  className={clsx(
                    'flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                    status === o.value ? 'bg-white text-ink-800 shadow-sm ring-1 ring-ink-100' : 'text-ink-500 hover:text-ink-700',
                  )}
                >
                  <span className={clsx('size-1.5 rounded-full', o.dot)} />
                  {o.label}
                </button>
              )
            })}
          </div>
        </FieldWrap>
        <p className="text-xs text-ink-400">
          Buyers, the payment schedule and the project aren&apos;t changed here — to put an empty plot in another project, delete it and add it
          there. The list price doesn&apos;t change an existing buyer&apos;s total value.
        </p>
      </div>
    </Modal>
  )
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-ink-400">{label}</p>
      <p className="mt-0.5 font-medium text-ink-700">{value}</p>
    </div>
  )
}
