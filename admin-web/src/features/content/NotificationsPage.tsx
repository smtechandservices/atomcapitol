'use client'

import { useEffect, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import {
  Bell,
  Building2,
  Check,
  Copy,
  FilePen,
  Info,
  Mail,
  Megaphone,
  Pencil,
  Plus,
  Search,
  Send,
  Smartphone,
  Trash2,
  Users,
  UsersRound,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, StatCard } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea, FieldWrap } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FullPageSpinner, Spinner } from '@/components/ui/Spinner'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { formatAge, formatDateTime } from '@/lib/format'
import { useAllProjects } from '@/features/projects/api'
import { useCustomerLookup } from '@/features/customers/api'
import { useCan } from '@/lib/permissions'
import type { CampaignChannel, CampaignTargetType, NotificationCampaign } from '@/types'
import {
  useCampaignStats,
  useCampaigns,
  useCreateCampaign,
  useDeleteCampaign,
  useRecipientPreview,
  useSendCampaign,
  useUpdateCampaign,
  type CampaignFormValues,
} from './api'

type Tab = '' | 'DRAFT' | 'SENT'
type Picked = { id: number; name: string; email: string }

const CHANNEL_META: Record<CampaignChannel, { label: string; icon: ReactNode }> = {
  BOTH: { label: 'Push + Email', icon: <Bell className="size-3.5" /> },
  PUSH: { label: 'Push', icon: <Smartphone className="size-3.5" /> },
  EMAIL: { label: 'Email', icon: <Mail className="size-3.5" /> },
}

function audienceLabel(c: NotificationCampaign) {
  if (c.target_type === 'PROJECT') return c.target_project_name ?? 'A project'
  if (c.target_type === 'SELECTED') return `${c.target_customers.length} selected customer${c.target_customers.length === 1 ? '' : 's'}`
  return 'All customers'
}

const TITLE_MAX = 200
const PUSH_SOFT_LIMIT = 180

