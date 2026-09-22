'use client'

import { useState, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Textarea, FieldWrap } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { absoluteMediaUrl, formatCurrency, formatDate, formatDateTime } from '@/lib/format'
import { useDecideKyc, useKycSubmission } from './api'

export function KycReviewPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const toast = useToast()
  const { data: submission, isLoading, error } = useKycSubmission(id)
  const decide = useDecideKyc(Number(id))

  const [step2Reason, setStep2Reason] = useState('')
  const [step3Reason, setStep3Reason] = useState('')

  if (isLoading) return <FullPageSpinner />
  if (error || !submission) return <ErrorState message={apiErrorMessage(error, 'Submission not found')} />

  const decideStep2 = async (decision: 'APPROVED' | 'REJECTED') => {
    try {
      await decide.mutateAsync({ step2_decision: decision, step2_reason: decision === 'REJECTED' ? step2Reason : undefined })
      toast.success(`Step 2 ${decision.toLowerCase()}`)
      setStep2Reason('')
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const decideStep3 = async (decision: 'APPROVED' | 'REJECTED') => {
    try {
      await decide.mutateAsync({ step3_decision: decision, step3_reason: decision === 'REJECTED' ? step3Reason : undefined })
      toast.success(`Step 3 ${decision.toLowerCase()}`)
      setStep3Reason('')
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const bothApproved = submission.step2_status === 'APPROVED' && submission.step3_status === 'APPROVED'

  return (
    <div>
      <button onClick={() => router.push('/kyc')} className="mb-3 flex items-center gap-1 text-sm text-ink-400 hover:text-ink-700">
        <ArrowLeft className="size-4" /> Back to queue
      </button>
      <PageHeader
        title={submission.customer_name || submission.customer_email}
        subtitle={submission.customer_email}
        actions={bothApproved ? <Badge tone="success">Fully approved — app unlocked</Badge> : undefined}
      />

      {submission.plot && (
        <Card className="mb-5">
          <CardHeader title="Plot on record" subtitle={submission.plot.project.name} />
          <CardBody>
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <Info label="Plot number" value={submission.plot.plot_number} />
              <Info label="Size" value={submission.plot.size} />
              <Info label="Block/Sector" value={submission.plot.block_sector || '—'} />
              <Info label="Total value" value={formatCurrency(submission.plot.total_value)} />
            </dl>
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Step 2 — Plot confirmation & first receipt" actions={submission.step2_status ? <Badge>{submission.step2_status}</Badge> : undefined} />
          <CardBody className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Plot confirmed by customer" value={submission.plot_confirmed ? 'Yes' : 'No / flagged'} />
              <Info label="Receipt amount" value={formatCurrency(submission.receipt_amount)} />
              <Info label="Payment date" value={formatDate(submission.receipt_payment_date)} />
              <Info label="Submitted" value={formatDateTime(submission.step2_submitted_at)} />
            </dl>
            {submission.plot_mismatch_note && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Mismatch note: {submission.plot_mismatch_note}</p>
            )}
            {submission.receipt_file && (
              <a
                href={absoluteMediaUrl(submission.receipt_file) ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="inline-block rounded-lg border border-ink-100 px-3 py-2 text-sm text-ink-700 hover:bg-ink-50"
              >
                View uploaded receipt
              </a>
            )}
            {submission.step2_rejection_reason && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">Last rejection reason: {submission.step2_rejection_reason}</p>
            )}
            {submission.step2_status !== 'APPROVED' && (
              <div className="space-y-2 border-t border-ink-100 pt-3">
                <FieldWrap label="Rejection reason" hint="Only needed if rejecting">
                  <Textarea rows={2} value={step2Reason} onChange={(e) => setStep2Reason(e.target.value)} />
                </FieldWrap>
                <div className="flex gap-2">
                  <Button variant="secondary" loading={decide.isPending} onClick={() => decideStep2('APPROVED')}>
                    <CheckCircle2 className="size-4" /> Approve Step 2
                  </Button>
                  <Button variant="danger" loading={decide.isPending} onClick={() => decideStep2('REJECTED')} disabled={!step2Reason}>
                    <XCircle className="size-4" /> Reject Step 2
                  </Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Step 3 — Video KYC" actions={submission.step3_status ? <Badge>{submission.step3_status}</Badge> : undefined} />
          <CardBody className="space-y-4">
            {submission.prompt_lines?.length > 0 && (
              <div>
                <p className="mb-1 text-xs text-ink-400">Lines the customer was asked to read</p>
                <ul className="list-inside list-disc text-sm text-ink-700">
                  {submission.prompt_lines.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
            {submission.video_file && (
              <video controls className="w-full rounded-lg bg-ink-900" src={absoluteMediaUrl(submission.video_file) ?? undefined} />
            )}
            <Info label="Submitted" value={formatDateTime(submission.step3_submitted_at)} />
            {submission.step3_rejection_reason && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">Last rejection reason: {submission.step3_rejection_reason}</p>
            )}
            {submission.step3_status !== 'APPROVED' && (
              <div className="space-y-2 border-t border-ink-100 pt-3">
                <FieldWrap label="Rejection reason" hint="Only needed if rejecting">
                  <Textarea rows={2} value={step3Reason} onChange={(e) => setStep3Reason(e.target.value)} />
                </FieldWrap>
                <div className="flex gap-2">
                  <Button variant="secondary" loading={decide.isPending} onClick={() => decideStep3('APPROVED')}>
                    <CheckCircle2 className="size-4" /> Approve Step 3
                  </Button>
                  <Button variant="danger" loading={decide.isPending} onClick={() => decideStep3('REJECTED')} disabled={!step3Reason}>
                    <XCircle className="size-4" /> Reject Step 3
                  </Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {submission.decisions.length > 0 && (
        <Card className="mt-5">
          <CardHeader title="Decision history" />
          <CardBody className="p-0">
            <ul className="divide-y divide-ink-100">
              {submission.decisions.map((d) => (
                <li key={d.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium text-ink-700">
                      {d.step} &middot; <Badge tone={d.decision === 'APPROVED' ? 'success' : 'danger'}>{d.decision}</Badge>
                    </p>
                    {d.reason && <p className="text-xs text-ink-400">{d.reason}</p>}
                  </div>
                  <div className="text-right text-xs text-ink-400">
                    <p>{d.decided_by_email ?? 'system'}</p>
                    <p>{formatDateTime(d.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  )
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink-700">{value}</dd>
    </div>
  )
}
