'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/Button'
import { Input, FieldWrap } from '@/components/ui/Field'
import { FullPageSpinner } from '@/components/ui/Spinner'

export function LoginPage() {
  const { login, isAuthenticated, isReady } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-ink-400 hover:text-ink-700 focus:outline-none focus-visible:text-gold-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
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
