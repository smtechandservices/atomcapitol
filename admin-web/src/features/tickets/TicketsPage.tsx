'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  FileText,
  Hammer,
  Inbox,
  LifeBuoy,
  MessageSquareReply,
  Paperclip,
  Phone,
  Receipt,
  RotateCcw,
  Search,
  Send,
  UserRound,
  UserRoundCheck,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, StatCard } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { absoluteMediaUrl, formatAge, formatDateTime } from '@/lib/format'
import type { TicketCategory, TicketDetail, TicketListItem, TicketMessage, TicketStatus } from '@/types'
import { useAssignTicket, useReplyTicket, useSetTicketStatus, useTicket, useTicketAssignees, useTicketStats, useTickets, type TicketFilters } from './api'

type View = 'awaiting' | 'active' | 'mine' | 'unassigned' | 'RESOLVED' | 'CLOSED' | 'all'

const STATUS_META: Record<TicketStatus, { label: string; dot: string }> = {
  OPEN: { label: 'Open', dot: 'bg-sky-500' },
  IN_PROGRESS: { label: 'In progress', dot: 'bg-amber-500' },
  RESOLVED: { label: 'Resolved', dot: 'bg-emerald-500' },
  CLOSED: { label: 'Closed', dot: 'bg-ink-300' },
}

const CATEGORY_META: Record<TicketCategory, { label: string; icon: ReactNode }> = {
  PAYMENT: { label: 'Payment', icon: <Receipt className="size-3" /> },
  DOCUMENTS: { label: 'Documents', icon: <FileText className="size-3" /> },
  CONSTRUCTION: { label: 'Construction', icon: <Hammer className="size-3" /> },
  GENERAL: { label: 'General', icon: <LifeBuoy className="size-3" /> },
}

const QUICK_REPLIES = [
  "Thanks for reaching out — we're looking into this and will update you shortly.",
  'Could you share a screenshot or the receipt so we can check?',
  'This has been resolved. Please check the app and let us know if anything is still off.',
]

const PAGE_SIZE = 20

