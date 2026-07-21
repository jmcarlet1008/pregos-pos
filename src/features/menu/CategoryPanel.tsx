import { useState } from 'react'
import type { Category } from '../../db'
import { Button, DragHandleIcon, Input, Modal, SortableList, Switch, type DragHandleProps } from '../../components/ui'
import { createCategory, deleteCategory, renameCategory, reorderCategories, setCategoryActive } from './menuData'

export interface CategoryPanelProps {
  categories: Category[]
  selectedId: string | null
  onSelect: (categoryId: string | null) => void
}

function CategoryRow({
  category,
  selected,
  onSelect,
  dragAttributes,
  dragListeners,
}: {
  category: Category
  selected: boolean
  onSelect: () => void
  dragAttributes: DragHandleProps['attributes']
  dragListeners: DragHandleProps['listeners']
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  async function commitRename() {
    setEditing(false)
    const trimmed = name.trim()
    if (!trimmed || trimmed === category.name) {
      setName(category.name)
      return
    }
    await renameCategory(category.id, trimmed)
  }

  async function handleDelete() {
    setConfirmingDelete(false)
    try {
      await deleteCategory(category.id)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete category.')
    }
  }

  return (
    <div
      className={[
        'flex items-center gap-xs rounded-md border px-xs py-xs',
        selected ? 'border-primary bg-primary-fixed/40' : 'border-surface-dim bg-surface-container-lowest',
      ].join(' ')}
    >
      <button
        type="button"
        {...dragAttributes}
        {...dragListeners}
        aria-label="Drag to reorder"
        className="touch-target flex shrink-0 cursor-grab items-center justify-center text-on-surface-variant active:cursor-grabbing"
      >
        <DragHandleIcon />
      </button>

      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setName(category.name)
              setEditing(false)
            }
          }}
          className="min-w-0 flex-1 rounded border border-primary bg-surface-container-lowest px-xs py-[2px] text-body-md text-on-surface"
        />
      ) : (
        <button
          type="button"
          onClick={onSelect}
          onDoubleClick={() => setEditing(true)}
          className="min-w-0 flex-1 truncate text-left text-body-md font-bold text-on-surface"
        >
          {category.name}
        </button>
      )}

      <Switch checked={category.active} onChange={(active) => void setCategoryActive(category.id, active)} label={`${category.name} active`} />

      <button
        type="button"
        onClick={() => setConfirmingDelete(true)}
        aria-label={`Delete ${category.name}`}
        className="touch-target flex shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-error-container hover:text-on-error-container"
      >
        ×
      </button>

      <Modal
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Delete Category"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-body-md text-on-surface">Delete “{category.name}”? This can’t be undone.</p>
      </Modal>

      <Modal
        open={deleteError !== null}
        onClose={() => setDeleteError(null)}
        title="Can’t Delete Category"
        footer={
          <Button variant="primary" onClick={() => setDeleteError(null)}>
            OK
          </Button>
        }
      >
        <p className="text-body-md text-on-surface">{deleteError}</p>
      </Modal>
    </div>
  )
}

export function CategoryPanel({ categories, selectedId, onSelect }: CategoryPanelProps) {
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)

  async function handleAdd() {
    const trimmed = newName.trim()
    if (!trimmed) return
    setAdding(true)
    try {
      await createCategory({ name: trimmed })
      setNewName('')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="flex w-64 shrink-0 flex-col gap-sm">
      <h2 className="text-label-bold text-on-surface-variant">Categories</h2>

      <button
        type="button"
        onClick={() => onSelect(null)}
        className={[
          'touch-target rounded-md px-sm text-left text-body-md font-bold transition-colors',
          selectedId === null
            ? 'bg-primary text-on-primary'
            : 'bg-surface-container text-on-surface hover:bg-surface-container-high',
        ].join(' ')}
      >
        All Products
      </button>

      <SortableList
        items={categories}
        getId={(c) => c.id}
        onReorder={(ids) => void reorderCategories(ids)}
        className="flex flex-col gap-xs"
        renderItem={(category, drag) => (
          <CategoryRow
            category={category}
            selected={selectedId === category.id}
            onSelect={() => onSelect(category.id)}
            dragAttributes={drag.attributes}
            dragListeners={drag.listeners}
          />
        )}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void handleAdd()
        }}
        className="flex gap-xs"
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category"
          aria-label="New category name"
          className="flex-1"
        />
        <Button type="submit" variant="secondary" disabled={adding || !newName.trim()}>
          Add
        </Button>
      </form>
    </div>
  )
}
