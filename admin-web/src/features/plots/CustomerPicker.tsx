'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import clsx from 'clsx'
import { AlertTriangle, Mail, Search, UserPlus, X } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { useCustomerLookup } from '@/features/customers/api'
import type { CustomerListItem } from '@/types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type PickedBuyer =
  | { kind: 'existing'; customer: CustomerListItem; blockedReason: string | null }
  | { kind: 'new'; email: string }
  | null

/** Why a customer can't take this plot, or null if they can. Mirrors the backend's assign_plot rules. */
export type BlockRule = (c: CustomerListItem) => string | null

function initialsOf(c: CustomerListItem) {
  return (c.name || c.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}

/**
 * Email field with customer suggestions. Empty input lists customers without a plot;
 * typing searches all customers. A brand-new email is accepted as a new customer.
 */
export function CustomerPicker({
  value,
  onChange,
  blockedReason,
  autoFocus,
}: {
  value: PickedBuyer
  onChange: (next: PickedBuyer) => void
  blockedReason: BlockRule
  autoFocus?: boolean
}) {
  const [text, setText] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 250)
    return () => clearTimeout(t)
  }, [text])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const { data, isFetching } = useCustomerLookup(debounced, value?.kind !== 'existing')
  const results = (data?.results ?? [])
    .map((c) => ({ customer: c, blocked: blockedReason(c) }))
    // selectable customers first
    .sort((a, b) => Number(!!a.blocked) - Number(!!b.blocked))

  const typed = text.trim().toLowerCase()
  const exact = results.find((r) => r.customer.email.toLowerCase() === typed)
  const canUseNew = EMAIL_RE.test(typed) && !exact
  // options = customer rows (+ "use new email" row at the end)
  const optionCount = results.length + (canUseNew ? 1 : 0)

  // Keep the parent in sync with free typing: an exact match counts as that customer, a valid email as new.
  const syncTyped = (raw: string) => {
    setText(raw)
    setHighlight(0)
    setOpen(true)
    const t = raw.trim().toLowerCase()
    onChange(EMAIL_RE.test(t) ? { kind: 'new', email: t } : null)
  }

  // When the debounced lookup reveals the typed email belongs to an existing customer, adopt it.
  useEffect(() => {
    if (value?.kind === 'new' && exact && exact.customer.email.toLowerCase() === value.email) {
      onChange({ kind: 'existing', customer: exact.customer, blockedReason: exact.blocked })
    }
  }, [value, exact, onChange])

  const pick = (index: number) => {
    if (index < results.length) {
      const r = results[index]
      if (r.blocked) return
      onChange({ kind: 'existing', customer: r.customer, blockedReason: null })
      setText('')
      setOpen(false)
    } else if (canUseNew) {
      onChange({ kind: 'new', email: typed })
      setOpen(false)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlight((h) => Math.min(h + 1, optionCount - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter' && open && optionCount) {
      e.preventDefault()
      pick(highlight)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  // Existing customer chosen: show them as a card instead of the input.
  if (value?.kind === 'existing') {
    const c = value.customer
    return (
      <div
        className={clsx(
          'flex items-center gap-3 rounded-lg border p-3',
          value.blockedReason ? 'border-red-200 bg-red-50/50' : 'border-gold-300 bg-gold-50/50',
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink-800 text-xs font-semibold text-gold-300">{initialsOf(c)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-800">{c.name || c.email}</p>
          <p className="truncate text-xs text-ink-500">
            {c.name ? `${c.email} · ` : ''}
            {c.phone || 'No phone'}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge>{c.kyc_status}</Badge>
            {value.blockedReason ? (
              <span className="flex items-center gap-1 text-xs font-medium text-red-600">
                <AlertTriangle className="size-3.5" /> {value.blockedReason}
              </span>
            ) : (
              <span className="text-xs text-ink-400">Existing customer</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(null)
            setText('')
          }}
          className="self-start rounded-lg p-1 text-ink-400 hover:bg-white hover:text-ink-700"
          aria-label="Change customer"
        >
          <X className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
        <input
          autoFocus={autoFocus}
          type="text"
          inputMode="email"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          value={text}
          onChange={(e) => syncTyped(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search customers or type a new email"
          className="w-full rounded-lg border border-ink-200 bg-white py-2 pl-9 pr-9 text-sm text-ink-800 placeholder:text-ink-300 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-100"
        />
        {isFetching && <Spinner className="absolute right-3 top-1/2 size-4 -translate-y-1/2" />}
      </div>

      {value?.kind === 'new' && !open && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-500">
          <UserPlus className="size-3.5 text-emerald-600" /> New customer — <span className="font-medium text-ink-700">{value.email}</span> will get app access.
        </p>
      )}

      {open && (
        <div id={listId} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-ink-100 bg-white shadow-lg">
          <p className="border-b border-ink-100 bg-ink-50/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            {debounced ? 'Matching customers' : 'Customers without a plot'}
          </p>
          <ul className="max-h-64 overflow-y-auto py-1">
            {results.map(({ customer: c, blocked }, i) => (
              <li
                key={c.id}
                role="option"
                aria-selected={highlight === i}
                aria-disabled={!!blocked}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(i)
                }}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2',
                  blocked ? 'cursor-not-allowed opacity-55' : 'cursor-pointer',
                  highlight === i && !blocked && 'bg-gold-50',
                )}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[11px] font-semibold text-ink-600">{initialsOf(c)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink-800">{c.name || c.email}</p>
                  <p className="truncate text-xs text-ink-400">{c.name ? c.email : c.phone || '—'}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge>{c.kyc_status}</Badge>
                  {blocked ? (
                    <span className="max-w-[160px] truncate text-[11px] text-ink-500" title={blocked}>
                      {blocked}
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-emerald-600">{c.plot_id ? `On ${c.plot_number}` : 'No plot'}</span>
                  )}
                </div>
              </li>
            ))}

            {canUseNew && (
              <li
                role="option"
                aria-selected={highlight === results.length}
                onMouseEnter={() => setHighlight(results.length)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(results.length)
                }}
                className={clsx(
                  'flex cursor-pointer items-center gap-3 border-t border-ink-100 px-3 py-2.5',
                  highlight === results.length && 'bg-gold-50',
                )}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <Mail className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink-800">
                    Use <span className="font-medium">{typed}</span>
                  </p>
                  <p className="text-xs text-ink-400">New customer — creates their account and grants app access</p>
                </div>
              </li>
            )}

            {results.length === 0 && !canUseNew && (
              <li className="px-3 py-4 text-center text-xs text-ink-400">
                {isFetching ? 'Searching…' : debounced ? 'No customers match. Type a full email to add a new one.' : 'Every customer already has a plot. Type an email to add a new one.'}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
