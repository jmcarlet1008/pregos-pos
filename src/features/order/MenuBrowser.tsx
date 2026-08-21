import { useState } from 'react'
import type { Category, Product } from '../../db'
import { formatCurrency } from '../../lib/currency'
import { CategoryTabs } from '../register/CategoryTabs'

// Deliberately not reusing Register's ProductGrid here: it imports stockStatus from
// registerData.ts, which imports the Dexie `db` singleton as a module-level side
// effect — exactly what /order must avoid (see main.tsx's boot guard comment).
// CategoryTabs has no such import (it only takes a plain Category[] prop) and is safe
// to reuse directly.
function ProductTile({ product, onSelect }: { product: Product; onSelect: (product: Product) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(product)}
      className="flex min-h-[120px] flex-col items-start gap-xs rounded-lg border border-surface-dim bg-surface-container-lowest p-sm text-left transition-colors hover:border-primary active:bg-surface-container"
    >
      <span className="min-w-0 text-body-md font-bold text-on-surface">{product.name}</span>
      {product.description && (
        <span className="line-clamp-2 text-label-sm text-on-surface-variant">{product.description}</span>
      )}
      <span className="mt-auto text-body-lg font-bold text-primary">{formatCurrency(product.price)}</span>
    </button>
  )
}

export interface MenuBrowserProps {
  categories: Category[]
  products: Product[]
  onSelect: (product: Product) => void
}

export function MenuBrowser({ categories, products, onSelect }: MenuBrowserProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const visibleProducts = selectedCategoryId ? products.filter((p) => p.category_id === selectedCategoryId) : products

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-sm">
      <CategoryTabs categories={categories} selectedId={selectedCategoryId} onSelect={setSelectedCategoryId} />
      <div className="min-h-0 flex-1 overflow-y-auto pb-24">
        {visibleProducts.length === 0 ? (
          <p className="mt-lg text-center text-body-md text-on-surface-variant">No items in this category.</p>
        ) : (
          <div className="grid grid-cols-2 gap-sm sm:grid-cols-3">
            {visibleProducts.map((product) => (
              <ProductTile key={product.id} product={product} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
