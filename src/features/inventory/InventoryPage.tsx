import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../../db'
import { Card } from '../../components/ui'
import { InventoryList } from './InventoryList'
import { StockDetailPanel } from './StockDetailPanel'

export function InventoryPage() {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const products = useLiveQuery(() => db.products.toArray()) ?? []
  const tracked = products.filter((p) => p.track_inventory).sort((a, b) => a.name.localeCompare(b.name))

  const selectedProduct = tracked.find((p) => p.id === selectedId) ?? null

  return (
    <div className="flex h-full gap-md">
      <InventoryList
        products={tracked}
        search={search}
        onSearchChange={setSearch}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <div className="min-h-0 w-[380px] shrink-0">
        {selectedProduct ? (
          <StockDetailPanel product={selectedProduct} />
        ) : (
          <Card padding="md" className="flex h-full items-center justify-center text-center">
            <p className="text-body-md text-on-surface-variant">Select a product to view stock details.</p>
          </Card>
        )}
      </div>
    </div>
  )
}
