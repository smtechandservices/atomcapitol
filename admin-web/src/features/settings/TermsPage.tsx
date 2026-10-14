'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Textarea, FieldWrap } from '@/components/ui/Field'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { downloadFromApi } from '@/lib/download'
import { useCompanySettings, useUpdateReceiptTerms } from './api'

export function TermsPage() {
  const { data, isLoading, error } = useCompanySettings()

  if (isLoading) return <FullPageSpinner />
  if (error || !data) return <ErrorState message={apiErrorMessage(error)} />

  // Keyed by updated_at so a save resets the draft via remount (same pattern as SettingsPage)
  return <TermsForm key={data.updated_at ?? 'initial'} initial={data.receipt_terms} />
}

function TermsForm({ initial }: { initial: string }) {
  const [terms, setTerms] = useState(initial)
  const [downloading, setDownloading] = useState(false)
  const update = useUpdateReceiptTerms()
  const toast = useToast()
  const dirty = terms !== initial
  const points = terms.split('\n').filter((line) => line.trim())

  const save = async () => {
    try {
      await update.mutateAsync(terms)
      toast.success('Terms & conditions saved')
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  const download = async () => {
    setDownloading(true)
    try {
      await downloadFromApi('/admin/settings/receipt-terms.pdf', 'terms-and-conditions.pdf')
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Terms & Conditions"
        subtitle="Printed as the last page of every payment receipt"
        actions={
          <>
            <Button
              variant="outline"
              loading={downloading}
              onClick={download}
              disabled={dirty}
              title={dirty ? 'Save your changes first' : undefined}
            >
              <Download className="size-4" /> Download PDF
            </Button>
            <Button variant="secondary" loading={update.isPending} onClick={save} disabled={!dirty}>
              Save changes
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Edit" />
          <CardBody>
            <FieldWrap label="Terms" hint="One point per line. Blank lines are ignored.">
              <Textarea rows={22} value={terms} onChange={(e) => setTerms(e.target.value)} />
            </FieldWrap>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Preview" subtitle={`${points.length} point${points.length === 1 ? '' : 's'}`} />
          <CardBody>
            {points.length ? (
              <div className="space-y-2 text-sm leading-relaxed text-ink-700">
                <p className="font-semibold text-ink-800">Terms and Conditions</p>
                {points.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-400">No terms. Receipts will be printed without a T&amp;C page.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
