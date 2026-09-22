const ACCESS_KEY = 'ac_admin_access'
const REFRESH_KEY = 'ac_admin_refresh'
const USER_KEY = 'ac_admin_user'

export interface StoredAdminUser {
  id: number
  email: string
  name: string
  role: 'SUPER_ADMIN' | 'KYC_REVIEWER' | 'ACCOUNTS' | 'SUPPORT'
}

function safeLocalStorage() {
  if (typeof window === 'undefined') return null
  return window.localStorage
}

/** Fired whenever the stored session changes, so useSyncExternalStore can resync. */
export const AUTH_EVENT = 'ac:auth-changed'

function notify() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_EVENT))
}

let cachedRaw: string | null = null
let cachedUser: StoredAdminUser | null = null

export const tokenStore = {
  getAccess(): string | null {
    return safeLocalStorage()?.getItem(ACCESS_KEY) ?? null
  },
  getRefresh(): string | null {
    return safeLocalStorage()?.getItem(REFRESH_KEY) ?? null
  },
  // Caches the parsed object per raw string so useSyncExternalStore's
  // getSnapshot returns a referentially stable value when nothing changed —
  // otherwise every render would look like a store update and loop forever.
  getUser(): StoredAdminUser | null {
    const raw = safeLocalStorage()?.getItem(USER_KEY) ?? null
    if (raw === cachedRaw) return cachedUser
    cachedRaw = raw
    if (!raw) {
      cachedUser = null
      return null
    }
    try {
      cachedUser = JSON.parse(raw) as StoredAdminUser
    } catch {
      cachedUser = null
    }
    return cachedUser
  },
  setSession(access: string, refresh: string, user: StoredAdminUser) {
    const storage = safeLocalStorage()
    storage?.setItem(ACCESS_KEY, access)
    storage?.setItem(REFRESH_KEY, refresh)
    storage?.setItem(USER_KEY, JSON.stringify(user))
    notify()
  },
  setAccess(access: string) {
    safeLocalStorage()?.setItem(ACCESS_KEY, access)
  },
  clear() {
    const storage = safeLocalStorage()
    storage?.removeItem(ACCESS_KEY)
    storage?.removeItem(REFRESH_KEY)
    storage?.removeItem(USER_KEY)
    notify()
  },
}