const initialsOf = (name: string, email: string) =>
  (name || email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')

/** `initialId` comes from /tickets/[id] so deep links open the inbox on that ticket. */
export function TicketsPage({ initialId }: { initialId?: number }) {
  const { user } = useAuth()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [view, setView] = useState<View>(initialId ? 'all' : 'awaiting')
  const [selectedId, setSelectedId] = useState<number | null>(initialId ?? null)

  const viewFilter: Record<View, Partial<TicketFilters>> = {
    awaiting: { awaiting: 'true' },
    active: { status__in: 'OPEN,IN_PROGRESS' },
    mine: { status__in: 'OPEN,IN_PROGRESS', assigned_to: user ? String(user.id) : undefined },
    unassigned: { status__in: 'OPEN,IN_PROGRESS', assigned_to__isnull: 'true' },
    RESOLVED: { status: 'RESOLVED' },
    CLOSED: { status: 'CLOSED' },
    all: {},
  }

  const { data: stats } = useTicketStats()
  const { data, isLoading, error } = useTickets({ page, search: search || undefined, category: category || undefined, ...viewFilter[view] })
  const rows = data?.results ?? []
  const activeId = selectedId ?? rows[0]?.id ?? null
  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1

  const select = (id: number) => {
    setSelectedId(id)
    // Keep the URL shareable without remounting the inbox (filters and scroll survive).
    window.history.replaceState(null, '', `/tickets/${id}`)
  }

  const resetTo = (fn: () => void) => {
    setPage(1)
    setSelectedId(null)
    fn()
  }

  const views: { key: View; label: string; count?: number; dot?: string }[] = [
    { key: 'awaiting', label: 'Needs reply', count: stats?.awaiting_reply, dot: 'bg-gold-500' },
    { key: 'active', label: 'Active', count: stats ? stats.open + stats.in_progress : undefined, dot: 'bg-sky-500' },
    { key: 'mine', label: 'Assigned to me', count: stats?.mine_active },
    { key: 'unassigned', label: 'Unassigned', count: stats?.unassigned_active },
    { key: 'RESOLVED', label: 'Resolved', count: stats?.resolved, dot: 'bg-emerald-500' },
    { key: 'CLOSED', label: 'Closed', count: stats?.closed, dot: 'bg-ink-300' },
    { key: 'all', label: 'All' },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Support Tickets" subtitle="Customer queries — reply, assign and track them to resolution" />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Needs reply" value={stats?.awaiting_reply ?? '—'} icon={<MessageSquareReply className="size-5" />} accent="gold" className="py-6" />
        <StatCard label="Open & in progress" value={stats ? stats.open + stats.in_progress : '—'} icon={<Inbox className="size-5" />} accent="ink" className="py-6" />
        <StatCard label="Unassigned" value={stats?.unassigned_active ?? '—'} icon={<UserRound className="size-5" />} accent="danger" className="py-6" />
        <StatCard label="Assigned to me" value={stats?.mine_active ?? '—'} icon={<UserRoundCheck className="size-5" />} accent="success" className="py-6" />
      </div>

      <Card className="overflow-clip">
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4">
          <div className="flex items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
              <Input
                className="pl-9"
                placeholder="Search by subject, message, customer or plot"
                value={search}
                onChange={(e) => resetTo(() => setSearch(e.target.value))}
              />
            </div>
            {/* Select is w-full by default, so the wrapper sets its width */}
            <div className="w-44 shrink-0">
              <Select value={category} onChange={(e) => resetTo(() => setCategory(e.target.value))}>
                <option value="">All categories</option>
                {(Object.keys(CATEGORY_META) as TicketCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_META[c].label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
            {views.map((v) => {
              const active = view === v.key
              return (
                <button
                  key={v.key}
                  onClick={() => resetTo(() => setView(v.key))}
                  className={clsx(
                    'flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    active ? 'border-ink-800 bg-ink-800 text-white' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:bg-ink-50',
                  )}
                >
                  {v.dot && <span className={clsx('size-1.5 rounded-full', v.dot)} />}
                  {v.label}
                  {v.count !== undefined && (
                    <span className={clsx('rounded-full px-1.5 text-[10px] tabular-nums', active ? 'bg-white/15 text-gold-200' : 'bg-ink-100 text-ink-500')}>
                      {v.count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Inbox: fixed-height so the list and the conversation scroll independently */}
        <div className="grid h-[calc(100vh-150px)] min-h-[560px] grid-cols-1 lg:grid-cols-[380px_1fr]">
          <div className="flex min-h-0 flex-col border-b border-ink-100 lg:border-b-0 lg:border-r">
            {isLoading ? (
              <FullPageSpinner />
            ) : error ? (
              <ErrorState message={apiErrorMessage(error)} />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 className="size-6" />}
                title={view === 'awaiting' && !search && !category ? 'All caught up' : 'No tickets here'}
                subtitle={view === 'awaiting' && !search && !category ? 'No customer is waiting on a reply.' : 'Try a different filter.'}
              />
            ) : (
              <ul className="min-h-0 flex-1 divide-y divide-ink-100 overflow-y-auto">
                {rows.map((t) => (
                  <TicketListRow key={t.id} ticket={t} active={t.id === activeId} onClick={() => select(t.id)} />
                ))}
              </ul>
            )}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-ink-100 px-4 py-2.5">
                <p className="text-xs text-ink-400">
                  Page {page} of {totalPages} · {data?.count}
                </p>
                <div className="flex gap-1">
                  {[
                    { to: page - 1, disabled: page <= 1, icon: <ChevronLeft className="size-4" /> },
                    { to: page + 1, disabled: page >= totalPages, icon: <ChevronRight className="size-4" /> },
                  ].map((b, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setPage(b.to)
                        setSelectedId(null)
                      }}
                      disabled={b.disabled}
                      className="flex size-7 items-center justify-center rounded-lg border border-ink-100 text-ink-500 hover:bg-ink-50 disabled:opacity-40"
                    >
                      {b.icon}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="min-h-0 min-w-0">
            {activeId ? (
              <Conversation key={activeId} ticketId={activeId} />
            ) : (
              !isLoading && <EmptyState icon={<Inbox className="size-6" />} title="Select a ticket" subtitle="Pick a conversation from the list." />
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}

function TicketListRow({ ticket: t, active, onClick }: { ticket: TicketListItem; active: boolean; onClick: () => void }) {
  const awaiting = (t.status === 'OPEN' || t.status === 'IN_PROGRESS') && t.last_sender_type === 'CUSTOMER'
  return (
    <li>
      <button
        onClick={onClick}
        className={clsx(
          'flex w-full gap-3 border-l-2 px-4 py-3 text-left transition-colors',
          active ? 'border-gold-500 bg-gold-50/70' : 'border-transparent hover:bg-ink-50/70',
        )}
      >
        <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-ink-800 text-xs font-semibold text-gold-300">
          {initialsOf(t.customer_name, t.customer_email)}
          {awaiting && <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-gold-500 ring-2 ring-white" title="Needs reply" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className={clsx('truncate text-sm', awaiting ? 'font-semibold text-ink-900' : 'font-medium text-ink-700')}>{t.customer_name || t.customer_email}</p>
            <span className="shrink-0 text-[11px] tabular-nums text-ink-400">{formatAge(t.last_message_at ?? t.created_at)}</span>
          </div>
          <p className={clsx('truncate text-sm', awaiting ? 'font-medium text-ink-800' : 'text-ink-600')}>{t.subject}</p>
          <p className="truncate text-xs text-ink-400">
            {t.last_sender_type === 'ADMIN' && <span className="text-ink-500">You: </span>}
            {t.last_message || '—'}
          </p>
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-500">
            <span className="flex items-center gap-1">
              <span className={clsx('size-1.5 rounded-full', STATUS_META[t.status].dot)} />
              {STATUS_META[t.status].label}
            </span>
            <span className="text-ink-200">·</span>
            <span className="flex items-center gap-1">
              {CATEGORY_META[t.category].icon}
              {CATEGORY_META[t.category].label}
            </span>
            <span className="text-ink-200">·</span>
            <span className={clsx('truncate', !t.assigned_to_name && 'text-red-500')}>{t.assigned_to_name ?? 'Unassigned'}</span>
          </div>
        </div>
      </button>
    </li>
  )
}

function Conversation({ ticketId }: { ticketId: number }) {
  const toast = useToast()
  const { user } = useAuth()
  const { data: t, isLoading, error } = useTicket(String(ticketId))
  const { data: assignees } = useTicketAssignees()
  const reply = useReplyTicket(ticketId)
  const assign = useAssignTicket(ticketId)
  const setStatus = useSetTicketStatus(ticketId)
  const [message, setMessage] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const scroller = useRef<HTMLDivElement>(null)

  const messageCount = t?.messages.length ?? 0
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [messageCount])

  if (isLoading) return <FullPageSpinner />
  if (error || !t) return <ErrorState message={apiErrorMessage(error, 'Ticket not found')} />

  const closed = t.status === 'CLOSED'

  const changeStatus = async (status: TicketStatus, msg: string) => {
    try {
      await setStatus.mutateAsync(status)
      toast.success(msg)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const send = async (resolveAfter = false) => {
    // the API requires message text; an attachment is optional
    if (!message.trim()) return
    try {
      await reply.mutateAsync({ message: message.trim(), attachment: file ?? undefined })
      setMessage('')
      setFile(null)
      if (resolveAfter) await setStatus.mutateAsync('RESOLVED')
      toast.success(resolveAfter ? 'Reply sent and ticket resolved' : 'Reply sent')
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      send()
    }
  }

  // Current assignee may not be in the assignee list (e.g. an ACCOUNTS user) — keep them selectable.
  const assigneeOptions = [...(assignees ?? [])]
  if (t.assigned_to && !assigneeOptions.some((a) => a.id === t.assigned_to)) {
    assigneeOptions.push({ id: t.assigned_to, email: '', name: t.assigned_to_name ?? `Admin #${t.assigned_to}`, role: 'SUPPORT' })
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="space-y-3 border-b border-ink-100 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-ink-400">
              #{t.id} · {CATEGORY_META[t.category].label} · opened {formatDateTime(t.created_at)}
            </p>
            <h2 className="mt-0.5 truncate text-lg font-semibold text-ink-900">{t.subject}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {t.status !== 'RESOLVED' && !closed && (
              <Button size="sm" variant="outline" loading={setStatus.isPending} onClick={() => changeStatus('RESOLVED', 'Ticket resolved')}>
                <CheckCircle2 className="size-3.5" /> Resolve
              </Button>
            )}
            {(t.status === 'RESOLVED' || closed) && (
              <Button size="sm" variant="outline" loading={setStatus.isPending} onClick={() => changeStatus('OPEN', 'Ticket reopened')}>
                <RotateCcw className="size-3.5" /> Reopen
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <Link href={`/customers/${t.customer}`} className="flex items-center gap-1.5 font-medium text-ink-700 hover:text-gold-700">
            <UserRound className="size-3.5 text-ink-400" /> {t.customer_name || t.customer_email}
          </Link>
          {t.customer_phone && (
            <a href={`tel:${t.customer_phone}`} className="flex items-center gap-1.5 text-ink-500 hover:text-ink-800">
              <Phone className="size-3.5" /> {t.customer_phone}
            </a>
          )}
          {t.plot_number && (
            <span className="text-ink-500">
              {t.plot_number} · {t.project_name}
            </span>
          )}
          <Badge>{t.kyc_status}</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-400">Status</span>
            <div className="flex rounded-lg border border-ink-200 bg-ink-50/50 p-0.5">
              {(Object.keys(STATUS_META) as TicketStatus[]).map((s) => (
                <button
                  key={s}
                  disabled={setStatus.isPending || s === t.status}
                  onClick={() => changeStatus(s, `Marked ${STATUS_META[s].label.toLowerCase()}`)}
                  className={clsx(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    s === t.status ? 'bg-white text-ink-800 shadow-sm ring-1 ring-ink-100' : 'text-ink-500 hover:text-ink-800',
                  )}
                >
                  <span className={clsx('size-1.5 rounded-full', STATUS_META[s].dot)} />
                  {STATUS_META[s].label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-400">Assignee</span>
            <div className="w-48">
              <Select
                value={t.assigned_to ?? ''}
                disabled={assign.isPending}
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
                {assigneeOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.id === user?.id ? ' (you)' : ''}
                  </option>
                ))}
              </Select>
            </div>
            {user && t.assigned_to !== user.id && (
              <button
                onClick={async () => {
                  try {
                    await assign.mutateAsync(user.id)
                    toast.success('Assigned to you')
                  } catch (err) {
                    toast.error(apiErrorMessage(err))
                  }
                }}
                className="text-xs font-semibold text-gold-700 hover:text-gold-800"
              >
                Assign to me
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-ink-50/40 px-5 py-5">
        {t.messages.map((m, i) => {
          const prev = t.messages[i - 1]
          const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString()
          return (
            <div key={m.id} className="space-y-4">
              {newDay && (
                <div className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-wide text-ink-400">
                  <span className="h-px flex-1 bg-ink-100" />
                  {new Date(m.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  <span className="h-px flex-1 bg-ink-100" />
                </div>
              )}
              <MessageBubble message={m} ticket={t} />
            </div>
          )
        })}
        {closed && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-ink-400">
            <CircleDot className="size-3.5" /> Ticket closed — the customer can no longer reply. Reopen to continue.
          </p>
        )}
      </div>

      {/* Composer */}
      {!closed && (
        <div className="space-y-2 border-t border-ink-100 px-5 py-3">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REPLIES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setMessage((cur) => (cur.trim() ? `${cur.trim()}\n\n${q}` : q))}
                className="max-w-[260px] truncate rounded-full border border-ink-200 px-2.5 py-1 text-[11px] text-ink-500 hover:border-ink-300 hover:bg-ink-50"
                title={q}
              >
                {q}
              </button>
            ))}
          </div>
          <div className="rounded-lg border border-ink-200 focus-within:border-gold-500 focus-within:ring-2 focus-within:ring-gold-100">
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={`Reply to ${t.customer_name || t.customer_email}…`}
              className="block w-full resize-none rounded-t-lg border-0 bg-transparent px-3 py-2.5 text-sm text-ink-800 placeholder:text-ink-300 focus:outline-none"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 px-2 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-500 hover:bg-ink-50 hover:text-ink-800"
                >
                  <Paperclip className="size-3.5" /> Attach
                </button>
                {file && (
                  <span className="flex min-w-0 items-center gap-1 rounded-full bg-ink-100 py-0.5 pl-2 pr-1 text-xs text-ink-600">
                    <span className="truncate">{file.name}</span>
                    <button type="button" onClick={() => setFile(null)} className="rounded-full p-0.5 hover:bg-ink-200" aria-label="Remove attachment">
                      <X className="size-3" />
                    </button>
                  </span>
                )}
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null)
                    e.target.value = ''
                  }}
                />
                <span className="hidden text-[11px] text-ink-300 sm:inline">⌘/Ctrl + Enter to send</span>
              </div>
              <div className="flex items-center gap-2">
                {t.status !== 'RESOLVED' && (
                  <Button size="sm" variant="ghost" disabled={reply.isPending || !message.trim()} onClick={() => send(true)}>
                    Send &amp; resolve
                  </Button>
                )}
                <Button size="sm" variant="secondary" loading={reply.isPending} disabled={!message.trim()} onClick={() => send()}>
                  <Send className="size-3.5" /> Send
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MessageBubble({ message: m, ticket: t }: { message: TicketMessage; ticket: TicketDetail }) {
  const mine = m.sender_type === 'ADMIN'
  const url = absoluteMediaUrl(m.attachment)
  const isImage = url && /\.(png|jpe?g|gif|webp)($|\?)/i.test(url)
  return (
    <div className={clsx('flex gap-2.5', mine && 'flex-row-reverse')}>
      <span
        className={clsx(
          'flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
          mine ? 'bg-gold-500 text-ink-900' : 'bg-ink-800 text-gold-300',
        )}
      >
        {mine ? initialsOf(m.sender_name, '') || 'S' : initialsOf(t.customer_name, t.customer_email)}
      </span>
      <div className={clsx('flex max-w-[75%] flex-col gap-1', mine && 'items-end')}>
        <div
          className={clsx(
            'rounded-2xl px-3.5 py-2.5 text-sm shadow-sm',
            mine ? 'rounded-tr-sm bg-ink-800 text-white' : 'rounded-tl-sm bg-white text-ink-700 ring-1 ring-ink-100',
          )}
        >
          {m.message && <p className="whitespace-pre-line break-words">{m.message}</p>}
          {url &&
            (isImage ? (
              <a href={url} target="_blank" rel="noreferrer" className="mt-2 block">
                {/* eslint-disable-next-line @next/next/no-img-element -- dynamic Django media host, not a next/image candidate */}
                <img src={url} alt="Attachment" className="max-h-48 rounded-lg" />
              </a>
            ) : (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className={clsx('mt-2 flex items-center gap-1.5 text-xs underline', mine ? 'text-gold-200' : 'text-gold-700')}
              >
                <Paperclip className="size-3.5" /> {decodeURIComponent(url.split('/').pop() ?? 'Attachment')}
              </a>
            ))}
        </div>
        <p className="px-1 text-[11px] text-ink-400">
          {m.sender_name} · {formatDateTime(m.created_at)}
        </p>
      </div>
    </div>
  )
}
