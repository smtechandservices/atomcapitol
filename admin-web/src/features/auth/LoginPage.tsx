'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/Button'
import { Input, FieldWrap } from '@/components/ui/Field'
import { FullPageSpinner } from '@/components/ui/Spinner'

export function LoginPage() {
  const { login, isAuthenticated, isReady } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isReady && isAuthenticated) {
      router.replace('/')
    }
  }, [isReady, isAuthenticated, router])

  if (!isReady || isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-800">
        <FullPageSpinner />
      </div>
    )
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
      router.replace('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-800 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Image src="/logo.png" alt="Atom Capitol" width={472} height={104} className="h-10 w-auto" priority />
          <p className="text-sm font-medium text-ink-400">Admin Portal</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <FieldWrap label="Email" required>
            <Input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@atomcapitol.com"
              required
            />
          </FieldWrap>
          <FieldWrap label="Password" required>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </FieldWrap>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
          <Button type="submit" variant="secondary" className="w-full" loading={loading}>
            Sign in
          </Button>
        </form>
      </div>
    </div>
  )
}
