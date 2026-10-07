'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import clsx from 'clsx'
import {
  ArrowUpRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Images,
  LandPlot,
  LayoutGrid,
  List,
  MapPin,
  Plus,
  Search,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, StatCard } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { useAllProjects, useCreateProject, useProjects } from './api'
import {
  CoverPlaceholder,
  DEV_STATUSES,
  DevStatusPill,
  PublishPill,
  ProjectFormModal,
  coverImageUrl,
  emptyProjectForm,
  formToPayload,
} from './shared'
import type { Project } from '@/types'
import type { ProjectFormValues } from './api'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'

const PAGE_SIZE = 20

export function ProjectsPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [published, setPublished] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [createOpen, setCreateOpen] = useState(false)

  const router = useRouter()
  const toast = useToast()
  const { data, isLoading, error } = useProjects({
    page,
    search: search || undefined,
    development_status: status || undefined,
    is_published: published || undefined,
  })
  const { data: allProjects } = useAllProjects()
  const createProject = useCreateProject()

  const totals = {
    projects: allProjects?.length,
    live: allProjects?.filter((p) => p.is_published).length,
    plots: allProjects?.reduce((sum, p) => sum + p.plot_count, 0),
    building: allProjects?.filter((p) => p.development_status === 'UNDER_CONSTRUCTION').length,
  }
  const statusCount = (value: string) => (value ? allProjects?.filter((p) => p.development_status === value).length : allProjects?.length)

  const hasFilters = !!(search || status || published)
  const rows = data?.results ?? []
  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1

  const resetTo = (fn: () => void) => {
    setPage(1)
    fn()
  }

  const submit = async (values: ProjectFormValues) => {
    try {
      const created = await createProject.mutateAsync(formToPayload(values))
      toast.success('Project created')
      setCreateOpen(false)
      router.push(`/projects/${created.id}`)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to create project'))
    }
  }

  const columns: Column<Project>[] = [
    {
      key: 'name',
      header: 'Project',
      render: (p) => {
        const cover = coverImageUrl(p)
        return (
          <div className="flex items-center gap-3">
            <div className="size-10 shrink-0 overflow-hidden rounded-lg">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element -- dynamic Django media host, not a next/image candidate
                <img src={cover} alt="" className="size-full object-cover" />
              ) : (
                <CoverPlaceholder name={p.name} className="size-full [&_span]:text-sm" />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium text-ink-800">{p.name}</p>
              <p className="truncate text-xs text-ink-400">{p.location || 'No location set'}</p>
            </div>
          </div>
        )
      },
    },
    { key: 'status', header: 'Development', render: (p) => <DevStatusPill status={p.development_status} className="shadow-none" /> },
    { key: 'plots', header: 'Plots', render: (p) => <span className="font-medium tabular-nums">{p.plot_count}</span> },
    { key: 'media', header: 'Media', render: (p) => <MediaIndicators project={p} /> },
    { key: 'published', header: 'Visibility', render: (p) => <PublishPill published={p.is_published} className="shadow-none" /> },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Projects"
        subtitle="Townships and projects shown to customers in the app"
        actions={
          <Button variant="secondary" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> New project
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total projects" value={totals.projects ?? '—'} icon={<Building2 className="size-5" />} accent="ink" className="py-6" />
        <StatCard label="Live in app" value={totals.live ?? '—'} icon={<Eye className="size-5" />} accent="success" className="py-6" />
        <StatCard label="Total plots" value={totals.plots ?? '—'} icon={<LandPlot className="size-5" />} accent="gold" className="py-6" />
        <StatCard label="Under construction" value={totals.building ?? '—'} icon={<Building2 className="size-5" />} accent="ink" className="py-6" />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4">
          <div className="flex items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
              <Input
                className="pl-9"
                placeholder="Search by name or location"
                value={search}
                onChange={(e) => resetTo(() => setSearch(e.target.value))}
              />
            </div>
            {/* Select is w-full by default, so the wrapper sets its width */}
            <div className="w-40 shrink-0">
              <Select value={published} onChange={(e) => resetTo(() => setPublished(e.target.value))}>
                <option value="">All visibility</option>
                <option value="true">Live</option>
                <option value="false">Draft</option>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 pb-0.5">
              {[{ value: '', label: 'All', dot: 'bg-ink-300' }, ...DEV_STATUSES].map((s) => {
                const active = status === s.value
                const count = statusCount(s.value)
                return (
                  <button
                    key={s.value || 'all'}
                    onClick={() => resetTo(() => setStatus(s.value))}
                    className={clsx(
                      'flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      active ? 'border-ink-800 bg-ink-800 text-white' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:bg-ink-50',
                    )}
                  >
                    {s.value && <span className={clsx('size-1.5 rounded-full', s.dot)} />}
                    {s.label}
                    {count !== undefined && (
                      <span className={clsx('rounded-full px-1.5 text-[10px] tabular-nums', active ? 'bg-white/15 text-gold-200' : 'bg-ink-100 text-ink-500')}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="flex shrink-0 rounded-lg border border-ink-200 bg-white p-0.5">
              {(
                [
                  { key: 'grid', icon: LayoutGrid, label: 'Grid view' },
                  { key: 'list', icon: List, label: 'List view' },
                ] as const
              ).map(({ key, icon: Icon, label }) => (
                <button
                  key={key}
                  onClick={() => setView(key)}
                  aria-label={label}
                  title={label}
                  className={clsx(
                    'flex size-8 items-center justify-center rounded-md transition-colors',
                    view === key ? 'bg-ink-800 text-gold-300' : 'text-ink-400 hover:bg-ink-50 hover:text-ink-700',
                  )}
                >
                  <Icon className="size-4" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {view === 'list' ? (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            isLoading={isLoading}
            error={error ? apiErrorMessage(error) : null}
            onRowClick={(row) => router.push(`/projects/${row.id}`)}
            page={page}
            onPageChange={setPage}
            count={data?.count}
            emptyTitle={hasFilters ? 'No matching projects' : 'No projects yet'}
            emptySubtitle={hasFilters ? 'Try a different search or filter.' : 'Create your first project/township to start adding plots.'}
          />
        ) : (
          <div className="p-4">
            {isLoading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="overflow-hidden rounded-xl border border-ink-100">
                    <div className="aspect-[16/10] animate-pulse bg-ink-100" />
                    <div className="space-y-2 p-4">
                      <div className="h-4 w-2/3 animate-pulse rounded bg-ink-100" />
                      <div className="h-3 w-1/2 animate-pulse rounded bg-ink-50" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <ErrorState message={apiErrorMessage(error)} />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<Building2 className="size-6" />}
                title={hasFilters ? 'No matching projects' : 'No projects yet'}
                subtitle={hasFilters ? 'Try a different search or filter.' : 'Create your first project/township to start adding plots.'}
                action={
                  !hasFilters && (
                    <Button variant="secondary" size="sm" className="mt-2" onClick={() => setCreateOpen(true)}>
                      <Plus className="size-4" /> New project
                    </Button>
                  )
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {rows.map((p) => (
                  <ProjectCard key={p.id} project={p} />
                ))}
                {!hasFilters && page === totalPages && (
                  <button
                    onClick={() => setCreateOpen(true)}
                    className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-200 text-ink-400 transition-colors hover:border-gold-400 hover:bg-gold-50/50 hover:text-gold-700"
                  >
                    <span className="flex size-10 items-center justify-center rounded-full bg-ink-50">
                      <Plus className="size-5" />
                    </span>
                    <span className="text-sm font-medium">Add project</span>
                  </button>
                )}
              </div>
            )}

            {!isLoading && !error && totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-4">
                <p className="text-xs text-ink-400">
                  Page {page} of {totalPages} &middot; {data?.count} total
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page <= 1}
                    className="flex size-8 items-center justify-center rounded-lg border border-ink-100 text-ink-500 hover:bg-ink-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page >= totalPages}
                    className="flex size-8 items-center justify-center rounded-lg border border-ink-100 text-ink-500 hover:bg-ink-50 disabled:opacity-40"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      <ProjectFormModal
        open={createOpen}
        title="New project"
        submitLabel="Create project"
        initial={emptyProjectForm}
        loading={createProject.isPending}
        onClose={() => setCreateOpen(false)}
        onSubmit={submit}
      />
    </div>
  )
}

function MediaIndicators({ project }: { project: Project }) {
  return (
    <div className="flex items-center gap-3 text-xs text-ink-400">
      <span className={clsx('flex items-center gap-1', project.images.length > 0 && 'text-ink-600')} title="Images">
        <Images className="size-3.5" /> {project.images.length}
      </span>
      <span className={clsx('flex items-center gap-1', project.brochure ? 'text-ink-600' : 'text-ink-300')} title={project.brochure ? 'Brochure uploaded' : 'No brochure'}>
        <FileText className="size-3.5" /> {project.brochure ? 'Brochure' : '—'}
      </span>
    </div>
  )
}

function ProjectCard({ project }: { project: Project }) {
  const cover = coverImageUrl(project)
  return (
    <Link
      href={`/projects/${project.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-ink-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-gold-300 hover:shadow-md"
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- dynamic Django media host, not a next/image candidate
          <img src={cover} alt={project.name} className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <CoverPlaceholder name={project.name} className="size-full" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-ink-900/50 to-transparent" />
        <PublishPill published={project.is_published} className="absolute left-3 top-3" />
        <DevStatusPill status={project.development_status} className="absolute bottom-3 left-3" />
        <span className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full bg-white/90 text-ink-700 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
          <ArrowUpRight className="size-4" />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-ink-800 group-hover:text-ink-900">{project.name}</h3>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-400">
            <MapPin className="size-3.5 shrink-0" />
            {project.location || 'No location set'}
          </p>
        </div>
        {project.amenities.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {project.amenities.slice(0, 3).map((a) => (
              <span key={a} className="rounded-full bg-ink-50 px-2 py-0.5 text-[11px] text-ink-500">
                {a}
              </span>
            ))}
            {project.amenities.length > 3 && (
              <span className="rounded-full bg-ink-50 px-2 py-0.5 text-[11px] text-ink-400">+{project.amenities.length - 3}</span>
            )}
          </div>
        )}
        <div className="mt-auto flex items-center justify-between border-t border-ink-100 pt-3">
          <span className="flex items-center gap-1.5 text-sm">
            <LandPlot className="size-4 text-gold-600" />
            <span className="font-semibold tabular-nums text-ink-800">{project.plot_count}</span>
            <span className="text-xs text-ink-400">plots</span>
          </span>
          <MediaIndicators project={project} />
        </div>
      </div>
    </Link>
  )
}
