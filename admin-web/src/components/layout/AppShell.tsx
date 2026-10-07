import { Sidebar } from './Sidebar'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-ink-50">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6">{children}</main>
    </div>
  )
}
