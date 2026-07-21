import { db, type User, type UserRole } from '../../db'

function id() {
  return crypto.randomUUID()
}

function timestamps() {
  const now = new Date().toISOString()
  return { created_at: now, updated_at: now }
}

function touch<T extends { updated_at: string }>(entity: T): T {
  return { ...entity, updated_at: new Date().toISOString() }
}

function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin)
}

async function isPinTaken(pin: string, excludeUserId?: string): Promise<boolean> {
  const existing = await db.users.where({ pin }).first()
  return Boolean(existing && existing.id !== excludeUserId)
}

/** Active managers, optionally excluding one user (used to check "is this the last one?"). */
async function countActiveManagers(excludeUserId?: string): Promise<number> {
  const managers = await db.users.where({ role: 'manager', active: true }).toArray()
  return managers.filter((m) => m.id !== excludeUserId).length
}

export interface NewUserInput {
  name: string
  role: UserRole
  pin: string
}

export async function createUser(input: NewUserInput): Promise<string> {
  const name = input.name.trim()
  if (!name) throw new Error('Name is required.')
  if (!isValidPin(input.pin)) throw new Error('PIN must be exactly 4 digits.')
  if (await isPinTaken(input.pin)) throw new Error('That PIN is already in use by another user.')

  const user: User = {
    id: id(),
    name,
    pin: input.pin,
    role: input.role,
    active: true,
    sync_status: 'pending',
    ...timestamps(),
  }
  await db.users.add(user)
  return user.id
}

export interface UserDetailsInput {
  name: string
  role: UserRole
}

/** Updates name/role. Throws if this would demote the last active Manager. */
export async function updateUserDetails(userId: string, input: UserDetailsInput): Promise<void> {
  const user = await db.users.get(userId)
  if (!user) return
  const name = input.name.trim()
  if (!name) throw new Error('Name is required.')
  if (user.role === 'manager' && input.role !== 'manager' && user.active) {
    const remaining = await countActiveManagers(userId)
    if (remaining === 0) throw new Error('At least one active Manager account is required.')
  }
  await db.users.put(touch({ ...user, name, role: input.role }))
}

export async function resetUserPin(userId: string, newPin: string): Promise<void> {
  if (!isValidPin(newPin)) throw new Error('PIN must be exactly 4 digits.')
  if (await isPinTaken(newPin, userId)) throw new Error('That PIN is already in use by another user.')
  const user = await db.users.get(userId)
  if (!user) return
  await db.users.put(touch({ ...user, pin: newPin }))
}

/** Activates/deactivates a user. Throws if deactivating would remove the last active Manager. */
export async function setUserActive(userId: string, active: boolean): Promise<void> {
  const user = await db.users.get(userId)
  if (!user) return
  if (!active && user.role === 'manager') {
    const remaining = await countActiveManagers(userId)
    if (remaining === 0) throw new Error('Can’t deactivate the last active Manager account.')
  }
  await db.users.put(touch({ ...user, active }))
}
