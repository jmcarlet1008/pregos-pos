import { Card } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'
import { SLOW_MOVER_MAX_QTY, type CategorySummary, type VariantCount } from './itemsAnalytics'

function pct(part: number, whole: number): string {
  return `${whole ? ((part / whole) * 100).toFixed(1) : '0.0'}%`
}

function variantSplit(variants: VariantCount[]): string {
  return variants.map((v) => `${v.name} ${v.quantity}`).join(' · ')
}

interface CategoryBreakdownPanelProps {
  categories: CategorySummary[]
  selectedId: string | null
  onSelect: (categoryId: string) => void
}

/**
 * Details for one category (picked from the chips here or the overview cards above):
 * its size/version split (only when the category has such a group in the menu — the
 * parts always add up to the category total, with unrecorded sizes shown as such),
 * the ranked items with each one's size split, and the slow movers.
 */
export function CategoryBreakdownPanel({ categories, selectedId, onSelect }: CategoryBreakdownPanelProps) {
  const category = categories.find((c) => c.id === selectedId) ?? categories[0]
  if (!category) return null

  return (
    <Card padding="md" className="flex flex-col gap-md">
      <div className="flex flex-wrap gap-xs" role="tablist" aria-label="Category">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={c.id === category.id}
            onClick={() => onSelect(c.id)}
            className={[
              'touch-target rounded-full px-md text-body-md font-body font-bold transition-colors',
              c.id === category.id
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container text-on-surface hover:bg-surface-container-high',
            ].join(' ')}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <h2 className="text-headline-md text-on-surface">{category.name}</h2>
        <span className="text-body-md text-on-surface-variant">
          {category.quantity.toLocaleString('en-PH')} sold · {formatCurrency(category.sales)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-md lg:grid-cols-2">
        {category.dimension && (
          <section className="flex flex-col gap-sm">
            <h3 className="text-label-bold text-on-surface-variant">{category.dimension} breakdown</h3>
            {category.variants.length === 0 ? (
              <p className="text-body-md text-on-surface-variant">No sales in this range.</p>
            ) : (
              <ul className="flex flex-col gap-sm">
                {category.variants.map((v) => (
                  <li key={v.name} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-sm">
                      <span className={['text-body-md font-bold', v.notRecorded ? 'italic text-on-surface-variant' : 'text-on-surface'].join(' ')}>
                        {v.name}
                      </span>
                      <span className="shrink-0 text-body-md text-on-surface">
                        {v.quantity} <span className="text-on-surface-variant">({pct(v.quantity, category.quantity)})</span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
                      <div
                        className={['h-full rounded-full', v.notRecorded ? 'bg-outline' : 'bg-primary'].join(' ')}
                        style={{ width: pct(v.quantity, category.quantity) }}
                      />
                    </div>
                  </li>
                ))}
                <li className="flex justify-between border-t border-dashed border-surface-dim pt-xs text-label-bold text-on-surface">
                  <span>Total {category.name}</span>
                  <span>{category.quantity}</span>
                </li>
              </ul>
            )}
          </section>
        )}

        <section className="flex flex-col gap-sm">
          <h3 className="text-label-bold text-on-surface-variant">Top performing</h3>
          {category.items.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">No sales in this range.</p>
          ) : (
            <ol className="flex flex-col gap-xs">
              {category.items.map((item, index) => (
                <li
                  key={item.productId}
                  className={[
                    'flex items-start gap-sm rounded-md px-sm py-xs',
                    index === 0 ? 'border-2 border-primary bg-surface-container' : '',
                  ].join(' ')}
                >
                  <span className={['w-6 shrink-0 text-label-bold', index === 0 ? 'text-primary' : 'text-on-surface-variant'].join(' ')}>
                    {index === 0 ? '★' : index + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body-md font-bold text-on-surface">{item.name}</span>
                    {item.variants.length > 0 && (
                      <span className="text-label-sm text-on-surface-variant">{variantSplit(item.variants)}</span>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end">
                    <span className="text-body-md font-bold text-on-surface">
                      {item.quantity} <span className="font-normal text-on-surface-variant">({item.shareOfCategory.toFixed(1)}%)</span>
                    </span>
                    <span className="text-label-sm text-on-surface-variant">{formatCurrency(item.sales)}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="flex flex-col gap-xs">
        <h3 className="text-label-bold text-on-surface-variant">
          Slow movers <span className="font-normal">(on the menu, {SLOW_MOVER_MAX_QTY} or fewer sold)</span>
        </h3>
        {category.slowMovers.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">None — every item sold more than {SLOW_MOVER_MAX_QTY}.</p>
        ) : (
          <ul className="flex flex-wrap gap-xs">
            {category.slowMovers.map((s) => (
              <li key={s.productId} className="rounded-full bg-surface-container px-sm py-xs text-body-md text-on-surface">
                {s.name} <span className="text-on-surface-variant">· {s.quantity} sold</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Card>
  )
}
