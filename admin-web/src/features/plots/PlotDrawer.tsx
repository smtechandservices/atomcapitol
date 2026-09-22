'use client'

import { useState, type ReactNode } from 'react'
import { Drawer } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Select, FieldWrap } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { formatCurrency, formatDateTime } from '@/lib/format'
import type { Plot, PlotBuyer } from '@/types'
import {
  useAssignPlot,
  useGenerateSchedule,
  usePlotHistory,
  useTransferPlot,
  useUnassignPlot,
  type AssignPayload,
} from './api'

const emptyAssign: AssignPayload = { email: '', role: 'PRIMARY', name: '', phone: '' }

export function PlotDrawer({ plot, onClose }: { plot: Plot; onClose: () => void }) {
  const toast = useToast()
  const [assignForm, setAssignForm] = useState<AssignPayload>(emptyAssign)
  const [unassignTarget, setUnassignTarget] = useState<PlotBuyer | null>(null)
  const [transferTarget, setTransferTarget] = useState<PlotBuyer | null>(null)
  const [transferEmail, setTransferEmail] = useState('')
  const [reason, setReason] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  const assignPlot = useAssignPlot(plot.id)
  const unassignPlot = useUnassignPlot(plot.id)
  const transferPlot = useTransferPlot(plot.id)
  const generateSchedule = useGenerateSchedule(plot.id)
  const history = usePlotHistory(showHistory ? plot.id : undefined)

  const hasPrimary = plot.buyers.some((b) => b.plot_role === 'PRIMARY')

  const submitAssign = async () => {
    try {
      await assignPlot.mutateAsync({
        ...assignForm,
        total_value: assignForm.total_value || undefined,
        amount_paid_outside_app: assignForm.amount_paid_outside_app || undefined,
        instalment_count: assignForm.instalment_count || undefined,
      })
      toast.success('Buyer assigned')
      setAssignForm(emptyAssign)
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
      await transferPlot.mutateAsync({ customer_id: transferTarget.id, new_email: transferEmail, reason })
      toast.success('Plot transferred')
      setTransferTarget(null)
      setTransferEmail('')
      setReason('')
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <Drawer open onClose={onClose} title={`Plot ${plot.plot_number}`}>
      <div className="space-y-6">
        <section className="grid grid-cols-2 gap-3 text-sm">
          <Info label="Project" value={plot.project_name} />
          <Info label="Status" value={<Badge>{plot.status}</Badge>} />
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
            <FieldWrap label="Email" required>
              <Input value={assignForm.email} onChange={(e) => setAssignForm({ ...assignForm, email: e.target.value })} />
            </FieldWrap>
            <div className="grid grid-cols-2 gap-3">
              <FieldWrap label="Role">
                <Select
                  value={assignForm.role}
                  onChange={(e) => setAssignForm({ ...assignForm, role: e.target.value as 'PRIMARY' | 'CO_APPLICANT' })}
                >
                  <option value="PRIMARY">Primary</option>
                  <option value="CO_APPLICANT">Co-applicant</option>
                </Select>
              </FieldWrap>
              <FieldWrap label="Name">
                <Input value={assignForm.name} onChange={(e) => setAssignForm({ ...assignForm, name: e.target.value })} />
              </FieldWrap>
            </div>
            <FieldWrap label="Phone">
              <Input value={assignForm.phone} onChange={(e) => setAssignForm({ ...assignForm, phone: e.target.value })} />
            </FieldWrap>
            {assignForm.role === 'PRIMARY' && (
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
            <Button variant="secondary" loading={assignPlot.isPending} onClick={submitAssign} disabled={!assignForm.email}>
              Assign
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
        <Drawer open onClose={() => setTransferTarget(null)} title={`Transfer plot from ${transferTarget.email}`}>
          <div className="space-y-4">
            <FieldWrap label="New buyer email" required>
              <Input value={transferEmail} onChange={(e) => setTransferEmail(e.target.value)} />
            </FieldWrap>
            <FieldWrap label="Reason">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Resale" />
            </FieldWrap>
            <Button variant="secondary" loading={transferPlot.isPending} onClick={submitTransfer} disabled={!transferEmail}>
              Confirm transfer
            </Button>
          </div>
        </Drawer>
      )}
    </Drawer>
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
