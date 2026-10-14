'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, FieldWrap } from '@/components/ui/Field'
import { formatCurrency } from '@/lib/format'
import type { ReceiptEntry } from './api'

const blankEntry = (amount = '', date = ''): ReceiptEntry => ({
  payment_by: 'UPI',
  payment_date: date,
  bank: '',
  reference: '',
  amount,
})

/** Collects the payment(s) behind the customer's first receipt; each becomes a table on the PDF. */
export function ReceiptEntriesModal({
  open,
  onClose,
  onSubmit,
  loading,
  initialAmount,
  initialDate,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (entries: ReceiptEntry[]) => void
  loading: boolean
  initialAmount: string | null
  initialDate: string | null
}) {
  const [entries, setEntries] = useState<ReceiptEntry[]>([])
  const [wasOpen, setWasOpen] = useState(false)

  // Re-seed from the customer's upload each time the modal opens
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setEntries([blankEntry(initialAmount ?? '', initialDate ?? '')])
  }

  const update = (i: number, patch: Partial<ReceiptEntry>) =>
    setEntries(entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)))

  const total = entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
  const valid = entries.length > 0 && entries.every((e) => e.payment_by.trim() && e.payment_date && Number(e.amount) > 0)

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
          <Button variant="secondary" loading={loading} disabled={!valid} onClick={() => onSubmit(entries)}>
            Approve &amp; generate
          </Button>
        </>
      }
    >
      <div className="space-y-4">
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
              <FieldWrap label="Bank">
                <Input value={entry.bank} placeholder="e.g. SBI Bank" onChange={(e) => update(i, { bank: e.target.value })} />
              </FieldWrap>
              <FieldWrap label="Chq. / Ref. no.">
                <Input value={entry.reference} onChange={(e) => update(i, { reference: e.target.value })} />
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
            <span className="font-semibold text-ink-800">{formatCurrency(total)}</span>
            {initialAmount && Number(initialAmount) !== total && (
              <span className="ml-2 text-xs text-amber-700">(customer entered {formatCurrency(initialAmount)})</span>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
