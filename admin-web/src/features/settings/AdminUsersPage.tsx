'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Input, Select, FieldWrap } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { formatDate } from '@/lib/format'
import type { AdminUser } from '@/types'
import { useAdminUsers, useCreateAdminUser, useDeleteAdminUser, useUpdateAdminUser, type AdminUserFormValues } from './api'
import { useAuth } from '@/lib/auth'

const emptyForm: AdminUserFormValues = { email: '', first_name: '', last_name: '', phone: '', role: 'SUPPORT', password: '' }

export function AdminUsersPage() {
  const [page, setPage] = useState(1)
  const { data, isLoading, error } = useAdminUsers({ page })
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null)
  const [form, setForm] = useState<AdminUserFormValues>(emptyForm)

  const toast = useToast()
  const { user: me } = useAuth()
  const createUser = useCreateAdminUser()
  const updateUser = useUpdateAdminUser()
  const deleteUser = useDeleteAdminUser()

  const columns: Column<AdminUser>[] = [
    { key: 'email', header: 'Email', render: (u) => <span className="font-medium text-ink-800">{u.email}</span> },
    { key: 'name', header: 'Name', render: (u) => `${u.first_name} ${u.last_name}`.trim() || '—' },
    { key: 'role', header: 'Role', render: (u) => <Badge tone="gold">{u.role.replaceAll('_', ' ')}</Badge> },
    { key: 'active', header: 'Active', render: (u) => <Badge tone={u.is_active ? 'success' : 'neutral'}>{u.is_active ? 'Yes' : 'No'}</Badge> },
    { key: 'joined', header: 'Joined', render: (u) => formatDate(u.date_joined) },
    {
      key: 'actions',
      header: '',
      render: (u) => (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          {u.email !== me?.email && (
            <button onClick={() => setDeleteTarget(u)} className="text-ink-400 hover:text-red-600">
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      ),
    },
  ]

  const submit = async () => {
    try {
      await createUser.mutateAsync(form)
      toast.success('Admin user created')
      setCreateOpen(false)
      setForm(emptyForm)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <div>
      <PageHeader
        title="Admin Users & Roles"
        subtitle="Create staff accounts with role-based permissions"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> New admin user
          </Button>
        }
      />

      <Card>
        <DataTable
          columns={columns}
          rows={data?.results ?? []}
          rowKey={(r) => r.id}
          isLoading={isLoading}
          error={error ? apiErrorMessage(error) : null}
          onRowClick={(row) => {
            updateUser.mutate(
              { id: row.id, values: { is_active: !row.is_active } },
              { onError: (err) => toast.error(apiErrorMessage(err)) },
            )
          }}
          page={page}
          onPageChange={setPage}
          count={data?.count}
          emptySubtitle="Row click toggles active status."
        />
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New admin user"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="secondary" loading={createUser.isPending} onClick={submit} disabled={!form.email}>
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FieldWrap label="Email" required>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </FieldWrap>
          <div className="grid grid-cols-2 gap-3">
            <FieldWrap label="First name">
              <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </FieldWrap>
            <FieldWrap label="Last name">
              <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </FieldWrap>
          </div>
          <FieldWrap label="Role">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="SUPPORT">Support</option>
              <option value="ACCOUNTS">Accounts</option>
              <option value="KYC_REVIEWER">KYC Reviewer</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </Select>
          </FieldWrap>
          <FieldWrap label="Password" hint="Leave blank to auto-generate a random password">
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </FieldWrap>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete admin user"
        message={`Permanently remove ${deleteTarget?.email}'s access?`}
        confirmLabel="Delete"
        danger
        loading={deleteUser.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return
          try {
            await deleteUser.mutateAsync(deleteTarget.id)
            toast.success('Admin user deleted')
            setDeleteTarget(null)
          } catch (err) {
            toast.error(apiErrorMessage(err))
          }
        }}
      />
    </div>
  )
}
