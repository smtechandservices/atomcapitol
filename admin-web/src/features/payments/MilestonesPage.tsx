'use client'

import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Input, Select, FieldWrap, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/format'
import { usePlots } from '@/features/plots/api'
import type { Milestone } from '@/types'
import { useCreateMilestone, useDeleteMilestone, useMilestones, useUpdateMilestone } from './api'

const emptyForm = { sequence: 1, name: '', description: '', amount: '', due_date: '', admin_remarks: '' }

export function MilestonesPage() {
  const [plotSearch, setPlotSearch] = useState('')
  const [selectedPlotId, setSelectedPlotId] = useState<number | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Milestone | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Milestone | null>(null)
  const [form, setForm] = useState(emptyForm)

  const toast = useToast()
  const { data: plots } = usePlots({ search: plotSearch || undefined, page: 1 })
  const milestones = useMilestones({ plot: selectedPlotId ?? undefined })
  const createMilestone = useCreateMilestone()
  const updateMilestone = useUpdateMilestone()
  const deleteMilestone = useDeleteMilestone()

  const selectedPlot = plots?.results.find((p) => p.id === selectedPlotId)

  const columns: Column<Milestone>[] = [
    { key: 'sequence', header: '#', render: (m) => m.sequence },
    { key: 'name', header: 'Name', render: (m) => <span className="font-medium text-ink-800">{m.name}</span> },
    { key: 'amount', header: 'Amount', render: (m) => formatCurrency(m.amount) },
    { key: 'due', header: 'Due date', render: (m) => formatDate(m.due_date) },
    { key: 'status', header: 'Status', render: (m) => <Badge>{m.status}</Badge> },
    {
      key: 'actions',
      header: '',
      render: (m) => (
        <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditing(m)
              setForm({
                sequence: m.sequence,
                name: m.name,
                description: m.description ?? '',
                amount: m.amount,
                due_date: m.due_date,
                admin_remarks: m.admin_remarks ?? '',
              })
              setModalOpen(true)
            }}
          >
            Edit
          </Button>
          <Button size="sm" variant="danger" onClick={() => setDeleteTarget(m)}>
            Delete
          </Button>
        </div>
      ),
    },
  ]

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm, sequence: (milestones.data?.results.length ?? 0) + 1 })
    setModalOpen(true)
  }

  const submit = async () => {
    if (!selectedPlotId) return
    try {
      if (editing) {
        await updateMilestone.mutateAsync({ id: editing.id, values: form })
        toast.success('Milestone updated')
      } else {
        await createMilestone.mutateAsync({ plot: selectedPlotId, ...form })
        toast.success('Milestone added')
      }
      setModalOpen(false)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <div>
      <PageHeader title="Milestones" subtitle="Find a plot to view and edit its per-customer milestone schedule" />

      <Card className="mb-5">
        <div className="flex items-center gap-3 p-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
            <Input
              className="pl-9"
              placeholder="Search plot by number..."
              value={plotSearch}
              onChange={(e) => setPlotSearch(e.target.value)}
            />
          </div>
          <Select className="w-72" value={selectedPlotId ?? ''} onChange={(e) => setSelectedPlotId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Select a plot</option>
            {plots?.results.map((p) => (
              <option key={p.id} value={p.id}>
                {p.project_name} — {p.plot_number}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {selectedPlot && (
        <Card>
          <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-ink-800">
                {selectedPlot.project_name} — {selectedPlot.plot_number}
              </h3>
              <p className="text-xs text-ink-400">
                Total {formatCurrency(selectedPlot.total_value)} &middot; Remaining {formatCurrency(selectedPlot.remaining_balance)}
              </p>
            </div>
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" /> Add milestone
            </Button>
          </div>
          <DataTable
            columns={columns}
            rows={milestones.data?.results ?? []}
            rowKey={(r) => r.id}
            isLoading={milestones.isLoading}
            error={milestones.error ? apiErrorMessage(milestones.error) : null}
            emptyTitle="No milestones yet"
            emptySubtitle="Generate a schedule from the plot's detail drawer in Plot Inventory, or add one manually."
          />
        </Card>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit milestone' : 'Add milestone'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="secondary" loading={createMilestone.isPending || updateMilestone.isPending} onClick={submit}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FieldWrap label="Sequence" required>
              <Input type="number" value={form.sequence} onChange={(e) => setForm({ ...form, sequence: Number(e.target.value) })} />
            </FieldWrap>
            <FieldWrap label="Due date" required>
              <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </FieldWrap>
          </div>
          <FieldWrap label="Name" required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FieldWrap>
          <FieldWrap label="Amount" required>
            <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </FieldWrap>
          <FieldWrap label="Description">
            <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </FieldWrap>
          <FieldWrap label="Admin remarks">
            <Textarea rows={2} value={form.admin_remarks} onChange={(e) => setForm({ ...form, admin_remarks: e.target.value })} />
          </FieldWrap>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete milestone"
        message={`Remove "${deleteTarget?.name}" from this plot's schedule?`}
        confirmLabel="Delete"
        danger
        loading={deleteMilestone.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return
          try {
            await deleteMilestone.mutateAsync(deleteTarget.id)
            toast.success('Milestone deleted')
            setDeleteTarget(null)
          } catch (err) {
            toast.error(apiErrorMessage(err))
          }
        }}
      />
    </div>
  )
}
