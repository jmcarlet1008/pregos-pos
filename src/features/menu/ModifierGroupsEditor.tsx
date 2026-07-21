import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, type ModifierGroup, type ModifierOption } from '../../db'
import {
  Button,
  Card,
  DragHandleIcon,
  Input,
  Modal,
  SortableList,
  Switch,
  type DragHandleProps,
} from '../../components/ui'
import { formatCurrency } from '../../lib/currency'
import {
  createModifierGroup,
  createModifierOption,
  deleteModifierGroup,
  deleteModifierOption,
  reorderModifierGroups,
  reorderModifierOptions,
  updateModifierGroup,
  updateModifierOption,
} from './menuData'

interface GroupWithOptions extends ModifierGroup {
  options: ModifierOption[]
}

async function loadGroups(productId: string): Promise<GroupWithOptions[]> {
  const groups = await db.modifierGroups.where('product_id').equals(productId).sortBy('sort_order')
  return Promise.all(
    groups.map(async (group) => ({
      ...group,
      options: await db.modifierOptions.where('modifier_group_id').equals(group.id).sortBy('sort_order'),
    })),
  )
}

function OptionRow({
  option,
  dragAttributes,
  dragListeners,
}: {
  option: ModifierOption
  dragAttributes: DragHandleProps['attributes']
  dragListeners: DragHandleProps['listeners']
}) {
  const [name, setName] = useState(option.name)
  const [priceAdjustment, setPriceAdjustment] = useState(String(option.price_adjustment))
  const [deductQty, setDeductQty] = useState(String(option.deduct_qty))
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  function commit(patch: Partial<{ name: string; price_adjustment: number; deducts_stock: boolean; deduct_qty: number }>) {
    void updateModifierOption(option.id, {
      name: patch.name ?? option.name,
      price_adjustment: patch.price_adjustment ?? option.price_adjustment,
      deducts_stock: patch.deducts_stock ?? option.deducts_stock,
      deduct_qty: patch.deduct_qty ?? option.deduct_qty,
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-xs rounded-md border border-surface-dim bg-surface px-xs py-xs">
      <button
        type="button"
        {...dragAttributes}
        {...dragListeners}
        aria-label="Drag to reorder option"
        className="touch-target flex shrink-0 cursor-grab items-center justify-center text-on-surface-variant active:cursor-grabbing"
      >
        <DragHandleIcon />
      </button>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => commit({ name })}
        placeholder="Option name"
        className="min-w-[120px] flex-1 rounded border border-outline bg-surface-container-lowest px-xs py-[6px] text-body-md text-on-surface"
      />

      <div className="flex items-center gap-[2px]">
        <span className="text-label-sm text-on-surface-variant">+₱</span>
        <input
          type="number"
          step="0.01"
          value={priceAdjustment}
          onChange={(e) => setPriceAdjustment(e.target.value)}
          onBlur={() => commit({ price_adjustment: Number(priceAdjustment) || 0 })}
          className="w-20 rounded border border-outline bg-surface-container-lowest px-xs py-[6px] text-body-md text-on-surface"
        />
      </div>

      <label className="flex items-center gap-xs text-label-sm text-on-surface-variant">
        <Switch
          checked={option.deducts_stock}
          onChange={(deducts_stock) => commit({ deducts_stock })}
          label={`${option.name} deducts stock`}
        />
        Deducts stock
      </label>

      {option.deducts_stock && (
        <div className="flex items-center gap-[2px]">
          <span className="text-label-sm text-on-surface-variant">qty</span>
          <input
            type="number"
            min={1}
            step="1"
            value={deductQty}
            onChange={(e) => setDeductQty(e.target.value)}
            onBlur={() => commit({ deduct_qty: Math.max(1, Number(deductQty) || 1) })}
            className="w-14 rounded border border-outline bg-surface-container-lowest px-xs py-[6px] text-body-md text-on-surface"
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => setConfirmingDelete(true)}
        aria-label={`Delete option ${option.name}`}
        className="touch-target ml-auto flex shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-error-container hover:text-on-error-container"
      >
        ×
      </button>

      <Modal
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Delete Option"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmingDelete(false)
                void deleteModifierOption(option.id)
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-body-md text-on-surface">Delete “{option.name}”?</p>
      </Modal>
    </div>
  )
}

function AddOptionForm({ groupId }: { groupId: string }) {
  const [name, setName] = useState('')
  const [priceAdjustment, setPriceAdjustment] = useState('0')
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      await createModifierOption(groupId, {
        name: trimmed,
        price_adjustment: Number(priceAdjustment) || 0,
        deducts_stock: false,
        deduct_qty: 1,
      })
      setName('')
      setPriceAdjustment('0')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void handleAdd()
      }}
      className="flex gap-xs"
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New option name"
        aria-label="New option name"
        className="flex-1"
      />
      <Input
        type="number"
        step="0.01"
        value={priceAdjustment}
        onChange={(e) => setPriceAdjustment(e.target.value)}
        aria-label="Price adjustment"
        className="w-24"
      />
      <Button type="submit" variant="secondary" disabled={saving || !name.trim()}>
        + Option
      </Button>
    </form>
  )
}

