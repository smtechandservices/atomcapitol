'use client'

import { useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import { CalendarClock, Download, ExternalLink, FileText, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { Drawer, Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, FieldWrap, Textarea } from '@/components/ui/Field'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { absoluteMediaUrl, formatCurrency, formatDate, formatDateTime } from '@/lib/format'
import { FilePreview } from '@/components/ui/FilePreview'
import { downloadDocument } from '@/features/documents/api'
import { useGenerateSchedule, usePlot } from '@/features/plots/api'
import type { Milestone } from '@/types'
import { useCreateMilestone, useDeleteMilestone, usePlotSchedule, useUpdateMilestone } from './api'
import { MilestonePill, dueHint, milestoneMeta } from './milestoneStatus'

const emptyForm = { sequence: 1, name: '', description: '', amount: '', due_date: '', admin_remarks: '' }
type FormValues = typeof emptyForm

/** Side panel with one plot's full payment schedule: balances, timeline, add/edit/delete, generate. */
export function PlotScheduleDrawer({ plotId, onClose }: { plotId: number; onClose: () => void }) {
  const toast = useToast()
  const { data: plot } = usePlot(plotId)
  const { data: schedule, isLoading } = usePlotSchedule(plotId)
  const generate = useGenerateSchedule(plotId)
  const deleteMilestone = useDeleteMilestone()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Milestone | null>(null)
  const [formInitial, setFormInitial] = useState<FormValues>(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState<Milestone | null>(null)
  const [receiptOf, setReceiptOf] = useState<Milestone | null>(null)

  const milestones = schedule ?? []
  const primary = plot?.buyers.find((b) => b.plot_role === 'PRIMARY')
  const total = Number(plot?.total_value ?? 0)
  const paidOutside = Number(plot?.amount_paid_outside_app ?? 0)
  // plot.remaining_balance only nets off money paid outside the app, so derive from paid milestones here.
  const collected = paidOutside + milestones.filter((m) => m.status === 'PAID').reduce((sum, m) => sum + Number(m.amount), 0)
  const outstanding = Math.max(0, total - collected)
  const pct = total ? Math.min(100, Math.max(0, (collected / total) * 100)) : 0
  const scheduledTotal = milestones.reduce((sum, m) => sum + Number(m.amount), 0)

  const openCreate = () => {
    setEditing(null)
    const last = milestones[milestones.length - 1]
    setFormInitial({ ...emptyForm, sequence: (last?.sequence ?? 0) + 1 })
    setFormOpen(true)
  }

  const openEdit = (m: Milestone) => {
    setEditing(m)
    setFormInitial({
      sequence: m.sequence,
      name: m.name,
      description: m.description ?? '',
      amount: m.amount,
      due_date: m.due_date,
      admin_remarks: m.admin_remarks ?? '',
    })
    setFormOpen(true)
  }

  return (
    <Drawer open onClose={onClose} title={plot ? `Plot ${plot.plot_number} · Payment schedule` : 'Payment schedule'}>
      {!plot || isLoading ? (
        <FullPageSpinner />
      ) : (
        <div className="space-y-6">
          <section className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-ink-400">{plot.project_name}</p>
                {primary ? (
                  <Link href={`/customers/${primary.id}`} className="mt-0.5 block truncate font-semibold text-ink-800 hover:text-gold-700">
                    {primary.name || primary.email}
                  </Link>
                ) : (
                  <p className="mt-0.5 font-semibold text-ink-400">No primary buyer</p>
                )}
                {primary?.name && <p className="truncate text-xs text-ink-400">{primary.email}</p>}
              </div>
              {plot.instalment_count && (
                <span className="shrink-0 rounded-full bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-500 ring-1 ring-ink-100">
                  {plot.instalment_count} instalments
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Tile label="Total value" value={formatCurrency(plot.total_value)} />
              <Tile label="Collected" value={plot.total_value ? formatCurrency(collected) : '—'} tone="text-emerald-700" />
              <Tile label="Outstanding" value={plot.total_value ? formatCurrency(outstanding) : '—'} tone="text-ink-800" />
            </div>
            {total > 0 && (
              <div>
                <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                  <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-ink-400">
                  {Math.round(pct)}% collected
                  {paidOutside > 0 && <> · includes {formatCurrency(paidOutside)} paid outside the app</>}
                </p>
              </div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-ink-800">
                Milestones <span className="font-normal text-ink-400">· {milestones.length}</span>
              </h4>
              {milestones.length > 0 && (
                <Button size="sm" variant="outline" onClick={openCreate}>
                  <Plus className="size-3.5" /> Add
                </Button>
              )}
            </div>

            {milestones.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-ink-200 px-4 py-10 text-center">
                <CalendarClock className="size-7 text-ink-300" />
                <p className="text-sm font-medium text-ink-600">No payment schedule yet</p>
                <p className="max-w-xs text-xs text-ink-400">
                  {plot.total_value && plot.instalment_count
                    ? `Generate ${plot.instalment_count} instalments from the plot's total value, or add milestones one by one.`
                    : 'Set the total value and instalment count when assigning the buyer to generate a schedule automatically.'}
                </p>
                <div className="mt-2 flex gap-2">
                  {plot.total_value && plot.instalment_count && (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={generate.isPending}
                      onClick={async () => {
                        try {
                          await generate.mutateAsync()
                          toast.success('Schedule generated')
                        } catch (err) {
                          toast.error(apiErrorMessage(err))
                        }
                      }}
                    >
                      <Sparkles className="size-3.5" /> Generate schedule
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={openCreate}>
                    <Plus className="size-3.5" /> Add manually
                  </Button>
                </div>
              </div>
            ) : (
              <ol className="relative space-y-2">
                {milestones.map((m, i) => {
                  const meta = milestoneMeta(m.status)
                  const hint = dueHint(m)
                  const locked = m.status === 'PAID' || m.status === 'UNDER_REVIEW'
                  return (
                    <li key={m.id} className="group relative flex gap-3">
                      {i < milestones.length - 1 && <span className="absolute left-[13px] top-8 h-[calc(100%-16px)] w-px bg-ink-100" />}
                      <span
                        className={clsx(
                          'relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-4 ring-white',
                          m.status === 'PAID' ? 'bg-emerald-500 text-white' : clsx(meta.dot, m.status === 'UPCOMING' ? 'text-ink-700' : 'text-white'),
                        )}
                      >
                        {m.sequence}
                      </span>
                      <div className="min-w-0 flex-1 rounded-lg border border-ink-100 px-3 py-2.5 transition-colors group-hover:border-ink-200">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink-800">{m.name}</p>
                            <p className="text-xs text-ink-400">
                              {formatDate(m.due_date)} · <span className={hint.tone}>{hint.text}</span>
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span className="text-sm font-semibold tabular-nums text-ink-800">{formatCurrency(m.amount)}</span>
                            <MilestonePill status={m.status} />
                          </div>
                        </div>
                        {(m.admin_remarks || m.transaction_reference) && (
                          <p className="mt-1.5 truncate text-xs text-ink-400">
                            {m.transaction_reference && <>Ref {m.transaction_reference}</>}
                            {m.transaction_reference && m.admin_remarks && ' · '}
                            {m.admin_remarks}
                          </p>
                        )}
                        {m.status === 'PAID' &&
                          (m.receipt ? (
                            <div className="mt-2 flex items-center gap-1.5 rounded-md bg-emerald-50/70 px-2 py-1.5">
                              <FileText className="size-3.5 shrink-0 text-emerald-600" />
                              <span className="min-w-0 flex-1 truncate text-xs text-emerald-800">Receipt issued {formatDate(m.receipt.created_at)}</span>
                              <button
                                onClick={() => setReceiptOf(m)}
                                className="rounded px-1.5 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                              >
                                View
                              </button>
                              <ReceiptDownloadButton receipt={m.receipt} compact />
                            </div>
                          ) : (
                            <p className="mt-2 text-xs text-ink-400">No platform receipt — marked paid without an approved proof.</p>
                          ))}
                        <div className="mt-2 hidden gap-1 group-hover:flex">
                          <button onClick={() => openEdit(m)} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-500 hover:bg-ink-50 hover:text-ink-800">
                            <Pencil className="size-3" /> Edit
                          </button>
                          <button
                            onClick={() => setDeleteTarget(m)}
                            disabled={locked}
                            title={locked ? "Paid or under-review milestones can't be deleted" : undefined}
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-ink-300 disabled:hover:bg-transparent"
                          >
                            <Trash2 className="size-3" /> Delete
                          </button>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}

            {milestones.length > 0 && total > 0 && Math.abs(scheduledTotal + paidOutside - total) > 1 && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Scheduled {formatCurrency(scheduledTotal)}
                {paidOutside > 0 && <> + {formatCurrency(paidOutside)} outside the app</>} doesn&apos;t add up to
                the total value of {formatCurrency(plot.total_value)}.
              </p>
            )}
          </section>
        </div>
      )}

      <MilestoneFormModal
        open={formOpen}
        plotId={plotId}
        editing={editing}
        initial={formInitial}
        onClose={() => setFormOpen(false)}
      />

      {receiptOf?.receipt && (
        <Modal
          open
          onClose={() => setReceiptOf(null)}
          title={receiptOf.receipt.name}
          size="lg"
          footer={
            <>
              <a
                href={absoluteMediaUrl(receiptOf.receipt.url) ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="mr-auto inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-800"
              >
                Open in new tab <ExternalLink className="size-3" />
              </a>
              <Button variant="ghost" onClick={() => setReceiptOf(null)}>
                Close
              </Button>
              <ReceiptDownloadButton receipt={receiptOf.receipt} />
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-xs text-ink-400">
              Plot {plot?.plot_number} · {formatCurrency(receiptOf.amount)} · issued {formatDateTime(receiptOf.receipt.created_at)}
            </p>
            {/* FilePreview's own "open in new tab" link is redundant with the footer, so hide it */}
            <div className="[&>div>a]:hidden">
              <FilePreview title="Payment receipt" url={absoluteMediaUrl(receiptOf.receipt.url)} height={560} />
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete milestone"
        message={`Remove "${deleteTarget?.name}" from this plot's schedule?`}
        confirmLabel="Delete"
        danger
        loading={deleteMilestone.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return
          try {
            await deleteMilestone.mutateAsync(deleteTarget.id)
            toast.success('Milestone deleted')
            setDeleteTarget(null)
          } catch (err) {
            toast.error(apiErrorMessage(err))
          }
        }}
      />
    </Drawer>
  )
}

function MilestoneFormModal({
  open,
  plotId,
  editing,
  initial,
  onClose,
}: {
  open: boolean
  plotId: number
  editing: Milestone | null
  initial: FormValues
  onClose: () => void
}) {
  const toast = useToast()
  const createMilestone = useCreateMilestone()
  const updateMilestone = useUpdateMilestone()
  const [form, setForm] = useState(initial)
  const [openedWith, setOpenedWith] = useState(initial)
  // Reset whenever the modal is opened with fresh initial values.
  if (openedWith !== initial) {
    setOpenedWith(initial)
    setForm(initial)
  }

  const valid = form.name.trim() && form.amount && form.due_date && form.sequence > 0

  const submit = async () => {
    try {
      if (editing) {
        await updateMilestone.mutateAsync({ id: editing.id, values: form })
        toast.success('Milestone updated')
      } else {
        await createMilestone.mutateAsync({ plot: plotId, ...form })
        toast.success('Milestone added')
      }
      onClose()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit milestone' : 'Add milestone'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" loading={createMilestone.isPending || updateMilestone.isPending} disabled={!valid} onClick={submit}>
            {editing ? 'Save changes' : 'Add milestone'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[96px_1fr] gap-3">
          <FieldWrap label="No." required>
            <Input type="number" min={1} value={form.sequence} onChange={(e) => setForm({ ...form, sequence: Number(e.target.value) })} />
          </FieldWrap>
          <FieldWrap label="Name" required>
            <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Instalment 2 of 4" />
          </FieldWrap>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FieldWrap label="Amount" required hint={form.amount ? formatCurrency(form.amount) : undefined}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">₹</span>
              <Input type="number" min={0} className="pl-7" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
          </FieldWrap>
          <FieldWrap label="Due date" required>
            <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          </FieldWrap>
        </div>
        <FieldWrap label="Description" hint="Shown to the customer in the app.">
          <Textarea rows={2} className="min-h-16" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </FieldWrap>
        <FieldWrap label="Admin remarks" hint="Internal only.">
          <Textarea rows={2} className="min-h-16" value={form.admin_remarks} onChange={(e) => setForm({ ...form, admin_remarks: e.target.value })} />
        </FieldWrap>
      </div>
    </Modal>
  )
}

function ReceiptDownloadButton({ receipt, compact }: { receipt: NonNullable<Milestone['receipt']>; compact?: boolean }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const download = async () => {
    setBusy(true)
    try {
      await downloadDocument(receipt.id, `${receipt.name}.pdf`)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Download failed'))
    } finally {
      setBusy(false)
    }
  }
  if (compact) {
    return (
      <button
        onClick={download}
        disabled={busy}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
      >
        <Download className="size-3" /> {busy ? 'Downloading…' : 'Download'}
      </button>
    )
  }
  return (
    <Button variant="secondary" loading={busy} onClick={download}>
      <Download className="size-4" /> Download PDF
    </Button>
  )
}

function Tile({ label, value, tone = 'text-ink-800' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-ink-100 px-3 py-2.5">
      <p className="text-xs text-ink-400">{label}</p>
      <p className={clsx('mt-0.5 truncate text-sm font-semibold tabular-nums', tone)}>{value}</p>
    </div>
  )
}
