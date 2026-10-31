'use client'

import Link from 'next/link'
import { FileText, Video } from 'lucide-react'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { FileActions } from '@/components/ui/FileActions'
import { FilePlaceholder, FilePreview } from '@/components/ui/FilePreview'
import { absoluteMediaUrl, formatDate } from '@/lib/format'
import type { CustomerKycDocuments, KYCStepStatus, KycDocumentField } from '@/types'

const BUYER: [KycDocumentField, string][] = [
  ['photo', 'Photo'],
  ['aadhaar_front', 'Aadhaar (front)'],
  ['aadhaar_back', 'Aadhaar (back)'],
  ['pan_card', 'PAN card'],
  ['cancelled_cheque', 'Cancelled cheque'],
  ['receipt_file', 'Booking receipt'],
]

const CO_APPLICANT: [KycDocumentField, string][] = [
  ['co_applicant_photo', 'Photo'],
  ['co_applicant_aadhaar_front', 'Aadhaar (front)'],
  ['co_applicant_aadhaar_back', 'Aadhaar (back)'],
  ['co_applicant_pan_card', 'PAN card'],
]

/** Every file the customer sent for KYC, so it can be checked from their page without opening the review queue.
 * Only render it for roles that can('kyc'): the backend sends kyc_documents to those alone. */
export function KycDocumentsCard({ kyc }: { kyc: CustomerKycDocuments | null }) {
  const files = kyc?.files
  const uploaded = files ? Object.values(files).filter(Boolean).length : 0
  const hasCoApplicant = !!kyc && (!!kyc.co_applicant_name || CO_APPLICANT.some(([f]) => kyc.files[f]))
  const reviewable = !!kyc && !!(kyc.step2_status || kyc.step3_status)

  return (
    <Card>
      <CardHeader
        title="KYC documents"
        subtitle={kyc ? `${uploaded} file${uploaded === 1 ? '' : 's'} uploaded` : undefined}
        actions={
          reviewable ? (
            <Link href={`/kyc/${kyc.submission_id}`} className="text-xs font-medium text-ink-500 hover:text-ink-800">
              Open KYC review
            </Link>
          ) : undefined
        }
      />
      {!kyc || uploaded === 0 ? (
        <CardBody className="p-0">
          <EmptyState title="No KYC documents yet" subtitle="Files appear here as soon as the customer sends KYC Step 1 from the app." />
        </CardBody>
      ) : (
        <CardBody className="space-y-6">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
            <StepState label="Step 1 · Details & documents" sentAt={kyc.step1_submitted_at} />
            <StepState label="Step 2 · Plot & receipt" sentAt={kyc.step2_submitted_at} status={kyc.step2_status} />
            <StepState label="Step 3 · Video (optional)" sentAt={kyc.step3_submitted_at} status={kyc.step3_status} />
          </div>

          <Section title="Buyer" docs={BUYER} files={kyc.files} />

          {hasCoApplicant && <Section title={`Co-applicant${kyc.co_applicant_name ? ` · ${kyc.co_applicant_name}` : ''}`} docs={CO_APPLICANT} files={kyc.files} />}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Video KYC</h4>
              {kyc.files.video_file && <FileActions path={kyc.files.video_file} label="KYC video" />}
            </div>
            {kyc.files.video_file ? (
              <video src={absoluteMediaUrl(kyc.files.video_file) ?? undefined} controls preload="metadata" className="max-h-72 w-full rounded-lg border border-ink-100 bg-ink-900" />
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-ink-400">
                <Video className="size-3.5" /> No video sent — video KYC is optional
              </p>
            )}
          </div>
        </CardBody>
      )}
    </Card>
  )
}

function Section({ title, docs, files }: { title: string; docs: [KycDocumentField, string][]; files: CustomerKycDocuments['files'] }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400">{title}</h4>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {docs.map(([field, label]) => {
          const path = files[field]
          return (
            <div key={field} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-ink-500">{label}</span>
                {path && <FileActions path={path} label={label} />}
              </div>
              {path ? (
                <FilePreview title={label} url={absoluteMediaUrl(path)} height={180} />
              ) : (
                <FilePlaceholder icon={<FileText className="size-5" />} text="Not uploaded" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StepState({ label, sentAt, status }: { label: string; sentAt: string | null; status?: KYCStepStatus | null }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-ink-500">{label}</span>
      {status ? <Badge>{status}</Badge> : <span className="text-ink-400">{sentAt ? `sent ${formatDate(sentAt)}` : 'not sent'}</span>}
    </div>
  )
}
