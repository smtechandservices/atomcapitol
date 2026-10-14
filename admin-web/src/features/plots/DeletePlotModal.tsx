'use client'

import { AlertTriangle, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import type { Plot } from '@/types'
import { useDeletePlot, usePlotDeleteCheck } from './api'

/** Super-admin plot deletion — refused by the backend while the plot has buyers or payment history. */
export function DeletePlotModal({ plot, onClose, onDeleted }: { plot: Plot; onClose: () => void; onDeleted: () => void }) {
  const toast = useToast()
  const { data: check, isLoading } = usePlotDeleteCheck(plot.id, true)
  const remove = useDeletePlot()

  const submit = async () => {
    try {
      await remove.mutateAsync(plot.id)
      toast.success(`Plot ${plot.plot_number} deleted`)
      onClose()
      onDeleted()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={`Delete plot ${plot.plot_number}?`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {check?.can_delete && (
            <Button variant="danger" loading={remove.isPending} onClick={submit}>
              <Trash2 className="size-4" /> Delete plot
            </Button>
          )}
        </>
      }
    >
      {isLoading || !check ? (
        <div className="flex justify-center py-6">
          <Spinner className="size-6" />
        </div>
      ) : check.can_delete ? (
        <p className="text-sm text-ink-600">
          Plot <b>{plot.plot_number}</b> in {plot.project_name} will be removed, along with any unpaid milestones. This can&apos;t be undone.
        </p>
      ) : (
        <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium">This plot can&apos;t be deleted:</p>
            <ul className="mt-1 list-inside list-disc text-amber-800">
              {check.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  )
}
