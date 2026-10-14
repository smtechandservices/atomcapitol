'use client'

import { useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Check, Copy, KeyRound, Pencil, Plus, Power, RefreshCw, Search, ShieldCheck, Trash2, Wallet, Crown, Headset } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Input, Select, FieldWrap } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { apiErrorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { formatAge, formatDate, formatDateTime } from '@/lib/format'
import { NAV_GROUPS } from '@/components/layout/nav'
import type { AdminRole, AdminUser } from '@/types'
import { useAdminUsers, useCreateAdminUser, useDeleteAdminUser, useUpdateAdminUser } from './api'

const ROLE_META: Record<AdminRole, { label: string; blurb: string; icon: ReactNode; pill: string }> = {
  SUPER_ADMIN: {
    label: 'Super Admin',
    blurb: 'Everything, including admin users and settings',
    icon: <Crown className="size-3.5" />,
    pill: 'bg-gold-100 text-gold-800 ring-gold-200',
  },
  ACCOUNTS: {
    label: 'Accounts',
    blurb: 'Projects, plots, payments and documents',
    icon: <Wallet className="size-3.5" />,
    pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  },
  KYC_REVIEWER: {
    label: 'KYC Reviewer',
    blurb: 'KYC review queue and customers',
    icon: <ShieldCheck className="size-3.5" />,
    pill: 'bg-sky-50 text-sky-700 ring-sky-200',
  },
  SUPPORT: {
    label: 'Support',
    blurb: 'Tickets, customers and announcements',
    icon: <Headset className="size-3.5" />,
    pill: 'bg-violet-50 text-violet-700 ring-violet-200',
  },
}
const ROLES = Object.keys(ROLE_META) as AdminRole[]

/** The sidebar pages a role can open — derived from the nav config so it never drifts. */
function pagesFor(role: AdminRole) {
  return NAV_GROUPS.flatMap((g) => g.items).filter((i) => !i.roles || i.roles.includes(role) || role === 'SUPER_ADMIN')
}

/** 14 chars from an unambiguous alphabet, via the browser's CSPRNG. */
function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%'
  const bytes = crypto.getRandomValues(new Uint32Array(14))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

const fullName = (u: AdminUser) => `${u.first_name} ${u.last_name}`.trim()
const initialsOf = (u: AdminUser) =>
  (fullName(u) || u.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')

export function AdminUsersPage() {
  const { user: me } = useAuth()
  const toast = useToast()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<AdminRole | ''>('')
  const [status, setStatus] = useState('')
  const [form, setForm] = useState<AdminUser | 'new' | null>(null)
  const [resetFor, setResetFor] = useState<AdminUser | null>(null)
  const [credentials, setCredentials] = useState<{ email: string; password: string; created: boolean } | null>(null)
  const [confirm, setConfirm] = useState<{ kind: 'delete' | 'toggle'; user: AdminUser } | null>(null)

  const { data, isLoading, error } = useAdminUsers({ page, search: search || undefined, role: role || undefined, is_active: status || undefined })
  const update = useUpdateAdminUser()
  const remove = useDeleteAdminUser()

  const resetTo = (fn: () => void) => {
    setPage(1)
    fn()
  }

  const columns: Column<AdminUser>[] = [
    {
      key: 'user',
      header: 'Admin',
      render: (u) => {
        const isMe = u.id === me?.id
        return (
          <div className="flex items-center gap-3">
            <span className={clsx('flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold', u.is_active ? 'bg-ink-800 text-gold-300' : 'bg-ink-100 text-ink-400')}>
              {initialsOf(u)}
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate font-medium text-ink-800">
                {fullName(u) || <span className="italic text-ink-400">No name</span>}
                {isMe && <span className="rounded-full bg-gold-100 px-1.5 text-[10px] font-semibold text-gold-800">You</span>}
              </p>
              <p className="truncate text-xs text-ink-400">{u.email}</p>
            </div>
          </div>
        )
      },
    },
    {
      key: 'role',
      header: 'Role',
      render: (u) => (
        <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1', ROLE_META[u.role].pill)}>
          {ROLE_META[u.role].icon}
          {ROLE_META[u.role].label}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) => (
        <span className={clsx('inline-flex items-center gap-1.5 text-xs font-medium', u.is_active ? 'text-emerald-700' : 'text-ink-400')}>
          <span className={clsx('size-1.5 rounded-full', u.is_active ? 'bg-emerald-500' : 'bg-ink-300')} />
          {u.is_active ? 'Active' : 'Deactivated'}
        </span>
      ),
    },
    {
      key: 'login',
      header: 'Last sign-in',
      render: (u) =>
        u.last_login ? (
          <span className="text-ink-600" title={formatDateTime(u.last_login)}>
            {formatAge(u.last_login)} ago
          </span>
        ) : (
          <span className="text-ink-300">Never</span>
        ),
    },
    { key: 'joined', header: 'Added', render: (u) => <span className="text-ink-500">{formatDate(u.date_joined)}</span> },
    {
      key: 'actions',
      header: '',
      className: 'w-40',
      render: (u) => {
        const isMe = u.id === me?.id
        return (
          <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
            <IconAction title="Edit" onClick={() => setForm(u)} icon={<Pencil className="size-4" />} />
            <IconAction title="Reset password" onClick={() => setResetFor(u)} icon={<KeyRound className="size-4" />} />
            <IconAction
              title={isMe ? "You can't deactivate yourself" : u.is_active ? 'Deactivate' : 'Reactivate'}
              disabled={isMe}
              onClick={() => setConfirm({ kind: 'toggle', user: u })}
              icon={<Power className="size-4" />}
            />
            <IconAction
              title={isMe ? "You can't delete yourself" : 'Delete'}
              disabled={isMe}
              danger
              onClick={() => setConfirm({ kind: 'delete', user: u })}
              icon={<Trash2 className="size-4" />}
            />
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Admin Users & Roles"
        subtitle="Staff accounts for this portal — each role only sees the pages it needs"
        actions={
          <Button variant="secondary" onClick={() => setForm('new')}>
            <Plus className="size-4" /> Add admin
          </Button>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4">
          <div className="flex items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
              <Input className="pl-9" placeholder="Search by name or email" value={search} onChange={(e) => resetTo(() => setSearch(e.target.value))} />
            </div>
            {/* Select is w-full by default, so the wrapper sets its width */}
            <div className="w-40 shrink-0">
              <Select value={status} onChange={(e) => resetTo(() => setStatus(e.target.value))}>
                <option value="">Any status</option>
                <option value="true">Active</option>
                <option value="false">Deactivated</option>
              </Select>
            </div>
          </div>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
            {(['', ...ROLES] as const).map((r) => {
              const active = role === r
              return (
                <button
                  key={r || 'all'}
                  onClick={() => resetTo(() => setRole(r))}
                  className={clsx(
                    'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    active ? 'border-ink-800 bg-ink-800 text-white' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:bg-ink-50',
                  )}
                >
                  {r && <span className={active ? 'text-gold-300' : 'text-ink-400'}>{ROLE_META[r].icon}</span>}
                  {r ? ROLE_META[r].label : 'All roles'}
                </button>
              )
            })}
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={data?.results ?? []}
          rowKey={(r) => r.id}
          isLoading={isLoading}
          error={error ? apiErrorMessage(error) : null}
          onRowClick={(u) => setForm(u)}
          page={page}
          onPageChange={setPage}
          count={data?.count}
          emptyTitle={search || role || status ? 'No admins match' : 'No admin users'}
          emptySubtitle={search || role || status ? 'Try a different search or filter.' : 'Add a staff account to give someone portal access.'}
        />
      </Card>

      {form && (
        <AdminForm
          user={form === 'new' ? undefined : form}
          isMe={form !== 'new' && form.id === me?.id}
          onClose={() => setForm(null)}
          onCreated={(email, password) => setCredentials({ email, password, created: true })}
        />
      )}
      {resetFor && <ResetPassword user={resetFor} onClose={() => setResetFor(null)} onDone={(email, password) => setCredentials({ email, password, created: false })} />}
      {credentials && <CredentialsModal {...credentials} onClose={() => setCredentials(null)} />}

      <ConfirmDialog
        open={confirm?.kind === 'toggle'}
        title={confirm?.user.is_active ? `Deactivate ${fullName(confirm.user) || confirm.user.email}?` : `Reactivate ${confirm ? fullName(confirm.user) || confirm.user.email : ''}?`}
        message={
          confirm?.user.is_active
            ? "They'll be signed out and can't sign in until reactivated. Their history stays in the audit log."
            : 'They can sign in again with their existing password.'
        }
        confirmLabel={confirm?.user.is_active ? 'Deactivate' : 'Reactivate'}
        danger={!!confirm?.user.is_active}
        loading={update.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return
          try {
            await update.mutateAsync({ id: confirm.user.id, values: { is_active: !confirm.user.is_active } })
            toast.success(confirm.user.is_active ? 'Deactivated' : 'Reactivated')
            setConfirm(null)
          } catch (err) {
            toast.error(apiErrorMessage(err))
          }
        }}
      />
      <ConfirmDialog
        open={confirm?.kind === 'delete'}
        title="Delete admin user"
        message={`Permanently delete ${confirm?.user.email}? Deactivating instead keeps their name on past actions.`}
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return
          try {
            await remove.mutateAsync(confirm.user.id)
            toast.success('Admin deleted')
            setConfirm(null)
          } catch (err) {
            toast.error(apiErrorMessage(err))
          }
        }}
      />
    </div>
  )
}

function IconAction({ title, onClick, icon, disabled, danger }: { title: string; onClick: () => void; icon: ReactNode; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'flex size-8 items-center justify-center rounded-lg text-ink-400 transition-colors disabled:cursor-not-allowed disabled:opacity-30',
        danger ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-ink-100 hover:text-ink-700',
      )}
    >
      {icon}
    </button>
  )
}

function RolePicker({ value, onChange, disabled }: { value: AdminRole; onChange: (r: AdminRole) => void; disabled?: boolean }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ROLES.map((r) => {
          const on = value === r
          return (
            <button
              key={r}
              type="button"
              disabled={disabled}
              onClick={() => onChange(r)}
              className={clsx(
                'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed',
                on ? 'border-gold-500 bg-gold-50 ring-2 ring-gold-100' : 'border-ink-200 hover:border-ink-300 hover:bg-ink-50',
                disabled && !on && 'opacity-50',
              )}
            >
              <span className={clsx('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md ring-1', ROLE_META[r].pill)}>{ROLE_META[r].icon}</span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink-800">{ROLE_META[r].label}</span>
                <span className="block text-xs text-ink-400">{ROLE_META[r].blurb}</span>
              </span>
            </button>
          )
        })}
      </div>
      <div className="rounded-lg bg-ink-50/70 px-3 py-2">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Can open</p>
        <div className="flex flex-wrap gap-1">
          {pagesFor(value).map((i) => (
            <span key={i.to} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] text-ink-600 ring-1 ring-ink-100">
              <i.icon className="size-3" />
              {i.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function AdminForm({ user, isMe, onClose, onCreated }: { user?: AdminUser; isMe: boolean; onClose: () => void; onCreated: (email: string, password: string) => void }) {
  const toast = useToast()
  const create = useCreateAdminUser()
  const update = useUpdateAdminUser()
  const [email, setEmail] = useState(user?.email ?? '')
  const [firstName, setFirstName] = useState(user?.first_name ?? '')
  const [lastName, setLastName] = useState(user?.last_name ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [role, setRole] = useState<AdminRole>(user?.role ?? 'SUPPORT')
  const [password, setPassword] = useState(() => (user ? '' : generatePassword()))

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const valid = emailValid && (user || password.length >= 8)

  const submit = async () => {
    try {
      if (user) {
        await update.mutateAsync({
          id: user.id,
          values: { first_name: firstName.trim(), last_name: lastName.trim(), phone: phone.trim(), ...(isMe ? {} : { role }) },
        })
        toast.success('Saved')
      } else {
        await create.mutateAsync({ email: email.trim(), first_name: firstName.trim(), last_name: lastName.trim(), phone: phone.trim(), role, password })
        onCreated(email.trim(), password)
      }
      onClose()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={user ? `Edit ${fullName(user) || user.email}` : 'Add admin'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" loading={create.isPending || update.isPending} disabled={!valid} onClick={submit}>
            {user ? 'Save changes' : 'Create account'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldWrap label="First name">
            <Input autoFocus value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </FieldWrap>
          <FieldWrap label="Last name">
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </FieldWrap>
          <FieldWrap label="Email" required hint={user ? 'Sign-in email — create a new account to change it' : undefined} error={email && !emailValid ? 'Enter a valid email' : undefined}>
            <Input type="email" value={email} disabled={!!user} onChange={(e) => setEmail(e.target.value)} />
          </FieldWrap>
          <FieldWrap label="Phone">
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91" />
          </FieldWrap>
        </div>

        <FieldWrap label="Role" hint={isMe ? "You can't change your own role" : undefined}>
          <RolePicker value={role} onChange={setRole} disabled={isMe} />
        </FieldWrap>

        {!user && (
          <FieldWrap label="Temporary password" required hint="Shown once after creating so you can share it — they can sign in straight away.">
            <PasswordField value={password} onChange={setPassword} />
          </FieldWrap>
        )}
      </div>
    </Modal>
  )
}

function PasswordField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      <Input className="font-mono" value={value} onChange={(e) => onChange(e.target.value)} />
      <Button type="button" variant="outline" onClick={() => onChange(generatePassword())} title="Generate a new password">
        <RefreshCw className="size-4" />
      </Button>
    </div>
  )
}

function ResetPassword({ user, onClose, onDone }: { user: AdminUser; onClose: () => void; onDone: (email: string, password: string) => void }) {
  const toast = useToast()
  const update = useUpdateAdminUser()
  const [password, setPassword] = useState(generatePassword)
  return (
    <Modal
      open
      onClose={onClose}
      title={`Reset password · ${fullName(user) || user.email}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            loading={update.isPending}
            disabled={password.length < 8}
            onClick={async () => {
              try {
                await update.mutateAsync({ id: user.id, values: { password } })
                onDone(user.email, password)
                onClose()
              } catch (err) {
                toast.error(apiErrorMessage(err))
              }
            }}
          >
            Set password
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <PasswordField value={password} onChange={setPassword} />
        <p className="text-xs text-ink-400">Their old password stops working immediately. Share the new one securely.</p>
      </div>
    </Modal>
  )
}

/** Shown once after create/reset so the password can be handed over — it isn't retrievable later. */
function CredentialsModal({ email, password, created, onClose }: { email: string; password: string; created: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const text = `Atom Capitol admin portal\nEmail: ${email}\nPassword: ${password}`
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={created ? 'Account created' : 'Password reset'}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-600">Copy these now — the password won&apos;t be shown again.</p>
        <div className="space-y-1 rounded-lg bg-ink-50 px-3 py-2.5 font-mono text-sm text-ink-800">
          <p>{email}</p>
          <p className="break-all">{password}</p>
        </div>
        <Button
          variant="outline"
          className="w-full"
          onClick={async () => {
            await navigator.clipboard.writeText(text)
            setCopied(true)
          }}
        >
          {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
          {copied ? 'Copied' : 'Copy sign-in details'}
        </Button>
      </div>
    </Modal>
  )
}
