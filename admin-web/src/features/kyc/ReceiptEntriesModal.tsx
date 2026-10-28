'use client'

import { useState } from 'react'
import clsx from 'clsx'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, FieldWrap } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/format'
import type { PaymentTerms, PreviewMilestone, ReceiptEntry, ScheduleFrequency } from './api'

const blankEntry = (amount = '', date = ''): ReceiptEntry => ({
  payment_by: 'UPI',
  payment_date: date,
  bank: '',
  reference: '',
  amount,
})

/** Collects the payment(s) behind the customer's first receipt; each becomes a table on the PDF.
 * With `terms` (primary buyer, no schedule yet) it also takes the plot's payment terms and shows the
 * milestones they produce for review (monthly or weekly, due dates and amounts editable) before approving. */
export function ReceiptEntriesModal({
  open,
  onClose,
  onSubmit,
  loading,
  initialAmount,
  initialDate,
  terms,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (entries: ReceiptEntry[], terms?: PaymentTerms) => void
  loading: boolean
  initialAmount: string | null
  initialDate: string | null
  terms?: {
    initialTotal: string
    initialInstalments: string
    listPrice?: string
    preview: (payload: PaymentTerms & { receipt_entries: ReceiptEntry[] }) => Promise<PreviewMilestone[]>
  }
}) {
  const toast = useToast()
  const [entries, setEntries] = useState<ReceiptEntry[]>([])
  const [total, setTotal] = useState('')
  const [instalments, setInstalments] = useState('')
  const [preview, setPreview] = useState<PreviewMilestone[] | null>(null)
  const [frequency, setFrequency] = useState<ScheduleFrequency>('MONTHLY')
  const [previewing, setPreviewing] = useState(false)
  const [wasOpen, setWasOpen] = useState(false)

  // Re-seed from the customer's upload each time the modal opens
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setEntries([blankEntry(initialAmount ?? '', initialDate ?? '')])
      setTotal(terms?.initialTotal ?? '')
      setInstalments(terms?.initialInstalments ?? '')
      setPreview(null)
      setFrequency('MONTHLY')
    }
  }

  const update = (i: number, patch: Partial<ReceiptEntry>) =>
    setEntries(entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)))

  const paid = entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
  const valid =
    entries.length > 0 && entries.every((e) => e.payment_by.trim() && e.payment_date && Number(e.amount) > 0 && e.bank.trim() && e.reference.trim())
  const termsValid = Number(total) > paid && Number(instalments) >= 2
  const paymentTerms: PaymentTerms = { total_value: total, instalment_count: Number(instalments) }

  // Changing the frequency recomputes every due date, discarding any edited by hand.
  const review = async (freq: ScheduleFrequency = frequency) => {
    if (!terms) return
    setFrequency(freq)
    setPreviewing(true)
    try {
      setPreview(await terms.preview({ ...paymentTerms, frequency: freq, receipt_entries: entries }))
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setPreviewing(false)
    }
  }

  if (terms && preview) {
    const upcoming = preview.filter((m) => m.status === 'UPCOMING')
    // An instalment's date must be set and come after the one before it (instalment 1's payment date included).
    const dateError = (m: PreviewMilestone) => {
      const prev = preview[preview.indexOf(m) - 1]
      if (!m.due_date) return 'Pick a date'
      return prev && m.due_date <= prev.due_date ? 'Must be after the previous instalment' : null
    }
    const datesValid = upcoming.every((m) => !dateError(m))
    const setRow = (sequence: number, patch: Partial<PreviewMilestone>) =>
      setPreview(preview.map((m) => (m.sequence === sequence ? { ...m, ...patch } : m)))
    // Instalments 2..n must still add up to what's left after the booking payment (instalment 1).
    const booked = preview.filter((m) => m.status === 'PAID').reduce((sum, m) => sum + Number(m.amount), 0)
    const balance = Number(total) - booked
    const planned = upcoming.reduce((sum, m) => sum + (Number(m.amount) || 0), 0)
    const amountsValid = upcoming.every((m) => Number(m.amount) > 0) && Math.abs(planned - balance) < 1

    return (
      <Modal
        open={open}
        onClose={onClose}
        size="lg"
        title="Review milestones"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPreview(null)}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            <Button
              variant="secondary"
              loading={loading}
              disabled={!datesValid || !amountsValid || previewing}
              onClick={() =>
                onSubmit(entries, {
                  ...paymentTerms,
                  frequency,
                  due_dates: upcoming.map((m) => m.due_date),
                  amounts: upcoming.map((m) => m.amount),
                })
              }
            >
              Approve &amp; generate
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 rounded-lg bg-ink-50/60 p-3 text-sm">
            <Summary label="Offered price" value={formatCurrency(total)} />
            <Summary label="Paid outside app" value={formatCurrency(paid)} />
            <Summary label="Balance" value={`${formatCurrency(Number(total) - paid)} over ${upcoming.length} instalments`} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-ink-200 bg-ink-50/50 p-1">
              {(
                [
                  { v: 'MONTHLY', label: 'Monthly' },
                  { v: 'WEEKLY', label: 'Weekly' },
                ] as const
              ).map((f) => (
                <button
                  key={f.v}
                  type="button"
                  disabled={previewing}
                  onClick={() => f.v !== frequency && review(f.v)}
                  className={clsx(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    frequency === f.v ? 'bg-white text-ink-800 shadow-sm ring-1 ring-ink-100' : 'text-ink-500 hover:text-ink-700',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-400">Switching resets the dates and amounts. You can change any due date or amount below.</p>
          </div>
          <div className="overflow-hidden rounded-lg border border-ink-100">
            <table className="w-full text-sm">
              <thead className="bg-ink-50/60 text-left text-xs text-ink-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Instalment</th>
                  <th className="px-3 py-2 font-medium">Due</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {preview.map((m) => {
                  const error = m.status === 'UPCOMING' ? dateError(m) : null
                  return (
                    <tr key={m.sequence}>
                      <td className="px-3 py-2 text-ink-700">{m.name}</td>
                      <td className="px-3 py-2 text-ink-500">
                        {m.status === 'UPCOMING' ? (
                          <>
                            <Input
                              type="date"
                              value={m.due_date}
                              onChange={(e) => setRow(m.sequence, { due_date: e.target.value })}
                              className={clsx('h-8 py-1', error && 'border-red-300')}
                              aria-invalid={!!error}
                            />
                            {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
                          </>
                        ) : (
                          formatDate(m.due_date)
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-800">
                        {m.status === 'UPCOMING' ? (
                          <Input
                            type="number"
                            min={0}
                            value={m.amount}
                            onChange={(e) => setRow(m.sequence, { amount: e.target.value })}
                            className={clsx('ml-auto h-8 w-32 py-1 text-right', !(Number(m.amount) > 0) && 'border-red-300')}
                          />
                        ) : (
                          formatCurrency(m.amount)
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Badge>{m.status}</Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {!amountsValid && (
            <p className="text-xs text-red-600">
              The instalments add up to {formatCurrency(planned)} but {formatCurrency(balance)} is left to pay.
            </p>
          )}
          <p className="text-xs text-ink-400">Approving saves these milestones and issues the payment receipt for instalment 1.</p>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Approve Step 2 & generate payment receipt"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {terms ? (
            <Button variant="secondary" loading={previewing} disabled={!valid || !termsValid} onClick={() => review()}>
              Review milestones
            </Button>
          ) : (
            <Button variant="secondary" loading={loading} disabled={!valid} onClick={() => onSubmit(entries)}>
              Approve &amp; generate
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {terms && (
          <div className="space-y-3 rounded-lg border border-ink-100 bg-ink-50/40 p-3">
            <div>
              <p className="text-xs font-semibold text-ink-700">Payment terms</p>
              <p className="text-xs text-ink-400">
                The verified payments below are what was paid outside the app and become instalment 1. The rest of the offered price is split
                over the remaining instalments.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <FieldWrap
                label="Offered price"
                required
                hint={terms.listPrice && Number(total) !== Number(terms.listPrice) ? `List price ${formatCurrency(terms.listPrice)}` : undefined}
                error={total && Number(total) <= paid ? 'Must be more than paid' : undefined}
              >
                <Input type="number" min={0} value={total} onChange={(e) => setTotal(e.target.value)} />
              </FieldWrap>
              <FieldWrap label="Paid outside app">
                <Input value={formatCurrency(paid)} disabled />
              </FieldWrap>
              <FieldWrap label="Instalments" required error={instalments && Number(instalments) < 2 ? 'At least 2' : undefined}>
                <Input type="number" min={2} value={instalments} onChange={(e) => setInstalments(e.target.value)} />
              </FieldWrap>
            </div>
          </div>
        )}
        <p className="text-sm text-ink-500">
          Add each payment shown on the customer&apos;s receipt. Every row prints as its own table on the PDF, and the
          total becomes Instalment 1.
        </p>
        {entries.map((entry, i) => (
          <div key={i} className="rounded-lg border border-ink-100 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-600">Payment {i + 1}</span>
              {entries.length > 1 && (
                <button
                  type="button"
                  onClick={() => setEntries(entries.filter((_, idx) => idx !== i))}
                  className="rounded p-1 text-ink-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={`Remove payment ${i + 1}`}
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <FieldWrap label="Payment by" required>
                <Input
                  list="receipt-payment-modes"
                  value={entry.payment_by}
                  onChange={(e) => update(i, { payment_by: e.target.value })}
                />
              </FieldWrap>
              <FieldWrap label="Payment date" required>
                <Input type="date" value={entry.payment_date} onChange={(e) => update(i, { payment_date: e.target.value })} />
              </FieldWrap>
              <FieldWrap label="Amount" required>
                <Input type="number" min="0" value={entry.amount} onChange={(e) => update(i, { amount: e.target.value })} />
              </FieldWrap>
              <FieldWrap label="Bank" required>
                <Input value={entry.bank} placeholder="e.g. SBI Bank" onChange={(e) => update(i, { bank: e.target.value })} />
              </FieldWrap>
              <FieldWrap label="Txn ID / Chq. no." required>
                <Input value={entry.reference} placeholder="UTR, UPI ref or cheque no." onChange={(e) => update(i, { reference: e.target.value })} />
              </FieldWrap>
            </div>
          </div>
        ))}
        <datalist id="receipt-payment-modes">
          <option value="UPI" />
          <option value="NEFT" />
          <option value="RTGS" />
          <option value="IMPS" />
          <option value="Cheque" />
          <option value="Cash" />
        </datalist>
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={() => setEntries([...entries, blankEntry()])}>
            <Plus className="size-4" /> Add payment
          </Button>
          <div className="text-sm">
            <span className="text-ink-500">Receipt total </span>
            <span className="font-semibold text-ink-800">{formatCurrency(paid)}</span>
            {initialAmount && Number(initialAmount) !== paid && (
              <span className="ml-2 text-xs text-amber-700">(customer entered {formatCurrency(initialAmount)})</span>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-ink-400">{label}</p>
      <p className="font-semibold tabular-nums text-ink-800">{value}</p>
    </div>
  )
}
