'use client'

import { useState } from 'react'
import clsx from 'clsx'
import { ShieldCheck, Smartphone } from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Field'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import type { CustomerDetail, CustomerKYCStatus } from '@/types'
import { useSetCustomerKycStatus, useUpdateCustomer } from './api'

const KYC_OPTIONS: { value: CustomerKYCStatus; label: string; dot: string }[] = [
  { value: 'NOT_STARTED', label: 'Not started', dot: 'bg-ink-300' },
  { value: 'SUBMITTED', label: 'Submitted', dot: 'bg-sky-500' },
  { value: 'APPROVED', label: 'Approved', dot: 'bg-emerald-500' },
  { value: 'REJECTED', label: 'Rejected', dot: 'bg-red-500' },
]

/** Super-admin only: switch app access on/off and override the overall KYC status. */
export function AccountControls({ customer }: { customer: CustomerDetail }) {
  const toast = useToast()
  const update = useUpdateCustomer(customer.id)
  const setKyc = useSetCustomerKycStatus(customer.id)
  const [confirmAccess, setConfirmAccess] = useState(false)
  const [kyc, setKycChoice] = useState<CustomerKYCStatus>(customer.kyc_status)
  const [reason, setReason] = useState('')

  // Sign-in needs both: an active account AND an assigned plot (accounts.services.get_login_eligible_customer).
  const canSignIn = customer.is_active && !!customer.plot
  const access = !customer.is_active
    ? { label: 'Revoked', tone: 'text-red-700', dot: 'bg-red-500', note: "Can't sign in to the app." }
    : customer.plot
      ? { label: 'Active', tone: 'text-emerald-700', dot: 'bg-emerald-500', note: 'Can sign in to the app.' }
      : { label: 'Active — no plot', tone: 'text-amber-700', dot: 'bg-amber-500', note: "Can't sign in until a plot is assigned." }

  const toggleAccess = async () => {
    try {
      await update.mutateAsync({ is_active: !customer.is_active })
      toast.success(customer.is_active ? 'App access revoked' : 'App access restored')
      setConfirmAccess(false)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const saveKyc = async () => {
    try {
      await setKyc.mutateAsync({ kyc_status: kyc, reason: reason.trim() })
      toast.success(`KYC status set to ${KYC_OPTIONS.find((o) => o.value === kyc)?.label}`)
      setReason('')
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <Card>
      <CardHeader title="Account controls" subtitle="Super admin only" />
      <CardBody className="space-y-5">
        {/* App access */}
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
            <Smartphone className="size-3.5" /> App access
          </p>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={clsx('flex items-center gap-1.5 text-sm font-semibold', access.tone)}>
                <span className={clsx('size-2 rounded-full', access.dot)} />
                {access.label}
              </p>
              <p className="text-xs text-ink-400">{access.note}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className={customer.is_active ? 'border-red-200 text-red-600 hover:bg-red-50' : undefined}
              onClick={() => setConfirmAccess(true)}
            >
              {customer.is_active ? 'Revoke' : 'Restore'}
            </Button>
          </div>
        </div>

        {/* KYC override */}
        <div className="space-y-2 border-t border-ink-100 pt-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
            <ShieldCheck className="size-3.5" /> KYC status
          </p>
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-ink-200 bg-ink-50/50 p-1">
            {KYC_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setKycChoice(o.value)}
                className={clsx(
                  'flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                  kyc === o.value ? 'bg-white text-ink-800 shadow-sm ring-1 ring-ink-100' : 'text-ink-500 hover:text-ink-700',
                )}
              >
                <span className={clsx('size-1.5 rounded-full', o.dot)} />
                {o.label}
                {o.value === customer.kyc_status && <span className="text-[10px] text-ink-400">(now)</span>}
              </button>
            ))}
          </div>
          {kyc !== customer.kyc_status && (
            <>
              <Textarea
                rows={2}
                className="min-h-16"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (kept in the audit log), e.g. verified documents in person"
              />
              <div className="flex items-center justify-between gap-2">
                <Button size="sm" variant="ghost" onClick={() => setKycChoice(customer.kyc_status)}>
                  Cancel
                </Button>
                <Button size="sm" variant="secondary" loading={setKyc.isPending} disabled={!reason.trim()} onClick={saveKyc}>
                  Set to {KYC_OPTIONS.find((o) => o.value === kyc)?.label}
                </Button>
              </div>
            </>
          )}
          <p className="text-xs text-ink-400">
            Overrides the status from KYC review. It&apos;s recalculated if the customer submits KYC again or a reviewer approves or rejects a step.
            The customer isn&apos;t notified.
          </p>
        </div>
      </CardBody>

      <ConfirmDialog
        open={confirmAccess}
        title={customer.is_active ? 'Revoke app access?' : 'Restore app access?'}
        message={
          customer.is_active
            ? `${customer.name || customer.email} will be signed out and can't sign in to the app until access is restored. Their plot and history stay as they are.`
            : canSignIn || customer.plot
              ? `${customer.name || customer.email} will be able to sign in to the app again.`
              : `${customer.name || customer.email} will be active, but still can't sign in until a plot is assigned.`
        }
        confirmLabel={customer.is_active ? 'Revoke access' : 'Restore access'}
        danger={customer.is_active}
        loading={update.isPending}
        onClose={() => setConfirmAccess(false)}
        onConfirm={toggleAccess}
      />
    </Card>
  )
}