export function NotificationsPage() {
  const [tab, setTab] = useState<Tab>('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [composer, setComposer] = useState<{ campaign?: NotificationCampaign; duplicate?: boolean } | null>(null)
  const [sendTarget, setSendTarget] = useState<NotificationCampaign | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<NotificationCampaign | null>(null)
  const toast = useToast()
  const del = useDeleteCampaign()

  const { data: stats } = useCampaignStats()
  const { data, isLoading, error } = useCampaigns({ page, status: tab || undefined, search: search || undefined })
  const rows = data?.results ?? []
  const totalPages = data ? Math.max(1, Math.ceil(data.count / 20)) : 1

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: '', label: 'All', count: stats ? stats.drafts + stats.sent : undefined },
    { key: 'DRAFT', label: 'Drafts', count: stats?.drafts },
    { key: 'SENT', label: 'Sent', count: stats?.sent },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications & Email"
        subtitle="Write an announcement, save it as a draft, and send it to all customers, a project, or a hand-picked list"
        actions={
          <Button variant="secondary" onClick={() => setComposer({})}>
            <Plus className="size-4" /> New campaign
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Campaigns sent" value={stats?.sent ?? '—'} icon={<Megaphone className="size-5" />} accent="gold" className="py-6" />
        <StatCard
          label={stats?.last_sent_at ? `Messages delivered · last ${formatAge(stats.last_sent_at)} ago` : 'Messages delivered'}
          value={stats?.delivered ?? '—'}
          icon={<Send className="size-5" />}
          accent="success"
          className="py-6"
        />
        <StatCard label="Drafts" value={stats?.drafts ?? '—'} icon={<FilePen className="size-5" />} accent="ink" className="py-6" />
        <StatCard label="Active customers reachable" value={stats?.reachable ?? '—'} icon={<UsersRound className="size-5" />} accent="ink" className="py-6" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 p-4">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
            <Input
              className="pl-9"
              placeholder="Search campaigns by title"
              value={search}
              onChange={(e) => {
                setPage(1)
                setSearch(e.target.value)
              }}
            />
          </div>
          <div className="flex shrink-0 rounded-lg border border-ink-200 bg-ink-50/50 p-0.5">
            {tabs.map((t) => (
              <button
                key={t.key || 'all'}
                onClick={() => {
                  setPage(1)
                  setTab(t.key)
                }}
                className={clsx(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  tab === t.key ? 'bg-white text-ink-800 shadow-sm ring-1 ring-ink-100' : 'text-ink-500 hover:text-ink-800',
                )}
              >
                {t.label}
                {t.count !== undefined && <span className="tabular-nums text-ink-400">{t.count}</span>}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <FullPageSpinner />
        ) : error ? (
          <ErrorState message={apiErrorMessage(error)} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Megaphone className="size-6" />}
            title={search || tab ? 'No campaigns match' : 'No campaigns yet'}
            subtitle={search || tab ? 'Try a different search or tab.' : 'Write your first announcement to customers.'}
            action={
              !search &&
              !tab && (
                <Button variant="secondary" size="sm" className="mt-2" onClick={() => setComposer({})}>
                  <Plus className="size-4" /> New campaign
                </Button>
              )
            }
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {rows.map((c) => (
              <CampaignRow
                key={c.id}
                campaign={c}
                onOpen={() => setComposer({ campaign: c })}
                onSend={() => setSendTarget(c)}
                onDuplicate={() => setComposer({ campaign: c, duplicate: true })}
                onDelete={() => setDeleteTarget(c)}
              />
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-ink-100 px-4 py-3">
            <p className="text-xs text-ink-400">
              Page {page} of {totalPages} · {data?.count}
            </p>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {composer && (
        <Composer
          key={`${composer.campaign?.id ?? 'new'}-${composer.duplicate ? 'dup' : ''}`}
          campaign={composer.duplicate ? undefined : composer.campaign}
          prefill={composer.duplicate ? composer.campaign : undefined}
          onClose={() => setComposer(null)}
        />
      )}

      {sendTarget && <SendConfirm campaign={sendTarget} onClose={() => setSendTarget(null)} />}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete draft"
        message={`Delete the draft "${deleteTarget?.title}"? Nothing has been sent, so customers won't notice.`}
        confirmLabel="Delete"
        danger
        loading={del.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return
          try {
            await del.mutateAsync(deleteTarget.id)
            toast.success('Draft deleted')
            setDeleteTarget(null)
          } catch (err) {
            toast.error(apiErrorMessage(err))
          }
        }}
      />
    </div>
  )
}

function CampaignRow({
  campaign: c,
  onOpen,
  onSend,
  onDuplicate,
  onDelete,
}: {
  campaign: NotificationCampaign
  onOpen: () => void
  onSend: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const sent = c.status === 'SENT'
  return (
    <li className="group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-ink-50/50">
      <span
        className={clsx(
          'mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl',
          sent ? 'bg-emerald-50 text-emerald-600' : 'bg-ink-50 text-ink-400',
        )}
      >
        {sent ? <Send className="size-4" /> : <FilePen className="size-4" />}
      </span>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-semibold text-ink-800 group-hover:text-ink-900">{c.title}</p>
          <span
            className={clsx(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
              sent ? 'bg-emerald-50 text-emerald-700' : 'bg-ink-100 text-ink-600',
            )}
          >
            {sent ? <Check className="size-3" /> : null}
            {sent ? 'Sent' : 'Draft'}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-sm text-ink-500">{c.body}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-400">
          <span className="flex items-center gap-1">
            {c.target_type === 'PROJECT' ? <Building2 className="size-3.5" /> : <Users className="size-3.5" />}
            {audienceLabel(c)}
          </span>
          <span className="flex items-center gap-1">
            {CHANNEL_META[c.channel].icon}
            {CHANNEL_META[c.channel].label}
          </span>
          {sent ? (
            <span>
              Sent {c.sent_at ? formatDateTime(c.sent_at) : ''} · <span className="font-medium text-ink-600">{c.recipient_count} recipients</span>
            </span>
          ) : (
            <span>
              Created {formatAge(c.created_at)} ago{c.created_by_email ? ` by ${c.created_by_email}` : ''}
            </span>
          )}
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-1.5">
        {sent ? (
          <Button size="sm" variant="outline" onClick={onDuplicate} title="Start a new draft from this campaign">
            <Copy className="size-3.5" /> Duplicate
          </Button>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={onOpen}>
              <Pencil className="size-3.5" /> Edit
            </Button>
            <Button size="sm" variant="secondary" onClick={onSend}>
              <Send className="size-3.5" /> Send
            </Button>
            <button onClick={onDelete} className="rounded-lg p-1.5 text-ink-300 hover:bg-red-50 hover:text-red-600" aria-label="Delete draft">
              <Trash2 className="size-4" />
            </button>
          </>
        )}
      </div>
    </li>
  )
}

/** Confirm sending a saved draft, showing exactly how many customers it will reach. */
function SendConfirm({ campaign: c, onClose }: { campaign: NotificationCampaign; onClose: () => void }) {
  const toast = useToast()
  const send = useSendCampaign()
  const { data: preview, isLoading } = useRecipientPreview({ target_type: c.target_type, target_project: c.target_project, target_customers: c.target_customers })
  return (
    <ConfirmDialog
      open
      title="Send campaign now?"
      message={
        isLoading
          ? 'Counting recipients…'
          : `"${c.title}" will go to ${preview?.count ?? 0} customer${preview?.count === 1 ? '' : 's'} (${audienceLabel(c)}). Sent campaigns can't be edited or recalled.`
      }
      confirmLabel={`Send to ${preview?.count ?? '…'}`}
      loading={send.isPending}
      onClose={onClose}
      onConfirm={async () => {
        try {
          const res = await send.mutateAsync(c.id)
          toast.success(`Sent to ${res.recipient_count} customers`)
          onClose()
        } catch (err) {
          toast.error(apiErrorMessage(err))
        }
      }}
    />
  )
}

/**
 * Create / edit a draft, view a sent campaign (read-only), or start a duplicate (`prefill`).
 * Footer: Save draft, or Send now (saves first, then sends after a recipient-count confirmation).
 */
function Composer({ campaign, prefill, onClose }: { campaign?: NotificationCampaign; prefill?: NotificationCampaign; onClose: () => void }) {
  const toast = useToast()
  const create = useCreateCampaign()
  const update = useUpdateCampaign()
  const send = useSendCampaign()
  // Support can send campaigns but can't read projects (Accounts-only), so the project audience is hidden for them.
  const canTargetProject = useCan()('projects')
  const { data: projects } = useAllProjects(canTargetProject)
  const source = campaign ?? prefill
  const readOnly = campaign?.status === 'SENT'

  const [title, setTitle] = useState(source?.title ?? '')
  const [body, setBody] = useState(source?.body ?? '')
  const [targetType, setTargetType] = useState<CampaignTargetType>(source?.target_type ?? 'ALL')
  const [projectId, setProjectId] = useState<number | null>(source?.target_project ?? null)
  const [picked, setPicked] = useState<Picked[]>(source?.target_customers_detail ?? [])
  const [channel, setChannel] = useState<CampaignChannel>(source?.channel ?? 'BOTH')
  const [confirmSend, setConfirmSend] = useState(false)

  const values: CampaignFormValues = {
    title: title.trim(),
    body: body.trim(),
    target_type: targetType,
    target_project: targetType === 'PROJECT' ? projectId : null,
    target_customers: targetType === 'SELECTED' ? picked.map((p) => p.id) : [],
    channel,
  }
  const { data: preview, isFetching: counting } = useRecipientPreview({
    target_type: targetType,
    target_project: values.target_project,
    target_customers: values.target_customers,
  })
  const audienceValid = targetType === 'ALL' || (targetType === 'PROJECT' && !!projectId) || (targetType === 'SELECTED' && picked.length > 0)
  const valid = !!values.title && !!values.body && audienceValid
  const busy = create.isPending || update.isPending || send.isPending

  const save = async () => {
    const saved = campaign ? await update.mutateAsync({ id: campaign.id, values }) : await create.mutateAsync(values)
    return saved
  }

  const saveDraft = async () => {
    try {
      await save()
      toast.success(campaign ? 'Draft saved' : 'Saved as draft')
      onClose()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const saveAndSend = async () => {
    try {
      const saved = await save()
      const res = await send.mutateAsync(saved.id)
      toast.success(`Sent to ${res.recipient_count} customers`)
      onClose()
    } catch (err) {
      toast.error(apiErrorMessage(err))
      setConfirmSend(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={readOnly ? 'Sent campaign' : campaign ? 'Edit draft' : prefill ? 'New campaign (copy)' : 'New campaign'}
      footer={
        readOnly ? (
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <span className="mr-auto flex items-center gap-1.5 text-xs text-ink-500">
              {counting ? <Spinner className="size-3.5" /> : <UsersRound className="size-3.5" />}
              {audienceValid ? (
                <>
                  Will reach <span className="font-semibold text-ink-800">{preview?.count ?? '…'}</span> active customer{preview?.count === 1 ? '' : 's'}
                </>
              ) : (
                'Choose who to send to'
              )}
            </span>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="outline" loading={create.isPending || update.isPending} disabled={!valid || busy} onClick={saveDraft}>
              Save draft
            </Button>
            <Button variant="secondary" disabled={!valid || busy || !preview?.count} onClick={() => setConfirmSend(true)}>
              <Send className="size-4" /> Send now
            </Button>
          </>
        )
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {readOnly && campaign && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <Check className="size-4" />
              Sent {campaign.sent_at ? formatDateTime(campaign.sent_at) : ''} to {campaign.recipient_count} customers. Sent campaigns can&apos;t be edited — duplicate it to reuse.
            </div>
          )}

          <FieldWrap label="Title" required hint={`${title.length}/${TITLE_MAX}`}>
            <Input value={title} maxLength={TITLE_MAX} disabled={readOnly} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Registry camp this Saturday" />
          </FieldWrap>
          <FieldWrap
            label="Message"
            required
            hint={body.length > PUSH_SOFT_LIMIT ? `${body.length} characters — push previews show about the first ${PUSH_SOFT_LIMIT}` : `${body.length} characters`}
          >
            <Textarea rows={5} value={body} disabled={readOnly} onChange={(e) => setBody(e.target.value)} placeholder="What do customers need to know?" />
          </FieldWrap>

          <div className="space-y-3">
            <p className="text-xs font-medium text-ink-600">Send to</p>
            <Segmented
              value={targetType}
              disabled={readOnly}
              onChange={setTargetType}
              options={[
                { value: 'ALL', label: 'All customers', icon: <UsersRound className="size-3.5" /> },
                ...(canTargetProject || targetType === 'PROJECT'
                  ? [{ value: 'PROJECT' as const, label: 'A project', icon: <Building2 className="size-3.5" /> }]
                  : []),
                { value: 'SELECTED', label: 'Selected customers', icon: <Users className="size-3.5" /> },
              ]}
            />
            {targetType === 'PROJECT' && (
              <Select value={projectId ?? ''} disabled={readOnly} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Select project</option>
                {projects?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            )}
            {targetType === 'SELECTED' && <CustomerMultiPicker value={picked} onChange={setPicked} disabled={readOnly} />}
            <p className="text-xs text-ink-400">Only active customers receive campaigns.</p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-ink-600">Channel</p>
            <Segmented
              value={channel}
              disabled={readOnly}
              onChange={setChannel}
              options={(['BOTH', 'PUSH', 'EMAIL'] as const).map((c) => ({ value: c, label: CHANNEL_META[c].label, icon: CHANNEL_META[c].icon }))}
            />
            <p className="flex gap-1.5 text-xs text-ink-400">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              Today every campaign lands in the customer&apos;s in-app notifications, and is also emailed to customers who opted in to email — whichever channel is picked.
            </p>
          </div>
        </div>

        <MessagePreview title={title} body={body} />
      </div>

      {confirmSend && (
        <ConfirmDialog
          open
          title="Send campaign now?"
          message={`This saves the campaign and sends it to ${preview?.count ?? 0} customer${preview?.count === 1 ? '' : 's'}. Sent campaigns can't be edited or recalled.`}
          confirmLabel={`Send to ${preview?.count ?? 0}`}
          loading={busy}
          onClose={() => setConfirmSend(false)}
          onConfirm={saveAndSend}
        />
      )}
    </Modal>
  )
}

/** How the announcement looks as an app notification and as an email. */
function MessagePreview({ title, body }: { title: string; body: string }) {
  return (
    // Sticky inside the modal body (the scroll container) so it stays in view while the form scrolls.
    <div className="space-y-4 rounded-xl bg-ink-50/70 p-4 lg:sticky lg:top-0 lg:self-start">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Preview</p>
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs text-ink-500">
          <Smartphone className="size-3.5" /> App notification
        </p>
        <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-ink-100">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-md bg-ink-800 text-[10px] font-bold text-gold-300">AC</span>
            <span className="text-[11px] font-medium text-ink-500">Atom Capitol · now</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-ink-900">{title || 'Your title'}</p>
          <p className="mt-0.5 line-clamp-3 text-sm text-ink-600">{body || 'Your message appears here.'}</p>
        </div>
      </div>
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs text-ink-500">
          <Mail className="size-3.5" /> Email
        </p>
        <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-ink-100">
          <div className="border-b border-ink-100 px-3 py-2 text-xs">
            <p className="text-ink-400">
              Subject: <span className="font-medium text-ink-800">{title || 'Your title'}</span>
            </p>
          </div>
          <p className="max-h-40 overflow-y-auto whitespace-pre-line px-3 py-2.5 text-sm text-ink-700">{body || 'Your message appears here.'}</p>
        </div>
      </div>
    </div>
  )
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; icon?: ReactNode }[]
  disabled?: boolean
}) {
  return (
    <div className="grid gap-1 rounded-lg border border-ink-200 bg-ink-50/50 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={clsx(
            'flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed',
            value === o.value ? 'bg-white text-ink-800 shadow-sm ring-1 ring-ink-100' : 'text-ink-500 hover:text-ink-700',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Search customers and collect a list (chips). */
function CustomerMultiPicker({ value, onChange, disabled }: { value: Picked[]; onChange: (v: Picked[]) => void; disabled?: boolean }) {
  const [text, setText] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 250)
    return () => clearTimeout(t)
  }, [text])
  const { data, isFetching } = useCustomerLookup(debounced, !!debounced && !disabled)
  const pickedIds = new Set(value.map((v) => v.id))
  const toggle = (c: Picked) => onChange(pickedIds.has(c.id) ? value.filter((v) => v.id !== c.id) : [...value, c])

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-gold-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-gold-800 ring-1 ring-gold-200">
              {c.name || c.email}
              {!disabled && (
                <button type="button" onClick={() => toggle(c)} className="rounded-full p-0.5 hover:bg-gold-200" aria-label={`Remove ${c.name || c.email}`}>
                  <X className="size-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {!disabled && (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
            <Input className="pl-9 pr-9" placeholder="Search customers by name, email, phone or plot" value={text} onChange={(e) => setText(e.target.value)} />
            {isFetching && <Spinner className="absolute right-3 top-1/2 size-4 -translate-y-1/2" />}
          </div>
          {debounced && (
            <ul className="max-h-48 divide-y divide-ink-100 overflow-y-auto rounded-lg border border-ink-100">
              {data?.results.map((c) => {
                const on = pickedIds.has(c.id)
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => toggle({ id: c.id, name: c.name, email: c.email })}
                      className={clsx('flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gold-50/60', !c.is_active && 'opacity-50')}
                    >
                      <span className={clsx('flex size-4 shrink-0 items-center justify-center rounded border', on ? 'border-gold-600 bg-gold-500 text-ink-900' : 'border-ink-300')}>
                        {on && <Check className="size-3" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink-800">{c.name || c.email}</p>
                        <p className="truncate text-xs text-ink-400">
                          {c.email}
                          {!c.is_active && ' · inactive — won’t receive'}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-ink-400">{c.plot_number ?? ''}</span>
                    </button>
                  </li>
                )
              })}
              {data?.results.length === 0 && <li className="px-3 py-4 text-center text-xs text-ink-400">No customers match.</li>}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
