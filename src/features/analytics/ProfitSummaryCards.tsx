import { Card } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'
import type { ProfitFigures } from './analyticsData'

export function ProfitSummaryCards({ figures }: { figures: ProfitFigures }) {
  const { sales, cost, profit, hasEstimated, hasUnknown } = figures
  const suffix = hasUnknown ? ' (partial)' : ''

  return (
    <div className="flex flex-col gap-xs">
      <div className="grid grid-cols-1 gap-sm @sm:grid-cols-3">
        <Card padding="md" className="flex flex-col gap-xs">
          <span className="text-label-bold text-on-surface-variant">Sales</span>
          <span className="text-headline-lg text-on-surface">{formatCurrency(sales)}</span>
        </Card>
        <Card padding="md" className="flex flex-col gap-xs">
          <span className="text-label-bold text-on-surface-variant">Cost{suffix}</span>
          <span className="text-headline-lg text-on-surface">{formatCurrency(cost)}</span>
        </Card>
        <Card padding="md" className="flex flex-col gap-xs">
          <span className="text-label-bold text-on-surface-variant">Profit{suffix}</span>
          <span className="text-headline-lg text-on-surface">{formatCurrency(profit)}</span>
        </Card>
      </div>

      {hasUnknown && (
        <p className="text-label-sm text-on-surface-variant">
          Some sale lines are excluded from Cost/Profit above — cost isn’t set yet for those products. Enter a
          cost in Menu Editor to include them.
        </p>
      )}
      {hasEstimated && (
        <p className="text-label-sm text-on-surface-variant">
          Figures marked as estimates use each product’s <em>current</em> cost for sales made before cost tracking
          started — treat as an estimate, not an exact historical cost.
        </p>
      )}
    </div>
  )
}
