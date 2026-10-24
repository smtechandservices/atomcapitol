'use client'

import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { Check, Search } from 'lucide-react'
import { Select, FieldWrap } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { formatCurrency } from '@/lib/format'
import { useAllProjects } from '@/features/projects/api'
import type { Plot, PlotRole } from '@/types'
import { usePlots, type AssignPayload } from './api'

export interface AssignPlotValue {
  project: string
  plot: Plot | null
  role: PlotRole
}

export const emptyAssignPlot: AssignPlotValue = {
  project: '',
  plot: null,
  role: 'PRIMARY',
}

/** Why this plot can't take a buyer in `role`, or null. Mirrors backend assign_plot + sensible UX limits. */
function plotBlockReason(plot: Plot, role: PlotRole): string | null {
  const primary = plot.buyers.find((b) => b.plot_role === 'PRIMARY')
  if (role === 'PRIMARY' && primary) return `Primary: ${primary.name || primary.email}`
  if (role === 'CO_APPLICANT' && !primary) return 'No primary buyer yet'
  return null
}

export function assignPlotReady(v: AssignPlotValue) {
  return !!v.plot && !plotBlockReason(v.plot, v.role)
}

/** Payment terms aren't set here: they're entered when the primary buyer's KYC Step 2 (booking receipt) is approved. */
export function toAssignPayload(email: string, v: AssignPlotValue): AssignPayload {
  return { email, role: v.role }
}

/** Project → plot → role. Controlled. */
export function AssignPlotFields({ value, onChange }: { value: AssignPlotValue; onChange: (v: AssignPlotValue) => void }) {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const { data: projects } = useAllProjects()
  const { data: plots, isFetching } = usePlots({ project: value.project || undefined, search: debounced || undefined, page: 1 })

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  const set = (patch: Partial<AssignPlotValue>) => onChange({ ...value, ...patch })

  const rows = value.project
    ? (plots?.results ?? [])
        .map((p) => ({ plot: p, blocked: plotBlockReason(p, value.role) }))
        .sort((a, b) => Number(!!a.blocked) - Number(!!b.blocked))
    : []

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FieldWrap label="Project" required>
          <Select
            value={value.project}
            onChange={(e) => {
              setSearch('')
              set({ project: e.target.value, plot: null })
            }}
          >
            <option value="">Select project</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </FieldWrap>
        <FieldWrap label="Role">
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-ink-200 bg-ink-50/50 p-1">
            {(
              [
                { v: 'PRIMARY', label: 'Primary buyer' },
                { v: 'CO_APPLICANT', label: 'Co-applicant' },
              ] as const
            ).map((r) => (
              <button
                key={r.v}
                type="button"
                onClick={() => set({ role: r.v, plot: value.plot && plotBlockReason(value.plot, r.v) ? null : value.plot })}
                className={clsx(
                  'rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                  value.role === r.v ? 'bg-white text-ink-800 shadow-sm ring-1 ring-ink-100' : 'text-ink-500 hover:text-ink-700',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </FieldWrap>
      </div>

      {value.project && (
        <div>
          <span className="mb-1 block text-xs font-medium text-ink-600">
            Plot<span className="text-red-500"> *</span>
          </span>
          <div className="overflow-hidden rounded-lg border border-ink-200">
            <div className="relative border-b border-ink-100">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search plot number or block"
                className="w-full bg-transparent py-2 pl-9 pr-9 text-sm text-ink-800 placeholder:text-ink-300 focus:outline-none"
              />
              {isFetching && <Spinner className="absolute right-3 top-1/2 size-4 -translate-y-1/2" />}
            </div>
            <ul className="max-h-56 divide-y divide-ink-100 overflow-y-auto">
              {rows.map(({ plot, blocked }) => {
                const selected = value.plot?.id === plot.id
                return (
                  <li key={plot.id}>
                    <button
                      type="button"
                      disabled={!!blocked}
                      onClick={() => set({ plot })}
                      className={clsx(
                        'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                        blocked ? 'cursor-not-allowed opacity-50' : 'hover:bg-gold-50/60',
                        selected && 'bg-gold-50',
                      )}
                    >
                      <span
                        className={clsx(
                          'flex size-4 shrink-0 items-center justify-center rounded-full border',
                          selected ? 'border-gold-600 bg-gold-500 text-ink-900' : 'border-ink-300',
                        )}
                      >
                        {selected && <Check className="size-3" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink-800">
                          {plot.plot_number}
                          {plot.block_sector && <span className="font-normal text-ink-400"> · {plot.block_sector}</span>}
                        </p>
                        <p className="truncate text-xs text-ink-400">{blocked ?? `${plot.size} · ${formatCurrency(plot.price)}`}</p>
                      </div>
                      <Badge>{plot.status}</Badge>
                    </button>
                  </li>
                )
              })}
              {rows.length === 0 && (
                <li className="px-3 py-6 text-center text-xs text-ink-400">{isFetching ? 'Loading plots…' : 'No plots match.'}</li>
              )}
            </ul>
            {(plots?.count ?? 0) > rows.length && (
              <p className="border-t border-ink-100 bg-ink-50/60 px-3 py-1.5 text-[11px] text-ink-400">
                Showing {rows.length} of {plots?.count} — search to narrow down
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