function GroupCard({
  group,
  dragAttributes,
  dragListeners,
}: {
  group: GroupWithOptions
  dragAttributes: DragHandleProps['attributes']
  dragListeners: DragHandleProps['listeners']
}) {
  const [name, setName] = useState(group.name)
  const [minPicks, setMinPicks] = useState(String(group.min_picks))
  const [maxPicks, setMaxPicks] = useState(String(group.max_picks))
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  function commit(patch: Partial<{ name: string; required: boolean; min_picks: number; max_picks: number }>) {
    void updateModifierGroup(group.id, {
      name: patch.name ?? group.name,
      required: patch.required ?? group.required,
      min_picks: patch.min_picks ?? group.min_picks,
      max_picks: patch.max_picks ?? group.max_picks,
    })
  }

  function handleRequiredToggle(required: boolean) {
    commit({ required, min_picks: required ? Math.max(1, group.min_picks) : 0 })
    if (!required) setMinPicks('0')
    else if (group.min_picks < 1) setMinPicks('1')
  }

  return (
    <Card padding="sm" className="flex flex-col gap-sm">
      <div className="flex flex-wrap items-center gap-xs">
        <button
          type="button"
          {...dragAttributes}
          {...dragListeners}
          aria-label="Drag to reorder group"
          className="touch-target flex shrink-0 cursor-grab items-center justify-center text-on-surface-variant active:cursor-grabbing"
        >
          <DragHandleIcon />
        </button>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => commit({ name })}
          placeholder="Group name (e.g. Add-ons)"
          className="min-w-[140px] flex-1 rounded border border-outline bg-surface-container-lowest px-xs py-[6px] text-body-md font-bold text-on-surface"
        />

        <label className="flex items-center gap-xs text-label-sm text-on-surface-variant">
          <Switch checked={group.required} onChange={handleRequiredToggle} label={`${group.name} required`} />
          Required
        </label>

        <div className="flex items-center gap-[2px] text-label-sm text-on-surface-variant">
          <span>min</span>
          <input
            type="number"
            min={0}
            step="1"
            disabled={!group.required}
            value={minPicks}
            onChange={(e) => setMinPicks(e.target.value)}
            onBlur={() => commit({ min_picks: Math.max(0, Number(minPicks) || 0) })}
            className="w-14 rounded border border-outline bg-surface-container-lowest px-xs py-[6px] text-body-md text-on-surface disabled:opacity-40"
          />
        </div>

        <div className="flex items-center gap-[2px] text-label-sm text-on-surface-variant">
          <span>max</span>
          <input
            type="number"
            min={0}
            step="1"
            value={maxPicks}
            onChange={(e) => setMaxPicks(e.target.value)}
            onBlur={() => commit({ max_picks: Math.max(0, Number(maxPicks) || 0) })}
            className="w-14 rounded border border-outline bg-surface-container-lowest px-xs py-[6px] text-body-md text-on-surface"
          />
        </div>

        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          aria-label={`Delete group ${group.name}`}
          className="touch-target ml-auto flex shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-error-container hover:text-on-error-container"
        >
          ×
        </button>
      </div>

      <SortableList
        items={group.options}
        getId={(o) => o.id}
        onReorder={(ids) => void reorderModifierOptions(ids)}
        className="flex flex-col gap-xs pl-lg"
        renderItem={(option, drag) => (
          <OptionRow option={option} dragAttributes={drag.attributes} dragListeners={drag.listeners} />
        )}
      />

      <div className="pl-lg">
        <AddOptionForm groupId={group.id} />
      </div>

      <Modal
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Delete Group"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmingDelete(false)
                void deleteModifierGroup(group.id)
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-body-md text-on-surface">
          Delete “{group.name}” and its {group.options.length} option{group.options.length === 1 ? '' : 's'}?
        </p>
      </Modal>
    </Card>
  )
}

function AddGroupForm({ productId }: { productId: string }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      await createModifierGroup(productId, { name: trimmed, required: false, min_picks: 0, max_picks: 0 })
      setName('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void handleAdd()
      }}
      className="flex gap-xs"
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New group name (e.g. Size, Add-ons)"
        aria-label="New modifier group name"
        className="flex-1"
      />
      <Button type="submit" variant="secondary" disabled={saving || !name.trim()}>
        + Group
      </Button>
    </form>
  )
}

export function ModifierGroupsEditor({ productId }: { productId: string }) {
  const groups = useLiveQuery(() => loadGroups(productId), [productId]) ?? []

  return (
    <div className="flex flex-col gap-sm">
      <h3 className="text-label-bold text-on-surface-variant">
        Modifier Groups <span className="font-normal">— pick rules and add-on pricing ({formatCurrency(0)} = no charge)</span>
      </h3>

      <SortableList
        items={groups}
        getId={(g) => g.id}
        onReorder={(ids) => void reorderModifierGroups(ids)}
        className="flex flex-col gap-sm"
        renderItem={(group, drag) => (
          <GroupCard group={group} dragAttributes={drag.attributes} dragListeners={drag.listeners} />
        )}
      />

      <AddGroupForm productId={productId} />
    </div>
  )
}
