'use client'

import { useState } from 'react'
import { Plus, Send, Clock } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea, FieldWrap } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { useAllProjects } from '@/features/projects/api'
import { useCampaigns, useCreateCampaign, useScheduleCampaign, useSendCampaign, type CampaignFormValues } from './api'

const emptyForm: CampaignFormValues = { title: '', body: '', target_type: 'ALL', channel: 'BOTH' }

export function NotificationsPage() {
  const { data, isLoading, error } = useCampaigns()
  const [createOpen, setCreateOpen] = useState(false)
  const toast = useToast()
  const sendCampaign = useSendCampaign()
  const scheduleCampaign = useScheduleCampaign()
  const [scheduleTarget, setScheduleTarget] = useState<number | null>(null)
  const [scheduleAt, setScheduleAt] = useState('')

  return (
    <div>
      <PageHeader
        title="Notifications & Email"
        subtitle="Compose push/email campaigns to all customers, a project, or a selected list"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> New campaign
          </Button>
        }
      />

      {isLoading && <FullPageSpinner />}
      {!isLoading && error && <ErrorState message={apiErrorMessage(error)} />}
      {!isLoading && !error && (data?.results.length ?? 0) === 0 && (
        <Card>
          <EmptyState title="No campaigns yet" />
        </Card>
      )}

      <div className="space-y-3">
        {data?.results.map((c) => (
          <Card key={c.id}>
            <CardHeader
              title={c.title}
              subtitle={`${c.target_type} · ${c.channel}${c.recipient_count ? ` · ${c.recipient_count} recipients` : ''}`}
              actions={<Badge tone={c.status === 'SENT' ? 'success' : c.status === 'SCHEDULED' ? 'info' : 'neutral'}>{c.status}</Badge>}
            />
            <CardBody>
              <p className="text-sm text-ink-600">{c.body}</p>
              {c.status === 'DRAFT' && (
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={sendCampaign.isPending}
                    onClick={async () => {
                      try {
                        await sendCampaign.mutateAsync(c.id)
                        toast.success('Campaign sent')
                      } catch (err) {
                        toast.error(apiErrorMessage(err))
                      }
                    }}
                  >
                    <Send className="size-4" /> Send now
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setScheduleTarget(c.id)}>
                    <Clock className="size-4" /> Schedule
                  </Button>
                </div>
              )}
              {c.status === 'SCHEDULED' && c.scheduled_at && (
                <p className="mt-2 text-xs text-ink-400">Scheduled for {formatDateTime(c.scheduled_at)}</p>
              )}
              {c.status === 'SENT' && c.sent_at && <p className="mt-2 text-xs text-ink-400">Sent {formatDateTime(c.sent_at)}</p>}
            </CardBody>
          </Card>
        ))}
      </div>

      {createOpen && <CreateCampaignModal onClose={() => setCreateOpen(false)} />}

      <Modal
        open={!!scheduleTarget}
        onClose={() => setScheduleTarget(null)}
        title="Schedule campaign"
        footer={
          <>
            <Button variant="ghost" onClick={() => setScheduleTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              loading={scheduleCampaign.isPending}
              disabled={!scheduleAt}
              onClick={async () => {
                if (!scheduleTarget) return
                try {
                  await scheduleCampaign.mutateAsync({ id: scheduleTarget, scheduled_at: new Date(scheduleAt).toISOString() })
                  toast.success('Campaign scheduled')
                  setScheduleTarget(null)
                  setScheduleAt('')
                } catch (err) {
                  toast.error(apiErrorMessage(err))
                }
              }}
            >
              Schedule
            </Button>
          </>
        }
      >
        <FieldWrap label="Send at" required>
          <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
        </FieldWrap>
      </Modal>
    </div>
  )
}

function CreateCampaignModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const createCampaign = useCreateCampaign()
  const { data: projects } = useAllProjects()
  const [form, setForm] = useState<CampaignFormValues>(emptyForm)
  const [selectedIds, setSelectedIds] = useState('')

  const submit = async () => {
    try {
      await createCampaign.mutateAsync({
        ...form,
        target_project: form.target_type === 'PROJECT' ? Number(form.target_project) : undefined,
        target_customers:
          form.target_type === 'SELECTED'
            ? selectedIds.split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n))
            : undefined,
      })
      toast.success('Campaign created as draft')
      onClose()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New campaign"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" loading={createCampaign.isPending} onClick={submit} disabled={!form.title || !form.body}>
            Save as draft
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FieldWrap label="Title" required>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </FieldWrap>
        <FieldWrap label="Message" required>
          <Textarea rows={3} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        </FieldWrap>
        <div className="grid grid-cols-2 gap-3">
          <FieldWrap label="Target">
            <Select value={form.target_type} onChange={(e) => setForm({ ...form, target_type: e.target.value as CampaignFormValues['target_type'] })}>
              <option value="ALL">All customers</option>
              <option value="PROJECT">A project</option>
              <option value="SELECTED">Selected customers</option>
            </Select>
          </FieldWrap>
          <FieldWrap label="Channel">
            <Select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as CampaignFormValues['channel'] })}>
              <option value="BOTH">Push + Email</option>
              <option value="PUSH">Push only</option>
              <option value="EMAIL">Email only</option>
            </Select>
          </FieldWrap>
        </div>
        {form.target_type === 'PROJECT' && (
          <FieldWrap label="Project" required>
            <Select value={form.target_project ?? ''} onChange={(e) => setForm({ ...form, target_project: Number(e.target.value) })}>
              <option value="">Select project</option>
              {projects?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FieldWrap>
        )}
        {form.target_type === 'SELECTED' && (
          <FieldWrap label="Customer IDs" required hint="Comma-separated customer IDs (see Customers list)">
            <Input value={selectedIds} onChange={(e) => setSelectedIds(e.target.value)} placeholder="1, 2, 5" />
          </FieldWrap>
        )}
      </div>
    </Modal>
  )
}
