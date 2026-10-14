'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import type { Project } from '@/types'
import { useDeleteProject, useProjectDeleteCheck } from './api'

/**
 * Super-admin project deletion. The backend refuses while any plot has buyers or payment history;
 * otherwise the project, its plots, unpaid milestones, documents and images go — so the name must be typed.
 */
export function DeleteProjectModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const toast = useToast()
  const router = useRouter()
  const { data: check, isLoading } = useProjectDeleteCheck(project.id, true)
  const remove = useDeleteProject()
  const [typed, setTyped] = useState('')
  const confirmed = typed.trim() === project.name

  const submit = async () => {
    try {
      await remove.mutateAsync(project.id)
      toast.success(`${project.name} deleted`)
      onClose()
      router.push('/projects')
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Delete ${project.name}?`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {check?.can_delete && (
            <Button variant="danger" loading={remove.isPending} disabled={!confirmed} onClick={submit}>
              <Trash2 className="size-4" /> Delete project
            </Button>
          )}
        </>
      }
    >
      {isLoading || !check ? (
        <div className="flex justify-center py-8">
          <Spinner className="size-6" />
        </div>
      ) : !check.can_delete ? (
        <div className="space-y-3">
          <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <p>
              This project can&apos;t be deleted: <b>{check.blocked_count}</b> plot{check.blocked_count === 1 ? '' : 's'} still{' '}
              {check.blocked_count === 1 ? 'has' : 'have'} buyers or payment history. Deleting would remove customers&apos; plots, payments and receipts.
            </p>
          </div>
          <ul className="max-h-60 divide-y divide-ink-100 overflow-y-auto rounded-lg border border-ink-100 text-sm">
            {check.blocked_plots.map((b) => (
              <li key={b.plot_id} className="px-3 py-2">
                <p className="font-medium text-ink-800">Plot {b.plot_number}</p>
                <p className="text-xs text-ink-500">{b.reasons.join(' · ')}</p>
              </li>
            ))}
          </ul>
          {check.blocked_count > check.blocked_plots.length && (
            <p className="text-xs text-ink-400">…and {check.blocked_count - check.blocked_plots.length} more.</p>
          )}
          <p className="text-xs text-ink-400">To take it off the app instead, unpublish the project.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink-600">This permanently removes the project and everything in it. It can&apos;t be undone.</p>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {(
              [
                ['Plots', check.will_delete.plots],
                ['Unpaid milestones', check.will_delete.milestones],
                ['Documents', check.will_delete.documents],
                ['Images', check.will_delete.images],
              ] as const
            ).map(([label, n]) => (
              <li key={label} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2">
                <span className="text-ink-500">{label}</span>
                <span className="font-semibold tabular-nums text-ink-900">{n}</span>
              </li>
            ))}
          </ul>
          <div>
            <p className="mb-1.5 text-xs text-ink-600">
              Type <span className="font-semibold text-ink-900">{project.name}</span> to confirm
            </p>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          </div>
        </div>
      )}
    </Modal>
  )
}
