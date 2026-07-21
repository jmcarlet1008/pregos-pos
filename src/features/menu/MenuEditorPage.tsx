import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, type Product } from '../../db'
import { CategoryPanel } from './CategoryPanel'
import { ProductList } from './ProductList'
import { ProductForm } from './ProductForm'

interface EditingSession {
  key: string
  product: Product | null
}

export function MenuEditorPage() {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [editingSession, setEditingSession] = useState<EditingSession | null>(null)

  const categories = useLiveQuery(() => db.categories.toArray()) ?? []
  const sortedCategories = [...categories].sort((a, b) => a.sort_order - b.sort_order)

  const products = useLiveQuery(() => db.products.toArray()) ?? []
  const sortedProducts = [...products].sort((a, b) => a.sort_order - b.sort_order)
  const visibleProducts = selectedCategoryId
    ? sortedProducts.filter((p) => p.category_id === selectedCategoryId)
    : sortedProducts

  function openNew() {
    setEditingSession({ key: `new-${crypto.randomUUID()}`, product: null })
  }

  function openEdit(product: Product) {
    setEditingSession({ key: product.id, product })
  }

  if (editingSession) {
    return (
      <ProductForm
        key={editingSession.key}
        product={editingSession.product}
        categories={sortedCategories}
        defaultCategoryId={selectedCategoryId ?? sortedCategories[0]?.id ?? null}
        onClose={() => setEditingSession(null)}
        onCreated={() => {}}
      />
    )
  }

  return (
    <div className="flex h-full gap-md">
      <CategoryPanel categories={sortedCategories} selectedId={selectedCategoryId} onSelect={setSelectedCategoryId} />
      <ProductList
        products={visibleProducts}
        categories={sortedCategories}
        search={search}
        onSearchChange={setSearch}
        onEdit={openEdit}
        onNew={openNew}
      />
    </div>
  )
}
