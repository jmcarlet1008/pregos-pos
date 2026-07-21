import { useState } from 'react'
import type { Category, Product } from '../../db'
import {
  Button,
  DragHandleIcon,
  Input,
  Modal,
  SortableList,
  Switch,
  type DragHandleProps,
} from '../../components/ui'
import { formatCurrency } from '../../lib/currency'
import { stockStatus } from '../register/registerData'
import { deleteProduct, reorderProducts, setProductActive } from './menuData'

export interface ProductListProps {
  products: Product[]
  categories: Category[]
  search: string
  onSearchChange: (value: string) => void
  onEdit: (product: Product) => void
  onNew: () => void
}

function ProductRow({
  product,
  categoryName,
  dragAttributes,
  dragListeners,
  onEdit,
}: {
  product: Product
  categoryName: string
  dragAttributes?: DragHandleProps['attributes']
  dragListeners?: DragHandleProps['listeners']
  onEdit: () => void
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const status = stockStatus(product)

  return (
    <div className="flex items-center gap-sm rounded-md border border-surface-dim bg-surface-container-lowest px-sm py-xs">
      {dragAttributes ? (
        <button
          type="button"
          {...dragAttributes}
          {...dragListeners}
          aria-label="Drag to reorder"
          className="touch-target flex shrink-0 cursor-grab items-center justify-center text-on-surface-variant active:cursor-grabbing"
        >
          <DragHandleIcon />
        </button>
      ) : (
        <span className="touch-target shrink-0" aria-hidden="true" />
      )}

      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-container">
        {product.image_url ? (
          <img src={product.image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-label-sm text-on-surface-variant">No photo</span>
        )}
      </div>

      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-xs">
          <span className="truncate text-body-md font-bold text-on-surface">{product.name}</span>
          {!product.active && (
            <span className="shrink-0 rounded-full bg-surface-container-high px-xs py-[1px] text-label-sm text-on-surface-variant">
              Inactive
            </span>
          )}
          {status === 'out' && (
            <span className="shrink-0 rounded-full bg-error px-xs py-[1px] text-label-sm font-bold text-on-error">
              Out of stock
            </span>
          )}
          {status === 'low' && (
            <span className="shrink-0 rounded-full bg-error-container px-xs py-[1px] text-label-sm font-bold text-on-error-container">
              Low stock
            </span>
          )}
        </div>
        <div className="text-label-sm text-on-surface-variant">{categoryName}</div>
      </button>

      <span className="shrink-0 text-body-md font-bold text-primary">{formatCurrency(product.price)}</span>

      <Switch
        checked={product.active}
        onChange={(active) => void setProductActive(product.id, active)}
        label={`${product.name} active`}
      />

      <button
        type="button"
        onClick={() => setConfirmingDelete(true)}
        aria-label={`Delete ${product.name}`}
        className="touch-target flex shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-error-container hover:text-on-error-container"
      >
        ×
      </button>

      <Modal
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Delete Product"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmingDelete(false)
                void deleteProduct(product.id)
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-body-md text-on-surface">Delete “{product.name}”? This can’t be undone.</p>
      </Modal>
    </div>
  )
}

export function ProductList({ products, categories, search, onSearchChange, onEdit, onNew }: ProductListProps) {
  const categoryName = (categoryId: string) => categories.find((c) => c.id === categoryId)?.name ?? '—'
  const searchActive = search.trim().length > 0
  const filtered = searchActive
    ? products.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    : products

  function handleReorder(orderedIds: string[]) {
    void reorderProducts(products, orderedIds)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-sm">
      <div className="flex gap-sm">
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search products…"
          aria-label="Search products"
          className="flex-1"
        />
        <Button variant="primary" onClick={onNew}>
          + New Product
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-xs">
        {filtered.length === 0 ? (
          <p className="mt-lg text-center text-body-md text-on-surface-variant">No products found.</p>
        ) : searchActive ? (
          <div className="flex flex-col gap-xs">
            {filtered.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                categoryName={categoryName(product.category_id)}
                onEdit={() => onEdit(product)}
              />
            ))}
          </div>
        ) : (
          <SortableList
            items={filtered}
            getId={(p) => p.id}
            onReorder={handleReorder}
            className="flex flex-col gap-xs"
            renderItem={(product, drag) => (
              <ProductRow
                product={product}
                categoryName={categoryName(product.category_id)}
                dragAttributes={drag.attributes}
                dragListeners={drag.listeners}
                onEdit={() => onEdit(product)}
              />
            )}
          />
        )}
      </div>
    </div>
  )
}
