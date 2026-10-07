'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import clsx from 'clsx'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  ListChecks,
  SkipForward,
  UserRound,
  XCircle,
} from 'lucide-react'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { FilePlaceholder, FilePreview } from '@/components/ui/FilePreview'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { absoluteMediaUrl, formatAge, formatCurrency, formatDate, formatDateTime } from '@/lib/format'
import type { KYCStepStatus, KycQueueDetail } from '@/types'
import { useCan } from '@/lib/permissions'
import { useDecideKyc, useKycSubmission, type KycDecisionPayload } from './api'
import { STEP_LABELS, ageTone, initialsOf } from './shared'

type Step = 'STEP2' | 'STEP3'
type Decision = 'APPROVED' | 'REJECTED'

const PRESET_REASONS: Record<Step, string[]> = {
  STEP2: [
    'Receipt is unreadable or blurry',
    "Amount doesn't match our records",
    'Payment date is missing or wrong',
    'Receipt is not for this plot',
    'Wrong document uploaded',
  ],
  STEP3: [
    'Face is not clearly visible',
    "Didn't read all the lines",
    'Audio is missing or unclear',
    'Video is too short or cut off',
    "Person doesn't match the account holder",
  ],
}

export function KycReviewPage() {
  const { id } = useParams<{ id: string }>()
  // Keyed so per-submission state (reasons, ticked lines) resets when moving to the next one.
  return <ReviewScreen key={id} id={id} />
}

