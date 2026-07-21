import type { Product } from '../../db'
import { formatCurrency } from '../../lib/currency'
import { stockStatus } from './registerData'

export interface ProductGridProps {
  products: Product[]
  onSelect: (product: Product) => void
}

function ProductTile({ product, onSelect }: { product: Product; onSelect: (product: Product) => void }) {
  const status = stockStatus(product)

  return (
    <button
      type="button"
      onClick={() => onSelect(product)}
      className="flex min-h-[120px] flex-col items-start gap-xs rounded-lg border border-surface-dim bg-surface-container-lowest p-sm text-left transition-colors hover:border-primary active:bg-surface-container"
    >
      <div className="flex w-full items-start justify-between gap-xs">
        <span className="min-w-0 text-body-md font-bold text-on-surface">{product.name}</span>
        {status === 'out' && (
          <span className="shrink-0 rounded-full bg-error px-xs py-[2px] text-label-sm font-bold text-on-error">
            Out of stock
          </span>
        )}
        {status === 'low' && (
          <span className="shrink-0 rounded-full bg-error-container px-xs py-[2px] text-label-sm font-bold text-on-error-container">
            Low stock
          </span>
        )}
      </div>
      <span className="mt-auto text-body-lg font-bold text-primary">{formatCurrency(product.price)}</span>
    </button>
  )
}

export function ProductGrid({ products, onSelect }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-body-md text-on-surface-variant">
        No products in this category.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-sm @sm:grid-cols-2 @lg:grid-cols-3 @2xl:grid-cols-4">
      {products.map((product) => (
        <ProductTile key={product.id} product={product} onSelect={onSelect} />
      ))}
    </div>
  )
}
