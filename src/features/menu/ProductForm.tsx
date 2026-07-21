import { useRef, useState } from 'react'
import type { Category, Product } from '../../db'
import { Button, Input, Switch } from '../../components/ui'
import { ModifierGroupsEditor } from './ModifierGroupsEditor'
import { createProduct, fileToDataUrl, updateProduct, type ProductInput } from './menuData'

export interface ProductFormProps {
  product: Product | null
  categories: Category[]
  defaultCategoryId: string | null
  onClose: () => void
  onCreated: (productId: string) => void
}

interface FormState {
  name: string
  category_id: string
  price: string
  description: string
  image_url: string | null
  active: boolean
  track_inventory: boolean
  stock_on_hand: string
  par_level: string
  reorder_point: string
  unit: string
}

function initialState(product: Product | null, defaultCategoryId: string | null): FormState {
  if (product) {
    return {
      name: product.name,
      category_id: product.category_id,
      price: String(product.price),
      description: product.description,
      image_url: product.image_url,
      active: product.active,
      track_inventory: product.track_inventory,
      stock_on_hand: String(product.stock_on_hand),
      par_level: String(product.par_level),
      reorder_point: String(product.reorder_point),
      unit: product.unit,
    }
  }
  return {
    name: '',
    category_id: defaultCategoryId ?? '',
    price: '',
    description: '',
    image_url: null,
    active: true,
    track_inventory: false,
    stock_on_hand: '0',
    par_level: '0',
    reorder_point: '0',
    unit: 'pcs',
  }
}

export function ProductForm({ product, categories, defaultCategoryId, onClose, onCreated }: ProductFormProps) {
  const [savedProductId, setSavedProductId] = useState<string | null>(product?.id ?? null)
  const [form, setForm] = useState<FormState>(() => initialState(product, defaultCategoryId))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isNew = savedProductId === null

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const dataUrl = await fileToDataUrl(file)
      update('image_url', dataUrl)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleSave() {
    setError(null)
    const name = form.name.trim()
    if (!name) {
      setError('Product name is required.')
      return
    }
    if (!form.category_id) {
      setError('Choose a category (add one from the Categories panel if none exist yet).')
      return
    }
    const price = Number(form.price)
    if (!Number.isFinite(price) || price < 0) {
      setError('Enter a valid price.')
      return
    }

    const input: ProductInput = {
      name,
      category_id: form.category_id,
      price,
      description: form.description.trim(),
      image_url: form.image_url,
      active: form.active,
      track_inventory: form.track_inventory,
      stock_on_hand: form.track_inventory ? Math.max(0, Number(form.stock_on_hand) || 0) : 0,
      par_level: form.track_inventory ? Math.max(0, Number(form.par_level) || 0) : 0,
      reorder_point: form.track_inventory ? Math.max(0, Number(form.reorder_point) || 0) : 0,
      unit: form.unit.trim() || 'pcs',
    }

    setSaving(true)
    try {
      if (savedProductId) {
        await updateProduct(savedProductId, input)
      } else {
        const newId = await createProduct(input)
        setSavedProductId(newId)
        onCreated(newId)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-md overflow-y-auto pb-lg">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onClose} className="touch-target text-label-bold text-primary">
          ← Back to list
        </button>
        <h2 className="text-headline-md text-on-surface">{isNew ? 'New Product' : form.name || product?.name}</h2>
        <span className="w-24" />
      </div>

      {error && (
        <div className="rounded-md border border-error bg-error-container px-sm py-xs text-body-md text-on-error-container">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-md md:flex-row">
        <div className="flex shrink-0 flex-col items-center gap-xs">
          <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-lg border border-surface-dim bg-surface-container">
            {form.image_url ? (
              <img src={form.image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="px-xs text-center text-label-sm text-on-surface-variant">No photo</span>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          <Button variant="secondary" size="md" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? 'Uploading…' : form.image_url ? 'Change Photo' : 'Upload Photo'}
          </Button>
          {form.image_url && (
            <button
              type="button"
              onClick={() => update('image_url', null)}
              className="text-label-sm text-on-surface-variant hover:text-error"
            >
              Remove photo
            </button>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-sm">
          <Input label="Name" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Margherita Pizza" />

          <div className="flex flex-col gap-xs">
            <label className="text-label-bold text-on-surface">Category</label>
            <select
              value={form.category_id}
              onChange={(e) => update('category_id', e.target.value)}
              className="min-h-touch rounded-md border border-outline bg-surface-container-lowest px-md text-body-md text-on-surface focus:border-2 focus:border-primary focus:outline-none"
            >
              <option value="" disabled>
                Select a category…
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Price (₱, VAT-inclusive)"
            type="number"
            step="0.01"
            min={0}
            value={form.price}
            onChange={(e) => update('price', e.target.value)}
            placeholder="0.00"
          />

          <div className="flex flex-col gap-xs">
            <label className="text-label-bold text-on-surface">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              rows={2}
              className="rounded-md border border-outline bg-surface-container-lowest px-md py-xs text-body-md text-on-surface focus:border-2 focus:border-primary focus:outline-none"
            />
          </div>

          <label className="flex items-center gap-sm">
            <Switch checked={form.active} onChange={(active) => update('active', active)} label="Active" />
            <span className="text-label-bold text-on-surface">Active (visible on Register)</span>
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-sm rounded-lg border border-surface-dim p-sm">
        <label className="flex items-center gap-sm">
          <Switch
            checked={form.track_inventory}
            onChange={(track_inventory) => update('track_inventory', track_inventory)}
            label="Track inventory"
          />
          <span className="text-label-bold text-on-surface">Track Inventory</span>
        </label>

        {form.track_inventory && (
          <div className="grid grid-cols-2 gap-sm @lg:grid-cols-4">
            <Input
              label="Stock on hand"
              type="number"
              min={0}
              value={form.stock_on_hand}
              onChange={(e) => update('stock_on_hand', e.target.value)}
            />
            <Input
              label="Par level"
              type="number"
              min={0}
              value={form.par_level}
              onChange={(e) => update('par_level', e.target.value)}
            />
            <Input
              label="Reorder point"
              type="number"
              min={0}
              value={form.reorder_point}
              onChange={(e) => update('reorder_point', e.target.value)}
            />
            <Input label="Unit" value={form.unit} onChange={(e) => update('unit', e.target.value)} placeholder="pcs" />
          </div>
        )}
      </div>

      {savedProductId ? (
        <ModifierGroupsEditor productId={savedProductId} />
      ) : (
        <p className="rounded-md border border-dashed border-outline p-sm text-body-md text-on-surface-variant">
          Save this product to add modifier groups and options.
        </p>
      )}

      <div className="sticky bottom-0 -mx-md flex justify-end gap-sm border-t border-surface-dim bg-surface px-md py-sm">
        <Button variant="secondary" onClick={onClose}>
          {isNew ? 'Cancel' : 'Close'}
        </Button>
        <Button variant="primary" disabled={saving} onClick={handleSave}>
          {saving ? 'Saving…' : isNew ? 'Save Product' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}
