import { useState } from 'react'
import { Button, Card, FilterSelect } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'
import type { ItemRow } from './itemsAnalytics'

type SortKey = 'item' | 'category' | 'variant' | 'quantity' | 'sales' | 'shareOfTotal'

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'item', label: 'Item', numeric: false },
  { key: 'category', label: 'Category', numeric: false },
  { key: 'variant', label: 'Size / Variant', numeric: false },
  { key: 'quantity', label: 'Qty Sold', numeric: true },
  { key: 'sales', label: 'Gross Sales', numeric: true },
  { key: 'shareOfTotal', label: '% of Qty', numeric: true },
]

const ALL = '__all__'

interface ItemSalesTableProps {
  rows: ItemRow[]
  onExport: () => void
}

/** Every item × size/version sold in the range. Tap a column header to sort (again to flip). */
export function ItemSalesTable({ rows, onExport }: ItemSalesTableProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL)
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'quantity', desc: true })

  const categoryNames = [...new Set(rows.map((r) => r.category))]
  const visible = rows
    .filter((r) => categoryFilter === ALL || r.category === categoryFilter)
    .slice()
    .sort((a, b) => {
      const av = a[sort.key] ?? ''
      const bv = b[sort.key] ?? ''
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return sort.desc ? -cmp : cmp
    })

  function toggleSort(key: SortKey, numeric: boolean) {
    setSort((prev) => (prev.key === key ? { key, desc: !prev.desc } : { key, desc: numeric }))
  }

  return (
    <Card padding="md" className="flex flex-col gap-sm">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <h2 className="text-label-bold text-on-surface-variant">All items sold</h2>
        <div className="flex flex-wrap items-center justify-end gap-sm">
          <div className="w-[14rem]">
            <FilterSelect
            ariaLabel="Filter by category"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[{ value: ALL, label: 'All categories' }, ...categoryNames.map((name) => ({ value: name, label: name }))]}
            />
          </div>
          <Button variant="secondary" onClick={onExport} disabled={rows.length === 0}>
            Export items CSV
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-md text-center text-body-md text-on-surface-variant">No sales in this range.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-body-md">
            <thead className="bg-surface-container text-label-bold text-on-surface-variant">
              <tr>
                {COLUMNS.map((col) => (
                  <th key={col.key} className={['px-sm py-xs', col.numeric ? 'text-right' : ''].join(' ')}>
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key, col.numeric)}
                      className="touch-target inline-flex items-center gap-1 font-bold"
                    >
                      {col.label}
                      {sort.key === col.key && <span aria-hidden="true">{sort.desc ? '▼' : '▲'}</span>}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={`${r.category}|${r.item}|${r.variant ?? ''}`} className="border-b border-surface-dim">
                  <td className="px-sm py-xs font-bold text-on-surface">{r.item}</td>
                  <td className="px-sm py-xs text-on-surface-variant">{r.category}</td>
                  <td className="px-sm py-xs text-on-surface-variant">{r.variant ?? '—'}</td>
                  <td className="px-sm py-xs text-right text-on-surface">{r.quantity}</td>
                  <td className="px-sm py-xs text-right text-on-surface">{formatCurrency(r.sales)}</td>
                  <td className="px-sm py-xs text-right text-on-surface-variant">{r.shareOfTotal.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
