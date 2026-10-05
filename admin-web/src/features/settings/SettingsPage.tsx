'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Textarea, FieldWrap } from '@/components/ui/Field'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import type { CompanySettings } from '@/types'
import { useCompanySettings, useUpdateCompanySettings } from './api'

export function SettingsPage() {
  const { data, isLoading, error } = useCompanySettings()

  if (isLoading) return <FullPageSpinner />
  if (error || !data) return <ErrorState message={apiErrorMessage(error)} />

  // Keyed by updated_at so a fresh save from elsewhere resets the local draft
  // via remount, instead of syncing server data into state through an effect.
  return <SettingsForm key={data.updated_at ?? 'initial'} initial={data} />
}

function SettingsForm({ initial }: { initial: CompanySettings }) {
  const [form, setForm] = useState<CompanySettings>(initial)
  const update = useUpdateCompanySettings()
  const toast = useToast()

  const save = async () => {
    try {
      await update.mutateAsync(form)
      toast.success('Settings saved')
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Company details and bank/UPI info shown to customers for payments" />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Company" />
          <CardBody className="space-y-4">
            <FieldWrap label="Company name">
              <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
            </FieldWrap>
            <FieldWrap label="Support phone">
              <Input value={form.support_phone} onChange={(e) => setForm({ ...form, support_phone: e.target.value })} />
            </FieldWrap>
            <FieldWrap label="Support email">
              <Input value={form.support_email} onChange={(e) => setForm({ ...form, support_email: e.target.value })} />
            </FieldWrap>
            <FieldWrap label="Receipt template note" hint="Free-text footer printed on auto-generated receipts">
              <Textarea rows={3} value={form.receipt_template_note} onChange={(e) => setForm({ ...form, receipt_template_note: e.target.value })} />
            </FieldWrap>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Bank / UPI details" subtitle="Shown to customers for milestone payments" />
          <CardBody className="space-y-4">
            <FieldWrap label="Bank name">
              <Input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
            </FieldWrap>
            <FieldWrap label="Account name">
              <Input value={form.bank_account_name} onChange={(e) => setForm({ ...form, bank_account_name: e.target.value })} />
            </FieldWrap>
            <FieldWrap label="Account number">
              <Input value={form.bank_account_number} onChange={(e) => setForm({ ...form, bank_account_number: e.target.value })} />
            </FieldWrap>
            <FieldWrap label="IFSC">
              <Input value={form.bank_ifsc} onChange={(e) => setForm({ ...form, bank_ifsc: e.target.value })} />
            </FieldWrap>
            <FieldWrap label="UPI ID">
              <Input value={form.upi_id} onChange={(e) => setForm({ ...form, upi_id: e.target.value })} />
            </FieldWrap>
          </CardBody>
        </Card>
      </div>

      <div className="mt-5 flex justify-end">
        <Button variant="secondary" loading={update.isPending} onClick={save}>
          Save settings
        </Button>
      </div>
    </div>
  )
}