function ReviewScreen({ id }: { id: string }) {
  const router = useRouter()
  const toast = useToast()
  const { data: s, isLoading, error } = useKycSubmission(id)
  const decide = useDecideKyc(Number(id))
  const [busy, setBusy] = useState<string | null>(null)
  const canSeeCustomers = useCan()('customers')

  if (isLoading) return <FullPageSpinner />
  if (error || !s) return <ErrorState message={apiErrorMessage(error, 'Submission not found')} />

  const bothPending = s.step2_status === 'PENDING' && s.step3_status === 'PENDING'
  const flagged = !s.plot_confirmed && s.step2_status !== null
  const waitingSince = s.step2_status === 'PENDING' ? s.step2_submitted_at : s.step3_status === 'PENDING' ? s.step3_submitted_at : null

  const goNext = (result: KycQueueDetail) => {
    if (result.step2_status === 'PENDING' || result.step3_status === 'PENDING') return
    if (result.queue.next_id) {
      router.push(`/kyc/${result.queue.next_id}`)
    } else {
      toast.success('Queue cleared — nothing left to review')
      router.push('/kyc')
    }
  }

  const submit = async (key: string, payload: KycDecisionPayload, message: string) => {
    setBusy(key)
    try {
      const result = await decide.mutateAsync(payload)
      toast.success(message)
      goNext(result)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const decideStep = (step: Step, decision: Decision, reason: string) =>
    submit(
      `${step}-${decision}`,
      step === 'STEP2'
        ? { step2_decision: decision, step2_reason: decision === 'REJECTED' ? reason : undefined }
        : { step3_decision: decision, step3_reason: decision === 'REJECTED' ? reason : undefined },
      `${STEP_LABELS[step]} ${decision === 'APPROVED' ? 'approved' : 'rejected'}`,
    )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/kyc" className="inline-flex items-center gap-1 text-sm text-ink-400 transition-colors hover:text-ink-700">
          <ArrowLeft className="size-4" /> KYC queue
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-ink-400">
            <span className="font-semibold tabular-nums text-ink-700">{s.queue.pending_count}</span> in queue
          </span>
          {s.queue.next_id && (
            <Button size="sm" variant="outline" onClick={() => router.push(`/kyc/${s.queue.next_id}`)}>
              Skip <SkipForward className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Customer header */}
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-ink-800 text-base font-semibold text-gold-300">
          {initialsOf(s.customer_name, s.customer_email)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold text-ink-800">{s.customer_name || s.customer_email}</h1>
            <Badge>{s.kyc_status}</Badge>
          </div>
          <p className="mt-0.5 truncate text-sm text-ink-400">
            {s.customer_email}
            {s.customer_phone && <> · {s.customer_phone}</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {waitingSince && (
            <span className={clsx('flex items-center gap-1.5 text-sm font-medium', ageTone(waitingSince))}>
              <Clock className="size-4" /> Waiting {formatAge(waitingSince)}
            </span>
          )}
          {canSeeCustomers && (
            <Link
              href={`/customers/${s.customer_id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-50"
            >
              <UserRound className="size-3.5" /> Profile
            </Link>
          )}
          {bothPending && (
            <Button
              variant="secondary"
              size="sm"
              loading={busy === 'both'}
              disabled={!!busy}
              onClick={() => submit('both', { step2_decision: 'APPROVED', step3_decision: 'APPROVED' }, 'Both steps approved')}
            >
              <CheckCircle2 className="size-4" /> Approve both
            </Button>
          )}
        </div>
      </Card>

      {flagged && (
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-semibold text-amber-900">Customer says the plot details don&apos;t match</p>
            <p className="mt-0.5 text-amber-800">{s.plot_mismatch_note || 'No note was left.'}</p>
            <p className="mt-1 text-xs text-amber-700">Check the plot on record below before approving the receipt.</p>
          </div>
        </div>
      )}

      {s.plot && (
        <Card className="grid grid-cols-2 gap-4 p-5 text-sm sm:grid-cols-5">
          <Info label="Project" value={s.plot.project.name} />
          <Info label="Plot" value={s.plot.plot_number} />
          <Info label="Size" value={s.plot.size} />
          <Info label="Block / sector" value={s.plot.block_sector || '—'} />
          <Info label="Total value" value={formatCurrency(s.plot.total_value)} />
        </Card>
      )}

      {/* Step 2 — receipt */}
      <Card>
        <CardHeader title="Step 2 · Plot confirmation & first receipt" subtitle={s.step2_submitted_at ? `Submitted ${formatDateTime(s.step2_submitted_at)}` : undefined} />
        <div className="grid grid-cols-1 lg:grid-cols-5">
          <div className="border-b border-ink-100 p-5 lg:col-span-3 lg:border-b-0 lg:border-r">
            <FilePreview title="Payment receipt" url={absoluteMediaUrl(s.receipt_file)} emptyText="No receipt uploaded yet" />
          </div>
          <div className="space-y-5 p-5 lg:col-span-2">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Info label="Receipt amount" value={formatCurrency(s.receipt_amount)} />
              <Info label="Payment date" value={formatDate(s.receipt_payment_date)} />
              <Info
                label="Plot confirmed"
                value={
                  s.step2_status === null ? (
                    '—'
                  ) : s.plot_confirmed ? (
                    <span className="text-emerald-700">Yes</span>
                  ) : (
                    <span className="text-amber-700">No — flagged</span>
                  )
                }
              />
            </dl>
            <DecisionPanel
              step="STEP2"
              status={s.step2_status}
              lastReason={s.step2_rejection_reason}
              busy={busy}
              onDecide={(d, reason) => decideStep('STEP2', d, reason)}
            />
          </div>
        </div>
      </Card>

      {/* Step 3 — video */}
      <VideoStep submission={s} busy={busy} onDecide={(d, reason) => decideStep('STEP3', d, reason)} />

      {s.decisions.length > 0 && (
        <Card>
          <CardHeader title="Decision history" />
          <CardBody>
            <ol className="relative space-y-4 border-l border-ink-100 pl-5">
              {s.decisions.map((d) => (
                <li key={d.id} className="relative">
                  <span
                    className={clsx(
                      'absolute -left-[27px] top-0.5 flex size-3.5 items-center justify-center rounded-full ring-4 ring-white',
                      d.decision === 'APPROVED' ? 'bg-emerald-500' : 'bg-red-500',
                    )}
                  />
                  <p className="text-sm text-ink-700">
                    <span className="font-semibold">{STEP_LABELS[d.step as Step] ?? d.step}</span>{' '}
                    <span className={d.decision === 'APPROVED' ? 'text-emerald-700' : 'text-red-700'}>{d.decision === 'APPROVED' ? 'approved' : 'rejected'}</span>
                    <span className="text-ink-400"> by {d.decided_by_name || d.decided_by_email || 'system'}</span>
                  </p>
                  {d.reason && <p className="mt-0.5 text-sm text-ink-500">&ldquo;{d.reason}&rdquo;</p>}
                  <p className="mt-0.5 text-xs text-ink-400">{formatDateTime(d.created_at)}</p>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      )}
    </div>
  )
}

function VideoStep({ submission: s, busy, onDecide }: { submission: KycQueueDetail; busy: string | null; onDecide: (d: Decision, reason: string) => void }) {
  const [ticked, setTicked] = useState<Set<number>>(new Set())
  const lines = s.prompt_lines ?? []
  const allTicked = lines.length > 0 && ticked.size === lines.length

  const toggle = (i: number) =>
    setTicked((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  return (
    <Card>
      <CardHeader title="Step 3 · Video KYC" subtitle={s.step3_submitted_at ? `Submitted ${formatDateTime(s.step3_submitted_at)}` : undefined} />
      <div className="grid grid-cols-1 lg:grid-cols-5">
        <div className="border-b border-ink-100 p-5 lg:col-span-3 lg:border-b-0 lg:border-r">
          {s.video_file ? (
            <video controls preload="metadata" className="aspect-video w-full rounded-lg bg-ink-900" src={absoluteMediaUrl(s.video_file) ?? undefined} />
          ) : (
            <FilePlaceholder icon={<FileText className="size-6" />} text="No video uploaded yet" />
          )}
        </div>
        <div className="space-y-5 p-5 lg:col-span-2">
          {lines.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
                  <ListChecks className="size-3.5" /> Lines to read
                </p>
                <span className={clsx('text-xs font-medium tabular-nums', allTicked ? 'text-emerald-600' : 'text-ink-400')}>
                  {ticked.size}/{lines.length} heard
                </span>
              </div>
              <ul className="space-y-1.5">
                {lines.map((line, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => toggle(i)}
                      className={clsx(
                        'flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                        ticked.has(i) ? 'border-emerald-200 bg-emerald-50/60 text-ink-700' : 'border-ink-100 text-ink-600 hover:bg-ink-50',
                      )}
                    >
                      <span
                        className={clsx(
                          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border',
                          ticked.has(i) ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-ink-300',
                        )}
                      >
                        {ticked.has(i) && <Check className="size-3" />}
                      </span>
                      &ldquo;{line}&rdquo;
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <DecisionPanel
            step="STEP3"
            status={s.step3_status}
            lastReason={s.step3_rejection_reason}
            busy={busy}
            approveHint={lines.length > 0 && !allTicked ? `${lines.length - ticked.size} line(s) not ticked yet` : undefined}
            onDecide={onDecide}
          />
        </div>
      </div>
    </Card>
  )
}

function DecisionPanel({
  step,
  status,
  lastReason,
  busy,
  approveHint,
  onDecide,
}: {
  step: Step
  status: KYCStepStatus | null
  lastReason: string
  busy: string | null
  approveHint?: string
  onDecide: (d: Decision, reason: string) => void
}) {
  const [reason, setReason] = useState('')

  if (status === null) {
    return <StateNote tone="neutral" title="Not submitted yet" body="The customer hasn't completed this step." />
  }
  if (status === 'APPROVED') {
    return <StateNote tone="success" title="Approved" />
  }
  if (status === 'REJECTED') {
    return <StateNote tone="danger" title="Rejected — waiting for the customer to resubmit" body={lastReason} />
  }

  const lines = reason.split('\n').map((l) => l.trim())
  const togglePreset = (preset: string) =>
    setReason((r) => (lines.includes(preset) ? lines.filter((l) => l && l !== preset).join('\n') : [r.trim(), preset].filter(Boolean).join('\n')))

  return (
    <div className="space-y-3 border-t border-ink-100 pt-4">
      {lastReason && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">Rejected before: {lastReason}</p>}
      <div>
        <p className="mb-1.5 text-xs font-medium text-ink-600">Rejection reason</p>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {PRESET_REASONS[step].map((preset) => {
            const on = lines.includes(preset)
            return (
              <button
                key={preset}
                type="button"
                onClick={() => togglePreset(preset)}
                className={clsx(
                  'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                  on ? 'border-red-300 bg-red-50 text-red-700' : 'border-ink-200 text-ink-500 hover:border-ink-300 hover:bg-ink-50',
                )}
              >
                {preset}
              </button>
            )
          })}
        </div>
        <Textarea rows={2} className="min-h-16" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Pick a reason above or write one — the customer sees this" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" loading={busy === `${step}-APPROVED`} disabled={!!busy} onClick={() => onDecide('APPROVED', '')}>
          <CheckCircle2 className="size-4" /> Approve
        </Button>
        <Button variant="danger" loading={busy === `${step}-REJECTED`} disabled={!!busy || !reason.trim()} onClick={() => onDecide('REJECTED', reason.trim())}>
          <XCircle className="size-4" /> Reject
        </Button>
        {approveHint && <span className="text-xs text-amber-600">{approveHint}</span>}
      </div>
    </div>
  )
}

function StateNote({ tone, title, body }: { tone: 'neutral' | 'success' | 'danger'; title: string; body?: string }) {
  const cls = {
    neutral: 'bg-ink-50 text-ink-600',
    success: 'bg-emerald-50 text-emerald-800',
    danger: 'bg-red-50 text-red-800',
  }[tone]
  return (
    <div className={clsx('rounded-lg px-4 py-3 text-sm', cls)}>
      <p className="font-semibold">{title}</p>
      {body && <p className="mt-0.5 opacity-80">{body}</p>}
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
