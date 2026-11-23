import { formatCurrency } from '../../lib/currency'
import type { CategorySummary } from './itemsAnalytics'
import { PeriodDelta } from './PeriodDelta'

/** How many categories (in Menu order) get a big card; the rest get compact ones. */
const MAIN_CARD_COUNT = 4

interface CategoryOverviewCardsProps {
  categories: CategorySummary[]
  previousById: Map<string, { quantity: number; sales: number }>
  comparisonLabel: string
  selectedId: string | null
  onSelect: (categoryId: string) => void
}

/**
 * One card per menu category: TOTAL quantity sold (line quantities, not orders), its
 * sales, and the change vs the previous equal period. Order and names come from the
 * Menu editor's categories — nothing here is hardcoded. Tapping a card opens that
 * category in the breakdown below.
 */
export function CategoryOverviewCards({ categories, previousById, comparisonLabel, selectedId, onSelect }: CategoryOverviewCardsProps) {
  const main = categories.slice(0, MAIN_CARD_COUNT)
  const rest = categories.slice(MAIN_CARD_COUNT)

  function card(category: CategorySummary, compact: boolean) {
    const previous = previousById.get(category.id) ?? { quantity: 0, sales: 0 }
    const selected = category.id === selectedId
    return (
      <button
        key={category.id}
        type="button"
        onClick={() => onSelect(category.id)}
        aria-pressed={selected}
        className={[
          'flex min-h-touch flex-col gap-xs rounded-lg border bg-surface-container-lowest text-left transition-colors hover:bg-surface-container',
          compact ? 'p-sm' : 'p-md',
          selected ? 'border-2 border-primary' : 'border-surface-dim',
        ].join(' ')}
      >
        <span className="text-label-bold uppercase tracking-wide text-on-surface-variant">Total {category.name}</span>
        <span className={compact ? 'text-headline-md text-on-surface' : 'text-headline-lg text-on-surface'}>
          {category.quantity.toLocaleString('en-PH')}
        </span>
        <span className="text-body-md text-on-surface-variant">{formatCurrency(category.sales)}</span>
        <PeriodDelta current={category.quantity} previous={previous.quantity} label={comparisonLabel} />
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-sm">
      <div className="grid grid-cols-2 gap-sm lg:grid-cols-4">{main.map((c) => card(c, false))}</div>
      {rest.length > 0 && (
        <div className="grid grid-cols-2 gap-sm sm:grid-cols-3 lg:grid-cols-6">{rest.map((c) => card(c, true))}</div>
      )}
    </div>
  )
}
