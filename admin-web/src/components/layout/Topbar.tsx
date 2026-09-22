'use client'

import { LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

export function Topbar() {
  const { user, logout } = useAuth()
  const router = useRouter()

  const initials = (user?.name?.[0] ?? user?.email?.[0] ?? '?').toUpperCase()

  const handleLogout = () => {
    logout()
    router.replace('/login')
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-ink-100 bg-white px-6">
      <div />
      <div className="flex items-center gap-3">
        <div className="flex size-8 items-center justify-center rounded-full bg-gold-500 text-sm font-semibold text-ink-900">
          {initials}
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-ink-500 hover:bg-ink-50 hover:text-ink-800"
        >
          <LogOut className="size-4" />
          Logout
        </button>
      </div>
    </header>
  )
}
