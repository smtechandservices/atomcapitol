'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  Mail,
  Pencil,
  Phone,
  Plus,
  Power,
  Search,
  Trash2,
  UserMinus,
  UserPlus,
  UserRound,
  Users,
  UsersRound,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, StatCard } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select, FieldWrap } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FileDropzone } from '@/components/ui/FileDropzone'
import { FullPageSpinner, Spinner } from '@/components/ui/Spinner'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { absoluteMediaUrl } from '@/lib/format'
import { useCustomers } from '@/features/customers/api'
import type { CustomerListItem, SalesPerson } from '@/types'
import {
  useAllSalesPeople,
  useAssignCustomers,
  useCreateSalesPerson,
  useDeleteSalesPerson,
  useMoveAllCustomers,
  useUnassignCustomers,
  useUpdateSalesPerson,
} from './api'

type StatusFilter = '' | 'true' | 'false'

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')

function Avatar({ person, size = 'md' }: { person: Pick<SalesPerson, 'name' | 'photo'>; size?: 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'size-16 text-lg' : 'size-10 text-xs'
  return person.photo ? (
    // eslint-disable-next-line @next/next/no-img-element -- dynamic Django media host, not a next/image candidate
    <img src={absoluteMediaUrl(person.photo) ?? undefined} alt="" className={clsx('shrink-0 rounded-full bg-ink-100 object-cover', cls)} />
  ) : (
    <span className={clsx('flex shrink-0 items-center justify-center rounded-full bg-gold-100 font-semibold text-gold-800', cls)}>{initialsOf(person.name)}</span>
  )
}

export function SalesTeamPage() {
  const { data: people, isLoading, error } = useAllSalesPeople()
  const { data: unlinked } = useCustomers({ assigned_sales_person__isnull: 'true', page: 1 })
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [formFor, setFormFor] = useState<SalesPerson | 'new' | null>(null)

  const all = people ?? []
  const visible = all.filter(
    (p) =>
      (!status || String(p.is_active) === status) &&
      (!search || [p.name, p.email, p.phone].some((v) => v?.toLowerCase().includes(search.toLowerCase()))),
  )
  const selected = all.find((p) => p.id === selectedId) ?? visible[0] ?? null
  const maxLoad = Math.max(1, ...all.map((p) => p.customer_count))
  const activeCount = all.filter((p) => p.is_active).length
  const linkedTotal = all.reduce((s, p) => s + p.customer_count, 0)
  const hiddenFromApp = all.filter((p) => !p.is_active).reduce((s, p) => s + p.customer_count, 0)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sales Team"
        subtitle="Contacts shown to customers in the app — each customer sees the one sales person linked to them"
        actions={
          <Button variant="secondary" onClick={() => setFormFor('new')}>
            <Plus className="size-4" /> Add sales person
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label={`Active sales people · ${all.length} total`} value={people ? activeCount : '—'} icon={<UsersRound className="size-5" />} accent="ink" className="py-6" />
        <StatCard label="Customers with a contact" value={people ? linkedTotal - hiddenFromApp : '—'} icon={<Users className="size-5" />} accent="success" className="py-6" />
        <StatCard label="Customers without a contact" value={unlinked?.count ?? '—'} icon={<UserRound className="size-5" />} accent="gold" className="py-6" />
        <StatCard
          label="Linked to an inactive person"
          value={people ? hiddenFromApp : '—'}
          icon={<AlertTriangle className="size-5" />}
          accent={hiddenFromApp ? 'danger' : 'ink'}
          className="py-6"
        />
      </div>

      <Card className="overflow-clip">
        {isLoading ? (
          <FullPageSpinner />
        ) : error ? (
          <ErrorState message={apiErrorMessage(error)} />
        ) : all.length === 0 ? (
          <EmptyState
            icon={<UsersRound className="size-6" />}
            title="No sales people yet"
            subtitle="Add your team so customers know who to call."
            action={
              <Button variant="secondary" size="sm" className="mt-2" onClick={() => setFormFor('new')}>
                <Plus className="size-4" /> Add sales person
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr]">
            {/* Team list — pinned while the detail panel scrolls */}
            <div className="flex max-h-[420px] flex-col border-b border-ink-100 lg:sticky lg:top-0 lg:max-h-screen lg:self-start lg:border-b-0">
              <div className="space-y-2 border-b border-ink-100 p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
                  <Input className="pl-9" placeholder="Search team" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div className="grid grid-cols-3 gap-1 rounded-lg border border-ink-200 bg-ink-50/50 p-0.5">
                  {(
                    [
                      ['', 'All'],
                      ['true', 'Active'],
                      ['false', 'Inactive'],
                    ] as const
                  ).map(([v, l]) => (
                    <button
                      key={v || 'all'}
                      onClick={() => setStatus(v)}
                      className={clsx(
                        'rounded-md py-1 text-xs font-medium transition-colors',
                        status === v ? 'bg-white text-ink-800 shadow-sm ring-1 ring-ink-100' : 'text-ink-500 hover:text-ink-800',
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <ul className="min-h-0 flex-1 divide-y divide-ink-100 overflow-y-auto">
                {visible.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => setSelectedId(p.id)}
                      className={clsx(
                        'flex w-full items-center gap-3 border-l-2 px-4 py-3 text-left transition-colors',
                        selected?.id === p.id ? 'border-gold-500 bg-gold-50/70' : 'border-transparent hover:bg-ink-50/70',
                        !p.is_active && 'opacity-60',
                      )}
                    >
                      <Avatar person={p} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-ink-800">{p.name}</p>
                          {!p.is_active && <span className="shrink-0 rounded-full bg-ink-100 px-1.5 text-[10px] font-medium text-ink-500">Inactive</span>}
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                            <div className="h-full rounded-full bg-gold-500" style={{ width: `${(p.customer_count / maxLoad) * 100}%` }} />
                          </div>
                          <span className="w-16 shrink-0 text-right text-xs tabular-nums text-ink-500">
                            {p.customer_count} cust.
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
                {visible.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-400">No one matches.</li>}
              </ul>
            </div>

            {selected && <PersonPanel key={selected.id} person={selected} team={all} onEdit={() => setFormFor(selected)} onDeleted={() => setSelectedId(null)} />}
          </div>
        )}
      </Card>

      {formFor && (
        <SalesPersonForm
          person={formFor === 'new' ? undefined : formFor}
          onClose={() => setFormFor(null)}
          onCreated={(id) => setSelectedId(id)}
        />
      )}
    </div>
  )
}

function PersonPanel({ person: p, team, onEdit, onDeleted }: { person: SalesPerson; team: SalesPerson[]; onEdit: () => void; onDeleted: () => void }) {
  const toast = useToast()
  const update = useUpdateSalesPerson()
  const remove = useDeleteSalesPerson()
  const unassign = useUnassignCustomers()
  const assign = useAssignCustomers()
  const moveAll = useMoveAllCustomers()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [moveTo, setMoveTo] = useState('')
  const [moveAllTo, setMoveAllTo] = useState('')
  const [assignOpen, setAssignOpen] = useState(false)
  const [confirm, setConfirm] = useState<'delete' | 'remove' | null>(null)

  const { data: customers, isLoading } = useCustomers({ assigned_sales_person: p.id, search: search || undefined, page })
  const rows = customers?.results ?? []
  const totalPages = customers ? Math.max(1, Math.ceil(customers.count / 20)) : 1
  const others = team.filter((t) => t.id !== p.id && t.is_active)
  const allOnPageChecked = rows.length > 0 && rows.every((r) => checked.has(r.id))

  const run = async (fn: () => Promise<{ detail: string }>) => {
    try {
      const res = await fn()
      toast.success(res.detail)
      setChecked(new Set())
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const toggleActive = async () => {
    try {
      await update.mutateAsync({ id: p.id, values: { is_active: !p.is_active } })
      toast.success(p.is_active ? `${p.name} deactivated — hidden from their customers` : `${p.name} is active again`)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <div className="min-w-0 space-y-5 p-5 lg:border-l lg:border-ink-100">
      {/* Profile */}
      <div className="flex flex-wrap items-start gap-4">
        <Avatar person={p} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-semibold text-ink-900">{p.name}</h2>
            <Badge tone={p.is_active ? 'success' : 'neutral'}>{p.is_active ? 'Active' : 'Inactive'}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-500">
            <a href={`tel:${p.phone}`} className="flex items-center gap-1.5 hover:text-ink-800">
              <Phone className="size-3.5" /> {p.phone}
            </a>
            <a href={`mailto:${p.email}`} className="flex items-center gap-1.5 hover:text-ink-800">
              <Mail className="size-3.5" /> {p.email}
            </a>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="size-3.5" /> Edit
          </Button>
          <Button size="sm" variant="ghost" loading={update.isPending} onClick={toggleActive}>
            <Power className="size-3.5" /> {p.is_active ? 'Deactivate' : 'Activate'}
          </Button>
          <button onClick={() => setConfirm('delete')} className="rounded-lg p-1.5 text-ink-300 hover:bg-red-50 hover:text-red-600" aria-label="Delete sales person">
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      {/* Inactive with customers: they currently see no contact — offer a handover */}
      {!p.is_active && p.customer_count > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="size-5 shrink-0 text-amber-600" />
          <p className="min-w-0 flex-1 text-sm text-amber-900">
            {p.customer_count} customer{p.customer_count === 1 ? '' : 's'} linked to {p.name} see no sales contact while they&apos;re inactive.
          </p>
          <div className="flex items-center gap-2">
            <div className="w-44">
              <Select value={moveAllTo} onChange={(e) => setMoveAllTo(e.target.value)}>
                <option value="">Move all to…</option>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={!moveAllTo}
              loading={moveAll.isPending}
              onClick={() => run(() => moveAll.mutateAsync({ fromId: p.id, toId: Number(moveAllTo) }))}
            >
              Move
            </Button>
          </div>
        </div>
      )}

      {/* Linked customers */}
      <div className="rounded-xl border border-ink-100">
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-ink-800">Linked customers</p>
            <p className="text-xs text-ink-400">{p.customer_count} customer{p.customer_count === 1 ? '' : 's'} see {p.name} as their sales contact</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
              <Input
                className="pl-9"
                placeholder="Search linked"
                value={search}
                onChange={(e) => {
                  setPage(1)
                  setSearch(e.target.value)
                }}
              />
            </div>
            <Button size="sm" variant="secondary" onClick={() => setAssignOpen(true)}>
              <UserPlus className="size-3.5" /> Assign customers
            </Button>
          </div>
        </div>

        {checked.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 bg-gold-50/60 px-4 py-2.5">
            <span className="text-sm font-medium text-ink-800">{checked.size} selected</span>
            <div className="flex items-center gap-2">
              <div className="w-44">
                <Select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                  <option value="">Move to…</option>
                  {others.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!moveTo}
                loading={assign.isPending}
                onClick={() => run(() => assign.mutateAsync({ salesPersonId: Number(moveTo), customerIds: [...checked] }))}
              >
                <ArrowRightLeft className="size-3.5" /> Move
              </Button>
            </div>
            <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setConfirm('remove')}>
              <UserMinus className="size-3.5" /> Remove from {p.name.split(' ')[0]}
            </Button>
            <button onClick={() => setChecked(new Set())} className="ml-auto text-xs text-ink-400 hover:text-ink-700">
              Clear
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner className="size-6" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Users className="size-6" />}
            title={search ? 'No linked customers match' : 'No customers linked yet'}
            subtitle={search ? 'Try a different search.' : `Assign customers so they see ${p.name} in the app.`}
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/60 text-xs font-semibold uppercase tracking-wide text-ink-400">
                <th className="w-10 px-4 py-2.5">
                  <Checkbox
                    on={allOnPageChecked}
                    onClick={() =>
                      setChecked((prev) => {
                        const next = new Set(prev)
                        rows.forEach((r) => (allOnPageChecked ? next.delete(r.id) : next.add(r.id)))
                        return next
                      })
                    }
                  />
                </th>
                <th className="px-2 py-2.5 text-left">Customer</th>
                <th className="px-2 py-2.5 text-left">Plot</th>
                <th className="px-4 py-2.5 text-left">KYC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((c) => (
                <tr key={c.id} className={clsx(checked.has(c.id) && 'bg-gold-50/40')}>
                  <td className="px-4 py-2.5">
                    <Checkbox
                      on={checked.has(c.id)}
                      onClick={() =>
                        setChecked((prev) => {
                          const next = new Set(prev)
                          if (next.has(c.id)) next.delete(c.id)
                          else next.add(c.id)
                          return next
                        })
                      }
                    />
                  </td>
                  <td className="px-2 py-2.5">
                    <Link href={`/customers/${c.id}`} className="block min-w-0 hover:text-gold-700">
                      <p className="truncate font-medium text-ink-800">{c.name || c.email}</p>
                      {c.name && <p className="truncate text-xs text-ink-400">{c.email}</p>}
                    </Link>
                  </td>
                  <td className="px-2 py-2.5 text-ink-600">
                    {c.plot_number ? (
                      <>
                        {c.plot_number} <span className="text-xs text-ink-400">· {c.project_name}</span>
                      </>
                    ) : (
                      <span className="text-ink-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge>{c.kyc_status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-ink-100 px-4 py-2.5">
            <p className="text-xs text-ink-400">
              Page {page} of {totalPages} · {customers?.count}
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
      </div>

      {assignOpen && <AssignCustomersModal person={p} onClose={() => setAssignOpen(false)} />}

      <ConfirmDialog
        open={confirm === 'remove'}
        title="Remove sales contact"
        message={`${checked.size} customer${checked.size === 1 ? '' : 's'} will no longer see ${p.name} — or any sales contact — in the app until someone is assigned.`}
        confirmLabel="Remove"
        danger
        loading={unassign.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          await run(() => unassign.mutateAsync({ salesPersonId: p.id, customerIds: [...checked] }))
          setConfirm(null)
        }}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title={`Delete ${p.name}?`}
        message={
          p.customer_count
            ? `${p.customer_count} linked customer${p.customer_count === 1 ? '' : 's'} will be left without a sales contact. Move them first if they should keep one — or deactivate instead to keep the links.`
            : `${p.name} has no linked customers. This can't be undone.`
        }
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(p.id)
            toast.success(`${p.name} deleted`)
            setConfirm(null)
            onDeleted()
          } catch (err) {
            toast.error(apiErrorMessage(err))
          }
        }}
      />
    </div>
  )
}

function Checkbox({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={clsx('flex size-4 items-center justify-center rounded border', on ? 'border-gold-600 bg-gold-500 text-ink-900' : 'border-ink-300 bg-white')}
    >
      {on && <Check className="size-3" />}
    </button>
  )
}

/** Pick customers to link to `person`. Defaults to customers with no sales contact; others are moved over. */
function AssignCustomersModal({ person, onClose }: { person: SalesPerson; onClose: () => void }) {
  const toast = useToast()
  const assign = useAssignCustomers()
  const [onlyUnlinked, setOnlyUnlinked] = useState(true)
  const [text, setText] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [picked, setPicked] = useState<Map<number, CustomerListItem>>(new Map())
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(text.trim())
      setPage(1)
    }, 250)
    return () => clearTimeout(t)
  }, [text])

  const { data, isFetching } = useCustomers({
    search: debounced || undefined,
    assigned_sales_person__isnull: onlyUnlinked ? 'true' : undefined,
    page,
  })
  const rows = data?.results ?? []
  const totalPages = data ? Math.max(1, Math.ceil(data.count / 20)) : 1
  const moving = useMemo(() => [...picked.values()].filter((c) => c.sales_person_id).length, [picked])

  const toggle = (c: CustomerListItem) =>
    setPicked((prev) => {
      const next = new Map(prev)
      if (next.has(c.id)) next.delete(c.id)
      else next.set(c.id, c)
      return next
    })

  const submit = async () => {
    try {
      const res = await assign.mutateAsync({ salesPersonId: person.id, customerIds: [...picked.keys()] })
      toast.success(res.detail)
      onClose()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Assign customers to ${person.name}`}
      size="lg"
      footer={
        <>
          <span className="mr-auto text-xs text-ink-500">
            {picked.size} selected{moving > 0 && <span className="text-amber-700"> · {moving} will move from their current sales person</span>}
          </span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" loading={assign.isPending} disabled={picked.size === 0} onClick={submit}>
            Assign {picked.size || ''}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {!person.is_active && (
          <p className="flex gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {person.name} is inactive, so these customers won&apos;t see a sales contact until they&apos;re reactivated.
          </p>
        )}
        <div className="flex items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
            <Input autoFocus className="pl-9 pr-9" placeholder="Search by name, email, phone or plot" value={text} onChange={(e) => setText(e.target.value)} />
            {isFetching && <Spinner className="absolute right-3 top-1/2 size-4 -translate-y-1/2" />}
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-ink-600">
            <Checkbox
              on={onlyUnlinked}
              onClick={() => {
                setOnlyUnlinked((v) => !v)
                setPage(1)
              }}
            />
            Only without a sales person
          </label>
        </div>

        <ul className="max-h-[50vh] divide-y divide-ink-100 overflow-y-auto rounded-lg border border-ink-100">
          {rows.map((c) => {
            const already = c.sales_person_id === person.id
            const on = picked.has(c.id)
            return (
              <li key={c.id}>
                <button
                  type="button"
                  disabled={already}
                  onClick={() => toggle(c)}
                  className={clsx('flex w-full items-center gap-3 px-3 py-2.5 text-left', already ? 'cursor-default opacity-50' : 'hover:bg-gold-50/60', on && 'bg-gold-50/60')}
                >
                  <span className={clsx('flex size-4 shrink-0 items-center justify-center rounded border', on || already ? 'border-gold-600 bg-gold-500 text-ink-900' : 'border-ink-300')}>
                    {(on || already) && <Check className="size-3" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink-800">{c.name || c.email}</p>
                    <p className="truncate text-xs text-ink-400">
                      {c.email}
                      {c.plot_number && ` · ${c.plot_number}`}
                    </p>
                  </div>
                  <span className={clsx('shrink-0 text-xs', already ? 'text-ink-400' : c.sales_person_name ? 'text-amber-700' : 'text-ink-300')}>
                    {already ? 'Already linked' : c.sales_person_name ? `Now: ${c.sales_person_name}` : 'No sales person'}
                  </span>
                </button>
              </li>
            )
          })}
          {rows.length === 0 && !isFetching && <li className="px-3 py-8 text-center text-sm text-ink-400">No customers match.</li>}
        </ul>
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-ink-400">
            <span>
              Page {page} of {totalPages} · {data?.count} customers
            </span>
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
      </div>
    </Modal>
  )
}

function SalesPersonForm({ person, onClose, onCreated }: { person?: SalesPerson; onClose: () => void; onCreated: (id: number) => void }) {
  const toast = useToast()
  const create = useCreateSalesPerson()
  const update = useUpdateSalesPerson()
  const [name, setName] = useState(person?.name ?? '')
  const [phone, setPhone] = useState(person?.phone ?? '')
  const [email, setEmail] = useState(person?.email ?? '')
  const [photo, setPhoto] = useState<File | null>(null)

  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo])
  useEffect(() => () => void (photoUrl && URL.revokeObjectURL(photoUrl)), [photoUrl])
  const previewPhoto = photoUrl ?? (person?.photo ? absoluteMediaUrl(person.photo) : null)

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const valid = name.trim() && phone.trim() && emailValid

  const submit = async () => {
    try {
      if (person) {
        await update.mutateAsync({ id: person.id, values: { name: name.trim(), phone: phone.trim(), email: email.trim(), ...(photo ? { photo } : {}) } })
        toast.success('Saved')
      } else {
        const created = await create.mutateAsync({ name: name.trim(), phone: phone.trim(), email: email.trim(), photo: photo ?? undefined })
        toast.success(`${created.name} added`)
        onCreated(created.id)
      }
      onClose()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={person ? `Edit ${person.name}` : 'Add sales person'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" loading={create.isPending || update.isPending} disabled={!valid} onClick={submit}>
            {person ? 'Save changes' : 'Add'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          {previewPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob / dynamic media URL
            <img src={previewPhoto} alt="" className="size-16 shrink-0 rounded-full object-cover ring-2 ring-white" />
          ) : (
            <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-gold-100 text-lg font-semibold text-gold-800">
              {name ? initialsOf(name) : <UserRound className="size-6" />}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <FileDropzone file={photo} onChange={setPhoto} accept="image/*" hint={person?.photo ? 'Replace photo' : 'Shown to customers in the app'} compact />
          </div>
        </div>
        <FieldWrap label="Name" required>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </FieldWrap>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldWrap label="Phone" required>
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91" />
          </FieldWrap>
          <FieldWrap label="Email" required error={email && !emailValid ? 'Enter a valid email' : undefined}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </FieldWrap>
        </div>
        <p className="text-xs text-ink-400">Customers see this name, photo, phone and email as their sales contact. Sales people don&apos;t get a portal login.</p>
      </div>
    </Modal>
  )
}
