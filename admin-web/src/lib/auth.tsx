'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, apiErrorMessage } from './api'
import { AUTH_EVENT, tokenStore, type StoredAdminUser } from './tokens'

interface AuthContextValue {
  user: StoredAdminUser | null
  isAuthenticated: boolean
  isReady: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  hasRole: (...roles: StoredAdminUser['role'][]) => boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StoredAdminUser | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    // Reads localStorage only after mount — the server has no session to
    // render, so this can't run before hydration without a mismatch. Callers
    // gate on `isReady` instead of guessing "signed out" from the SSR-safe
    // initial null, which is what prevents a redirect flash on hard reloads.
    const sync = () => setUser(tokenStore.getUser())
    sync()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
    setIsReady(true)
    window.addEventListener(AUTH_EVENT, sync)
    return () => window.removeEventListener(AUTH_EVENT, sync)
  }, [])

  const login = async (email: string, password: string) => {
    try {
      const { data } = await api.post('/admin/auth/login/', { email, password })
      tokenStore.setSession(data.access, data.refresh, data.admin)
    } catch (err) {
      throw new Error(apiErrorMessage(err, 'Invalid email or password'))
    }
  }

  const logout = () => {
    const refresh = tokenStore.getRefresh()
    tokenStore.clear()
    if (refresh) {
      api.post('/auth/logout/', { refresh }).catch(() => {})
    }
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      isReady,
      login,
      logout,
      hasRole: (...roles) => !!user && (roles.includes(user.role) || user.role === 'SUPER_ADMIN'),
    }),
    [user, isReady],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
