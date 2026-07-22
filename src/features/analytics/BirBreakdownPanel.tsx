import { Card } from '../../components/ui'
import { formatCurrency } from '../../lib/currency'
import type { BirBreakdown } from './analyticsData'

interface StatProps {
  label: string
  value: number
}

function Stat({ label, value }: StatProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-label-sm font-bold text-on-surface-variant">{label}</span>
      <span className="text-headline-md text-on-surface">{formatCurrency(value)}</span>
    </div>
  )
}

export function BirBreakdownPanel({ data }: { data: BirBreakdown }) {
  return (
    <Card padding="md" className="flex flex-col gap-sm">
      <h2 className="text-label-bold text-on-surface-variant">BIR Sales Breakdown</h2>

      <div className="grid grid-cols-2 gap-sm @sm:grid-cols-4">
        <Stat label="VATable Sales" value={data.vatableSales} />
        <Stat label="VAT-Exempt Sales" value={data.vatExemptSales} />
        <Stat label="Output VAT Due" value={data.outputVatDue} />
        <Stat label="Total SC/PWD Discount Granted" value={data.discountGranted} />
      </div>

      <div className="grid grid-cols-2 gap-sm border-t border-surface-dim pt-sm">
        <div className="flex flex-col gap-1">
          <span className="text-label-sm font-bold text-on-surface-variant">Senior Citizen</span>
          <span className="text-body-md text-on-surface">
            VAT-Exempt Sales: {formatCurrency(data.senior.vatExemptSales)}
          </span>
          <span className="text-body-md text-on-surface">
            Discount Granted: {formatCurrency(data.senior.discountGranted)}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-label-sm font-bold text-on-surface-variant">PWD</span>
          <span className="text-body-md text-on-surface">
            VAT-Exempt Sales: {formatCurrency(data.pwd.vatExemptSales)}
          </span>
          <span className="text-body-md text-on-surface">
            Discount Granted: {formatCurrency(data.pwd.discountGranted)}
          </span>
        </div>
      </div>
    </Card>
  )
}
