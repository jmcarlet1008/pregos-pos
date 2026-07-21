import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { db, type UserRole } from '../../db'

export interface AuthUser {
  id: string
  name: string
  role: UserRole
}

interface StoredSession {
  userId: string
  shiftId: string | null
}

interface AuthContextValue {
  user: AuthUser | null
  ready: boolean
  loginWithPin: (pin: string, options?: { requireRole?: UserRole }) => Promise<{ ok: true } | { ok: false; error: string }>
  logout: () => void
}

const SESSION_KEY = 'pregos-pos:session'
const AuthContext = createContext<AuthContextValue | null>(null)

function readStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as StoredSession
  } catch {
    return null
  }
}

function writeStoredSession(session: StoredSession | null) {
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } else {
    localStorage.removeItem(SESSION_KEY)
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [shiftId, setShiftId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const stored = readStoredSession()
    if (!stored) {
      setReady(true)
      return
    }
    db.users.get(stored.userId).then((record) => {
      if (record && record.active) {
        setUser({ id: record.id, name: record.name, role: record.role })
        setShiftId(stored.shiftId)
      } else {
        writeStoredSession(null)
      }
      setReady(true)
    })
  }, [])

  async function loginWithPin(pin: string, options?: { requireRole?: UserRole }) {
    const record = await db.users.where({ pin }).first()
    if (!record || !record.active) {
      return { ok: false as const, error: 'PIN not recognized.' }
    }
    if (options?.requireRole && record.role !== options.requireRole) {
      return { ok: false as const, error: 'This PIN does not have manager access.' }
    }

    let openShift = await db.shifts.where({ user_id: record.id, status: 'open' }).first()
    if (!openShift) {
      const now = new Date().toISOString()
      openShift = {
        id: crypto.randomUUID(),
        user_id: record.id,
        clock_in: now,
        clock_out: null,
        status: 'open',
        sync_status: 'pending',
        created_at: now,
        updated_at: now,
      }
      await db.shifts.add(openShift)
    }

    const nextUser: AuthUser = { id: record.id, name: record.name, role: record.role }
    setUser(nextUser)
    setShiftId(openShift.id)
    writeStoredSession({ userId: record.id, shiftId: openShift.id })
    return { ok: true as const }
  }

  function logout() {
    setUser(null)
    setShiftId(null)
    writeStoredSession(null)
  }

  const value = useMemo<AuthContextValue>(
    () => ({ user, ready, loginWithPin, logout }),
    // shiftId isn't read by consumers yet but participates in login state
    [user, ready, shiftId],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
