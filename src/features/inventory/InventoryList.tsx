import type { Product } from '../../db'
import { Input } from '../../components/ui'
import { stockStatus } from '../register/registerData'

export interface InventoryListProps {
  products: Product[]
  search: string
  onSearchChange: (value: string) => void
  selectedId: string | null
  onSelect: (productId: string) => void
}

function InventoryRow({
  product,
  selected,
  onSelect,
}: {
  product: Product
  selected: boolean
  onSelect: () => void
}) {
  const status = stockStatus(product)
  const pct =
    product.par_level > 0 ? Math.min(100, Math.max(0, (product.stock_on_hand / product.par_level) * 100)) : 100

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        'flex w-full flex-col gap-xs rounded-md border px-sm py-xs text-left transition-colors',
        selected
          ? 'border-primary bg-surface-container'
          : 'border-surface-dim bg-surface-container-lowest hover:bg-surface-container',
      ].join(' ')}
    >
      <div className="flex items-center gap-xs">
        <span className="min-w-0 flex-1 truncate text-body-md font-bold text-on-surface">{product.name}</span>
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
      <div className="flex items-center gap-sm">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-container-high">
          <div
            className={[
              'h-full rounded-full transition-[width]',
              status === 'out' ? 'bg-error' : status === 'low' ? 'bg-error-container' : 'bg-primary',
            ].join(' ')}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="shrink-0 text-label-sm text-on-surface-variant">
          {product.stock_on_hand} / {product.par_level} {product.unit}
        </span>
      </div>
    </button>
  )
}

export function InventoryList({ products, search, onSearchChange, selectedId, onSelect }: InventoryListProps) {
  const term = search.trim().toLowerCase()
  const filtered = term ? products.filter((p) => p.name.toLowerCase().includes(term)) : products

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-sm">
      <Input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search inventory…"
        aria-label="Search inventory"
      />
      <div className="min-h-0 flex-1 overflow-y-auto pr-xs">
        {filtered.length === 0 ? (
          <p className="mt-lg text-center text-body-md text-on-surface-variant">
            {products.length === 0 ? 'No products track inventory yet.' : 'No products match your search.'}
          </p>
        ) : (
          <div className="flex flex-col gap-xs">
            {filtered.map((product) => (
              <InventoryRow
                key={product.id}
                product={product}
                selected={product.id === selectedId}
                onSelect={() => onSelect(product.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
