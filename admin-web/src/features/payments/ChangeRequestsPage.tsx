'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select, FieldWrap, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format'
import type { MilestoneChangeRequest, ScheduleItem } from '@/types'
import { useApproveChangeRequest, useChangeRequests, useCounterChangeRequest, useDeclineChangeRequest, useMilestones } from './api'
import { ScheduleEditor } from './ScheduleEditor'

export function ChangeRequestsPage() {
  const [status, setStatus] = useState('PENDING')
  const { data, isLoading, error } = useChangeRequests({ status: status || undefined })
  const [openRequest, setOpenRequest] = useState<MilestoneChangeRequest | null>(null)

  return (
    <div>
      <PageHeader title="Milestone Change Requests" subtitle="Customer requests to re-split the remaining balance" />

      <Card className="mb-5">
        <div className="flex items-center gap-3 p-4">
          <Select className="w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="DECLINED">Declined</option>
            <option value="COUNTERED">Countered</option>
          </Select>
        </div>
      </Card>

      {isLoading && <FullPageSpinner />}
      {!isLoading && error && <ErrorState message={apiErrorMessage(error)} />}
      {!isLoading && !error && (data?.results.length ?? 0) === 0 && (
        <Card>
          <EmptyState title="No change requests" />
        </Card>
      )}

      <div className="space-y-4">
        {data?.results.map((req) => (
          <Card key={req.id}>
            <CardHeader
              title={`${req.requested_by_email} — Plot ${req.plot_number}`}
              subtitle={req.change_type.replaceAll('_', ' ')}
              actions={<Badge>{req.status}</Badge>}
            />
            <CardBody>
              <p className="text-sm text-ink-600">{req.reason}</p>
              <p className="mt-2 text-xs text-ink-400">Requested {formatDateTime(req.created_at)}</p>
              {req.status === 'PENDING' && (
                <div className="mt-3">
                  <Button size="sm" onClick={() => setOpenRequest(req)}>
                    Review
                  </Button>
                </div>
              )}
              {req.status !== 'PENDING' && req.admin_response && (
                <p className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">{req.admin_response}</p>
              )}
            </CardBody>
          </Card>
        ))}
      </div>

      {openRequest && <ReviewModal request={openRequest} onClose={() => setOpenRequest(null)} />}
    </div>
  )
}

function ReviewModal({ request, onClose }: { request: MilestoneChangeRequest; onClose: () => void }) {
  const toast = useToast()
  const currentMilestones = useMilestones({ plot: request.plot })
  const approve = useApproveChangeRequest(request.id)
  const decline = useDeclineChangeRequest(request.id)
  const counter = useCounterChangeRequest(request.id)

  const [mode, setMode] = useState<'view' | 'counter' | 'decline'>('view')
  const [counterSchedule, setCounterSchedule] = useState<ScheduleItem[]>([])
  const [counterNote, setCounterNote] = useState('')
  const [declineReason, setDeclineReason] = useState('')

  const unpaidMilestones = currentMilestones.data?.results.filter((m) => m.status !== 'PAID') ?? []

  const doApprove = async () => {
    try {
      await approve.mutateAsync(undefined)
      toast.success('Change request approved as proposed')
      onClose()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const doDecline = async () => {
    try {
      await decline.mutateAsync(declineReason)
      toast.success('Change request declined')
      onClose()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const doCounter = async () => {
    try {
      await counter.mutateAsync({ schedule: counterSchedule, note: counterNote })
      toast.success('Counter-proposal sent to customer')
      onClose()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <Modal open onClose={onClose} title="Review milestone change request" size="lg">
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <h4 className="mb-2 text-sm font-semibold text-ink-700">Current schedule (unpaid)</h4>
            {currentMilestones.isLoading ? (
              <p className="text-sm text-ink-400">Loading…</p>
            ) : unpaidMilestones.length === 0 ? (
              <p className="text-sm text-ink-400">No unpaid milestones.</p>
            ) : (
              <ul className="space-y-1.5">
                {unpaidMilestones.map((m) => (
                  <li key={m.id} className="flex justify-between rounded-lg border border-ink-100 px-3 py-1.5 text-sm">
                    <span>{m.name}</span>
                    <span className="text-ink-500">
                      {formatCurrency(m.amount)} &middot; {formatDate(m.due_date)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h4 className="mb-2 text-sm font-semibold text-ink-700">Customer&apos;s proposal</h4>
            <p className="mb-2 text-sm text-ink-600">
              <Badge>{request.change_type.replaceAll('_', ' ')}</Badge>
            </p>
            <pre className="whitespace-pre-wrap rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">
              {JSON.stringify(request.proposed_details, null, 2)}
            </pre>
            <p className="mt-2 text-sm text-ink-600">{request.reason}</p>
            {request.attachment && (
              <a href={request.attachment} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-gold-700 underline">
                View attachment
              </a>
            )}
          </div>
        </div>

        {mode === 'view' && (
          <div className="flex flex-wrap gap-2 border-t border-ink-100 pt-4">
            <Button variant="secondary" loading={approve.isPending} onClick={doApprove}>
              Approve as proposed
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setCounterSchedule(unpaidMilestones.map((m) => ({ name: m.name, amount: m.amount, due_date: m.due_date })))
                setMode('counter')
              }}
            >
              Counter-propose
            </Button>
            <Button variant="danger" onClick={() => setMode('decline')}>
              Decline
            </Button>
          </div>
        )}

        {mode === 'decline' && (
          <div className="space-y-3 border-t border-ink-100 pt-4">
            <FieldWrap label="Reason" required>
              <Textarea rows={3} value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} />
            </FieldWrap>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setMode('view')}>
                Back
              </Button>
              <Button variant="danger" loading={decline.isPending} onClick={doDecline} disabled={!declineReason}>
                Confirm decline
              </Button>
            </div>
          </div>
        )}

        {mode === 'counter' && (
          <div className="space-y-3 border-t border-ink-100 pt-4">
            <h4 className="text-sm font-semibold text-ink-700">Propose a revised schedule</h4>
            <ScheduleEditor schedule={counterSchedule} onChange={setCounterSchedule} />
            <FieldWrap label="Note to customer">
              <Textarea rows={2} value={counterNote} onChange={(e) => setCounterNote(e.target.value)} />
            </FieldWrap>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setMode('view')}>
                Back
              </Button>
              <Button variant="secondary" loading={counter.isPending} onClick={doCounter} disabled={counterSchedule.length === 0}>
                Send counter-proposal
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
