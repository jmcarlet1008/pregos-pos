import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import type { User, UserRole } from '../../db'
import { db } from '../../db'
import { Button, Card, Input, Modal, Switch } from '../../components/ui'
import { createUser, resetUserPin, setUserActive, updateUserDetails, type NewUserInput } from './usersData'

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'cashier', label: 'Cashier' },
  { value: 'manager', label: 'Manager' },
]

const tabClass = (active: boolean) =>
  [
    'touch-target flex-1 rounded-md text-body-md font-bold transition-colors',
    active ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface hover:bg-surface-container-high',
  ].join(' ')

function RoleTabs({ value, onChange }: { value: UserRole; onChange: (role: UserRole) => void }) {
  return (
    <div className="flex flex-col gap-xs">
      <span className="text-label-bold text-on-surface">Role</span>
      <div className="flex gap-xs" role="tablist" aria-label="Role">
        {ROLES.map((r) => (
          <button
            key={r.value}
            type="button"
            role="tab"
            aria-selected={value === r.value}
            onClick={() => onChange(r.value)}
            className={tabClass(value === r.value)}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function PinInput({ value, onChange, label = 'PIN (4 digits)' }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <Input
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
      inputMode="numeric"
      maxLength={4}
      placeholder="1234"
    />
  )
}

function AddUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState<UserRole>('cashier')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function reset() {
    setName('')
    setRole('cashier')
    setPin('')
    setError(null)
  }

  async function handleSave() {
    setError(null)
    setSaving(true)
    try {
      const input: NewUserInput = { name, role, pin }
      await createUser(input)
      reset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create user.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      title="Add User"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              reset()
              onClose()
            }}
          >
            Cancel
          </Button>
          <Button variant="primary" disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : 'Add User'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-sm">
        {error && (
          <div className="rounded-md border border-error bg-error-container px-sm py-xs text-body-md text-on-error-container">
            {error}
          </div>
        )}
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Juan Dela Cruz" />
        <RoleTabs value={role} onChange={setRole} />
        <PinInput value={pin} onChange={setPin} />
      </div>
    </Modal>
  )
}

function EditUserModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const [name, setName] = useState(user?.name ?? '')
  const [role, setRole] = useState<UserRole>(user?.role ?? 'cashier')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!user) return
    setError(null)
    setSaving(true)
    try {
      await updateUserDetails(user.id, { name, role })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update user.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={user !== null}
      onClose={onClose}
      title="Edit User"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-sm">
        {error && (
          <div className="rounded-md border border-error bg-error-container px-sm py-xs text-body-md text-on-error-container">
            {error}
          </div>
        )}
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <RoleTabs value={role} onChange={setRole} />
      </div>
    </Modal>
  )
}

function ResetPinModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!user) return
    setError(null)
    setSaving(true)
    try {
      await resetUserPin(user.id, pin)
      setPin('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset PIN.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={user !== null}
      onClose={() => {
        setPin('')
        setError(null)
        onClose()
      }}
      title={`Reset PIN — ${user?.name ?? ''}`}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              setPin('')
              setError(null)
              onClose()
            }}
          >
            Cancel
          </Button>
          <Button variant="primary" disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : 'Reset PIN'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-sm">
        {error && (
          <div className="rounded-md border border-error bg-error-container px-sm py-xs text-body-md text-on-error-container">
            {error}
          </div>
        )}
        <PinInput value={pin} onChange={setPin} label="New PIN (4 digits)" />
      </div>
    </Modal>
  )
}

function UserRow({
  user,
  onEdit,
  onResetPin,
}: {
  user: User
  onEdit: () => void
  onResetPin: () => void
}) {
  const [toggleError, setToggleError] = useState<string | null>(null)

  async function handleToggleActive() {
    try {
      await setUserActive(user.id, !user.active)
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : 'Could not update user.')
    }
  }

  return (
    <div
      className={[
        'flex flex-wrap items-center gap-sm rounded-md border px-sm py-xs',
        user.active ? 'border-surface-dim bg-surface-container-lowest' : 'border-surface-dim bg-surface-container opacity-70',
      ].join(' ')}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body-md font-bold text-on-surface">{user.name}</span>
        <span className="text-label-sm text-on-surface-variant">
          {user.role === 'manager' ? 'Manager' : 'Cashier'}
          {!user.active && ' · Deactivated'}
        </span>
      </div>

      <Button variant="ghost" size="md" onClick={onResetPin}>
        Reset PIN
      </Button>
      <Button variant="ghost" size="md" onClick={onEdit}>
        Edit
      </Button>

      <Switch checked={user.active} onChange={handleToggleActive} label={`${user.name} active`} />

      <Modal
        open={toggleError !== null}
        onClose={() => setToggleError(null)}
        title="Can’t Deactivate User"
        footer={
          <Button variant="primary" onClick={() => setToggleError(null)}>
            OK
          </Button>
        }
      >
        <p className="text-body-md text-on-surface">{toggleError}</p>
      </Modal>
    </div>
  )
}

export function UsersSection() {
  const users = useLiveQuery(() => db.users.toArray()) ?? []
  const sorted = [...users].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  const [addOpen, setAddOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [resettingUser, setResettingUser] = useState<User | null>(null)

  return (
    <Card padding="md" className="flex flex-col gap-md">
      <div className="flex items-center justify-between">
        <h2 className="text-headline-md text-on-surface">Users &amp; PINs</h2>
        <Button variant="primary" size="md" onClick={() => setAddOpen(true)}>
          Add User
        </Button>
      </div>

      <div className="flex flex-col gap-xs">
        {sorted.map((user) => (
          <UserRow key={user.id} user={user} onEdit={() => setEditingUser(user)} onResetPin={() => setResettingUser(user)} />
        ))}
        {sorted.length === 0 && <p className="text-body-md text-on-surface-variant">No users yet.</p>}
      </div>

      <AddUserModal open={addOpen} onClose={() => setAddOpen(false)} />
      <EditUserModal key={editingUser?.id ?? 'none'} user={editingUser} onClose={() => setEditingUser(null)} />
      <ResetPinModal key={`pin-${resettingUser?.id ?? 'none'}`} user={resettingUser} onClose={() => setResettingUser(null)} />
    </Card>
  )
}
