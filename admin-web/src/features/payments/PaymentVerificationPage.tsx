'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle, FileText } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, FieldWrap, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { absoluteMediaUrl, formatCurrency, formatDate, formatDateTime } from '@/lib/format'
import type { PaymentProofQueueItem } from '@/types'
import { usePaymentVerificationQueue, useApprovePaymentProof, useRejectPaymentProof } from './api'

export function PaymentVerificationPage() {
  const [page, setPage] = useState(1)
  const { data, isLoading, error } = usePaymentVerificationQueue({ page })
  const [approveTarget, setApproveTarget] = useState<PaymentProofQueueItem | null>(null)
  const [rejectTarget, setRejectTarget] = useState<PaymentProofQueueItem | null>(null)

  return (
    <div>
      <PageHeader title="Payment Verification Queue" subtitle="Oldest submissions first — approve to mark paid and auto-generate a receipt" />

      {isLoading && <FullPageSpinner />}
      {!isLoading && error && <ErrorState message={apiErrorMessage(error)} />}
      {!isLoading && !error && (data?.results.length ?? 0) === 0 && (
        <Card>
          <EmptyState title="Nothing to review" subtitle="No customer payment proofs are pending right now." />
        </Card>
      )}

      <div className="space-y-4">
        {data?.results.map((proof) => (
          <Card key={proof.id}>
            <CardHeader
              title={`${proof.customer_name || proof.customer_email} — ${proof.milestone_name}`}
              subtitle={`${proof.project_name} · ${proof.plot_number}`}
              actions={<Badge>{proof.status}</Badge>}
            />
            <CardBody>
              <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                <Info label="Expected" value={formatCurrency(proof.expected_amount)} />
                <Info label="Claimed" value={formatCurrency(proof.claimed_amount)} />
                <Info label="Payment date" value={formatDate(proof.payment_date)} />
                <Info label="Mode / Ref" value={`${proof.payment_mode || '—'} / ${proof.transaction_reference || '—'}`} />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <a
                  href={absoluteMediaUrl(proof.file) ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-sm text-gold-700 hover:underline"
                >
                  <FileText className="size-4" /> View proof &middot; submitted {formatDateTime(proof.created_at)}
                </a>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setApproveTarget(proof)}>
                    <CheckCircle2 className="size-4" /> Approve
                  </Button>
                  <Button variant="danger" onClick={() => setRejectTarget(proof)}>
                    <XCircle className="size-4" /> Reject
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {approveTarget && <ApproveModal proof={approveTarget} onClose={() => setApproveTarget(null)} />}
      {rejectTarget && <RejectModal proof={rejectTarget} onClose={() => setRejectTarget(null)} />}

      {data && data.count > 20 && (
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={page * 20 >= data.count} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  )
}

function ApproveModal({ proof, onClose }: { proof: PaymentProofQueueItem; onClose: () => void }) {
  const toast = useToast()
  const approve = useApprovePaymentProof(proof.id)
  const [correctedAmount, setCorrectedAmount] = useState(proof.claimed_amount)
  const [correctedDate, setCorrectedDate] = useState(proof.payment_date)

  const submit = async () => {
    try {
      await approve.mutateAsync({
        corrected_amount: correctedAmount !== proof.claimed_amount ? correctedAmount : undefined,
        corrected_date: correctedDate !== proof.payment_date ? correctedDate : undefined,
      })
      toast.success('Payment approved — receipt generated')
      onClose()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Approve payment"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" loading={approve.isPending} onClick={submit}>
            Approve & generate receipt
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-500">Correct the amount/date if they don&apos;t match the actual transfer, or leave as declared.</p>
        <FieldWrap label="Amount">
          <Input type="number" value={correctedAmount} onChange={(e) => setCorrectedAmount(e.target.value)} />
        </FieldWrap>
        <FieldWrap label="Payment date">
          <Input type="date" value={correctedDate} onChange={(e) => setCorrectedDate(e.target.value)} />
        </FieldWrap>
      </div>
    </Modal>
  )
}

function RejectModal({ proof, onClose }: { proof: PaymentProofQueueItem; onClose: () => void }) {
  const toast = useToast()
  const reject = useRejectPaymentProof(proof.id)
  const [reason, setReason] = useState('')

  const submit = async () => {
    try {
      await reject.mutateAsync(reason)
      toast.success('Payment rejected — customer notified')
      onClose()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Reject payment proof"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={reject.isPending} onClick={submit} disabled={!reason}>
            Reject
          </Button>
        </>
      }
    >
      <FieldWrap label="Reason" required>
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Screenshot is unreadable" />
      </FieldWrap>
    </Modal>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-ink-400">{label}</p>
      <p className="mt-0.5 font-medium text-ink-700">{value}</p>
    </div>
  )
}
