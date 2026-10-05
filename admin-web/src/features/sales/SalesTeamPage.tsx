'use client'

import { useState } from 'react'
import { Plus, Users } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, FieldWrap } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { absoluteMediaUrl } from '@/lib/format'
import type { SalesPerson } from '@/types'
import { useAssignCustomersToSalesPerson, useCreateSalesPerson, useSalesTeam, useUpdateSalesPerson } from './api'

export function SalesTeamPage() {
  const { data, isLoading, error } = useSalesTeam()
  const [createOpen, setCreateOpen] = useState(false)
  const [assignTarget, setAssignTarget] = useState<SalesPerson | null>(null)

  return (
    <div>
      <PageHeader
        title="Sales Team"
        subtitle="Display-only contacts shown in the customer app"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Add sales person
          </Button>
        }
      />

      {isLoading && <FullPageSpinner />}
      {!isLoading && error && <ErrorState message={apiErrorMessage(error)} />}
      {!isLoading && !error && (data?.results.length ?? 0) === 0 && (
        <Card>
          <EmptyState title="No sales people yet" />
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.results.map((sp) => (
          <SalesPersonCard key={sp.id} person={sp} onAssign={() => setAssignTarget(sp)} />
        ))}
      </div>

      {createOpen && <CreateSalesPersonModal onClose={() => setCreateOpen(false)} />}
      {assignTarget && <AssignCustomersModal person={assignTarget} onClose={() => setAssignTarget(null)} />}
    </div>
  )
}

function SalesPersonCard({ person, onAssign }: { person: SalesPerson; onAssign: () => void }) {
  const toast = useToast()
  const update = useUpdateSalesPerson(person.id)

  return (
    <Card>
      <CardBody className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={absoluteMediaUrl(person.photo) ?? undefined}
          alt={person.name}
          className="size-14 shrink-0 rounded-full bg-ink-100 object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink-800">{person.name}</p>
          <p className="truncate text-xs text-ink-400">{person.email}</p>
          <p className="text-xs text-ink-400">{person.phone}</p>
          <div className="mt-2 flex items-center justify-between">
            <Badge tone={person.is_active ? 'success' : 'neutral'}>{person.is_active ? 'Active' : 'Inactive'}</Badge>
            <span className="flex items-center gap-1 text-xs text-ink-400">
              <Users className="size-3.5" /> {person.customer_count}
            </span>
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" onClick={onAssign}>
              Assign customers
            </Button>
            <button
              className="text-xs text-gold-700 underline"
              onClick={async () => {
                try {
                  await update.mutateAsync({ is_active: !person.is_active })
                } catch (err) {
                  toast.error(apiErrorMessage(err))
                }
              }}
            >
              {person.is_active ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}

function CreateSalesPersonModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const create = useCreateSalesPerson()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)

  const submit = async () => {
    try {
      await create.mutateAsync({ name, phone, email, photo: photo ?? undefined })
      toast.success('Sales person added')
      onClose()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add sales person"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" loading={create.isPending} onClick={submit} disabled={!name || !phone || !email}>
            Add
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FieldWrap label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FieldWrap>
        <FieldWrap label="Phone" required>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </FieldWrap>
        <FieldWrap label="Email" required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </FieldWrap>
        <FieldWrap label="Photo">
          <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className="block text-sm" />
        </FieldWrap>
      </div>
    </Modal>
  )
}

function AssignCustomersModal({ person, onClose }: { person: SalesPerson; onClose: () => void }) {
  const toast = useToast()
  const assign = useAssignCustomersToSalesPerson(person.id)
  const [ids, setIds] = useState('')

  const submit = async () => {
    try {
      const customerIds = ids.split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n))
      const res = await assign.mutateAsync(customerIds)
      toast.success(res.detail)
      onClose()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Assign customers to ${person.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" loading={assign.isPending} onClick={submit} disabled={!ids}>
            Assign
          </Button>
        </>
      }
    >
      <FieldWrap label="Customer IDs" required hint="Comma-separated IDs, from the Customers list">
        <Input value={ids} onChange={(e) => setIds(e.target.value)} placeholder="1, 2, 5" />
      </FieldWrap>
    </Modal>
  )
}
