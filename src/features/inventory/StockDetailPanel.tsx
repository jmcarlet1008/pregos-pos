import { useLiveQuery } from 'dexie-react-hooks'
import type { Product } from '../../db'
import { Card } from '../../components/ui'
import { stockStatus } from '../register/registerData'
import { REASON_LABELS, loadAuditLog } from './inventoryData'
import { StockAdjustmentForm } from './StockAdjustmentForm'

function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function StockDetailPanel({ product }: { product: Product }) {
  const auditLog = useLiveQuery(() => loadAuditLog(product.id), [product.id]) ?? []
  const status = stockStatus(product)

  return (
    <div className="flex h-full min-h-0 flex-col gap-sm">
      <Card padding="md">
        <h2 className="text-headline-md text-on-surface">{product.name}</h2>
        <div className="mt-sm grid grid-cols-3 gap-sm text-center">
          <div>
            <div className="text-headline-lg text-on-surface">{product.stock_on_hand}</div>
            <div className="text-label-sm text-on-surface-variant">On Hand ({product.unit})</div>
          </div>
          <div>
            <div className="text-headline-lg text-on-surface">{product.par_level}</div>
            <div className="text-label-sm text-on-surface-variant">Par Level</div>
          </div>
          <div>
            <div className="text-headline-lg text-on-surface">{product.reorder_point}</div>
            <div className="text-label-sm text-on-surface-variant">Reorder Point</div>
          </div>
        </div>
        {status !== 'ok' && (
          <div
            className={[
              'mt-sm rounded-md px-sm py-xs text-center text-label-bold',
              status === 'out' ? 'bg-error text-on-error' : 'bg-error-container text-on-error-container',
            ].join(' ')}
          >
            {status === 'out' ? 'Out of stock' : 'Low stock — at or below reorder point'}
          </div>
        )}
      </Card>

      <Card padding="md">
        <h3 className="mb-sm text-label-bold text-on-surface-variant">Adjust Stock</h3>
        <StockAdjustmentForm product={product} />
      </Card>

      <Card padding="md" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <h3 className="mb-sm shrink-0 text-label-bold text-on-surface-variant">Audit Log</h3>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {auditLog.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">No stock activity yet.</p>
          ) : (
            <div className="flex flex-col gap-xs">
              {auditLog.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-sm border-b border-surface-dim pb-xs last:border-0"
                >
                  <div className="min-w-0">
                    <div className="text-body-md text-on-surface">
                      {REASON_LABELS[entry.reason]}
                      {entry.orderNumber != null && (
                        <span className="text-on-surface-variant"> · Order #{entry.orderNumber}</span>
                      )}
                    </div>
                    <div className="truncate text-label-sm text-on-surface-variant">
                      {formatDateTime(entry.createdAt)}
                      {entry.createdByName ? ` · ${entry.createdByName}` : ''}
                      {entry.note ? ` · ${entry.note}` : ''}
                    </div>
                  </div>
                  <span
                    className={['shrink-0 text-body-md font-bold', entry.delta > 0 ? 'text-primary' : 'text-error'].join(
                      ' ',
                    )}
                  >
                    {formatDelta(entry.delta)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
