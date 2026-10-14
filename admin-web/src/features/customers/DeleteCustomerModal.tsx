'use client'

import { useRouter } from 'next/navigation'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import type { CustomerDetail } from '@/types'
import { useCustomerDeleteCheck, useDeleteCustomer } from './api'

/**
 * Super-admin delete for wrongly created customers. The backend refuses anyone with a plot or any history
 * (payments, KYC, tickets, documents, change requests) — those should be unassigned or deactivated instead.
 */
export function DeleteCustomerModal({ customer, onClose }: { customer: CustomerDetail; onClose: () => void }) {
  const toast = useToast()
  const router = useRouter()
  const { data: check, isLoading } = useCustomerDeleteCheck(customer.id, true)
  const remove = useDeleteCustomer()
  const label = customer.name || customer.email

  const submit = async () => {
    try {
      await remove.mutateAsync(customer.id)
      toast.success(`${label} deleted`)
      onClose()
      router.push('/customers')
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={`Delete ${label}?`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {check?.can_delete && (
            <Button variant="danger" loading={remove.isPending} onClick={submit}>
              <Trash2 className="size-4" /> Delete customer
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
          <b>{customer.email}</b> has no plot and no history, so the record can be removed. The email can then be added again from scratch. This
          can&apos;t be undone.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">This customer can&apos;t be deleted:</p>
              <ul className="mt-1 list-inside list-disc text-amber-800">
                {check.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-xs text-ink-500">
            To remove their access, unassign them from their plot (or transfer it), or edit the profile and mark them inactive. Their history stays on
            record.
          </p>
        </div>
      )}
    </Modal>
  )
}
