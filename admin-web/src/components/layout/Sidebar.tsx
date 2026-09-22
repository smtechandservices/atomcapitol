'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import { NAV_GROUPS } from './nav'
import { useAuth } from '@/lib/auth'

export function Sidebar() {
  const { user, hasRole } = useAuth()
  const pathname = usePathname()

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-ink-800/60 bg-ink-800">
      <div className="flex items-center gap-2 border-b border-white/10 px-5 py-5">
        <Image src="/logo.png" alt="Atom Capitol" width={472} height={104} className="h-8 w-auto brightness-0 invert" priority />
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => !item.roles || hasRole(...item.roles))
          if (items.length === 0) return null
          return (
            <div key={group.label}>
              <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const isActive = item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)
                  return (
                    <Link
                      key={item.to}
                      href={item.to}
                      className={clsx(
                        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                        isActive ? 'bg-gold-500 text-ink-900' : 'text-ink-200 hover:bg-white/5 hover:text-white',
                      )}
                    >
                      <item.icon className="size-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>
      <div className="border-t border-white/10 px-4 py-3 text-xs text-ink-300">
        <p className="truncate font-medium text-white">{user?.email}</p>
        <p className="capitalize text-ink-400">{user?.role.replaceAll('_', ' ').toLowerCase()}</p>
      </div>
    </aside>
  )
}
