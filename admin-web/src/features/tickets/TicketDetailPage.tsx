'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Send } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Textarea, Select } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { useAssignTicket, useReplyTicket, useSetTicketStatus, useTicket } from './api'
import { useAdminUsers } from '@/features/settings/api'
import clsx from 'clsx'

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const toast = useToast()
  const { data: ticket, isLoading, error } = useTicket(id)
  const reply = useReplyTicket(Number(id))
  const assign = useAssignTicket(Number(id))
  const setStatus = useSetTicketStatus(Number(id))
  const { data: adminUsers } = useAdminUsers({ page: 1 })

  const [message, setMessage] = useState('')

  if (isLoading) return <FullPageSpinner />
  if (error || !ticket) return <ErrorState message={apiErrorMessage(error, 'Ticket not found')} />

  const sendReply = async () => {
    if (!message.trim()) return
    try {
      await reply.mutateAsync({ message })
      setMessage('')
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <div>
      <button onClick={() => router.push('/tickets')} className="mb-3 flex items-center gap-1 text-sm text-ink-400 hover:text-ink-700">
        <ArrowLeft className="size-4" /> Back to tickets
      </button>
      <PageHeader title={ticket.subject} subtitle={`${ticket.customer_email} · ${ticket.category}`} actions={<Badge>{ticket.status}</Badge>} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader title="Conversation" />
            <CardBody className="space-y-3">
              <p className="rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-600">{ticket.description}</p>
              <div className="space-y-3">
                {ticket.messages.map((m) => (
                  <div
                    key={m.id}
                    className={clsx(
                      'max-w-[80%] rounded-xl px-3 py-2 text-sm',
                      m.sender_type === 'ADMIN' ? 'ml-auto bg-gold-100 text-ink-800' : 'bg-ink-100 text-ink-700',
                    )}
                  >
                    <p>{m.message}</p>
                    {m.attachment && (
                      <a href={m.attachment} target="_blank" rel="noreferrer" className="mt-1 block text-xs underline">
                        Attachment
                      </a>
                    )}
                    <p className="mt-1 text-[10px] text-ink-400">
                      {m.sender_name} &middot; {formatDateTime(m.created_at)}
                    </p>
                  </div>
                ))}
              </div>
              {ticket.status !== 'CLOSED' && (
                <div className="space-y-2 border-t border-ink-100 pt-3">
                  <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Type a reply…" />
                  <div className="flex justify-end">
                    <Button variant="secondary" loading={reply.isPending} onClick={sendReply} disabled={!message.trim()}>
                      <Send className="size-4" /> Send reply
                    </Button>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Manage" />
            <CardBody className="space-y-4">
              <div>
                <p className="mb-1 text-xs text-ink-400">Status</p>
                <Select
                  value={ticket.status}
                  onChange={async (e) => {
                    try {
                      await setStatus.mutateAsync(e.target.value)
                      toast.success('Status updated')
                    } catch (err) {
                      toast.error(apiErrorMessage(err))
                    }
                  }}
                >
                  <option value="OPEN">Open</option>
                  <option value="IN_PROGRESS">In progress</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="CLOSED">Closed</option>
                </Select>
              </div>
              <div>
                <p className="mb-1 text-xs text-ink-400">Assigned to</p>
                <Select
                  value={ticket.assigned_to ?? ''}
                  onChange={async (e) => {
                    try {
                      await assign.mutateAsync(e.target.value ? Number(e.target.value) : null)
                      toast.success('Assignment updated')
                    } catch (err) {
                      toast.error(apiErrorMessage(err))
                    }
                  }}
                >
                  <option value="">Unassigned</option>
                  {adminUsers?.results.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.first_name || u.email} ({u.role})
                    </option>
                  ))}
                </Select>
              </div>
              <div className="text-xs text-ink-400">
                <p>Created {formatDateTime(ticket.created_at)}</p>
                <p>Updated {formatDateTime(ticket.updated_at)}</p>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}
