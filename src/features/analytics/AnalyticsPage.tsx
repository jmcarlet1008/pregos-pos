import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../../db'
import {
  addDays,
  buildDetailedSalesCsv,
  buildOrdersCsv,
  computeBirBreakdown,
  computeDailyProfit,
  computeHourlyBuckets,
  computeItemProfit,
  computeKpiData,
  computePaymentSplit,
  computeProfitSummary,
  computeStats,
  computeTopItems,
  computeWeeklyBuckets,
  downloadCsv,
  endOfDay,
  filterOrdersInRange,
  startOfDay,
  toDateInputValue,
  vatPortion,
  type ChartMode,
} from './analyticsData'
import { BirBreakdownPanel } from './BirBreakdownPanel'
import { DateRangeFilter, type DatePreset } from './DateRangeFilter'
import { HourlySalesChart } from './HourlySalesChart'
import { ItemProfitList } from './ItemProfitList'
import { KpiCards } from './KpiCards'
import { PaymentSplitPanel } from './PaymentSplitPanel'
import { ProfitByDayChart } from './ProfitByDayChart'
import { ProfitSummaryCards } from './ProfitSummaryCards'
import { TopItemsList } from './TopItemsList'

type AnalyticsView = 'overview' | 'profit'
const VIEWS: { value: AnalyticsView; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'profit', label: 'Profit' },
]

export function AnalyticsPage() {
  const now = new Date()

  const orders = useLiveQuery(() => db.orders.where('status').equals('completed').toArray()) ?? []
  const orderLines = useLiveQuery(() => db.orderLines.toArray()) ?? []
  const orderDiscounts = useLiveQuery(() => db.orderDiscounts.toArray()) ?? []
  const payments = useLiveQuery(() => db.payments.toArray()) ?? []
  const users = useLiveQuery(() => db.users.toArray()) ?? []
  const products = useLiveQuery(() => db.products.toArray()) ?? []
  const productCostById = new Map(products.map((p) => [p.id, p.cost_price]))
  const orderLineModifiers = useLiveQuery(() => db.orderLineModifiers.toArray()) ?? []
  const modifierOptions = useLiveQuery(() => db.modifierOptions.toArray()) ?? []
  const modifierOptionCostById = new Map(modifierOptions.map((m) => [m.id, m.cost_adjustment]))

  const [view, setView] = useState<AnalyticsView>('overview')
  const [chartMode, setChartMode] = useState<ChartMode>('today')
  const [preset, setPreset] = useState<DatePreset>('today')
  const [rangeStart, setRangeStart] = useState<Date>(() => startOfDay(now))
  const [rangeEnd, setRangeEnd] = useState<Date>(() => endOfDay(now))

  function applyPreset(next: DatePreset) {
    setPreset(next)
    const today = new Date()
    if (next === 'today') {
      setRangeStart(startOfDay(today))
      setRangeEnd(endOfDay(today))
    } else if (next === '7d') {
      setRangeStart(startOfDay(addDays(today, -6)))
      setRangeEnd(endOfDay(today))
    } else if (next === '30d') {
      setRangeStart(startOfDay(addDays(today, -29)))
      setRangeEnd(endOfDay(today))
    }
  }

  const kpiData = computeKpiData(orders, now)
  const chartData = chartMode === 'today' ? computeHourlyBuckets(orders, now) : computeWeeklyBuckets(orders, now)

  const filteredOrders = filterOrdersInRange(orders, rangeStart, rangeEnd)
  const filteredOrderIds = new Set(filteredOrders.map((o) => o.id))
  const filteredStats = computeStats(filteredOrders)
  const topItems = computeTopItems(filteredOrderIds, orderLines)
  const paymentSplit = computePaymentSplit(filteredOrders, payments)
  const birBreakdown = computeBirBreakdown(filteredOrders, orderLines, orderDiscounts)
  const profitSummary = computeProfitSummary(
    filteredOrders,
    orderLines,
    orderLineModifiers,
    productCostById,
    modifierOptionCostById,
  )
  const dailyProfit = computeDailyProfit(
    orders,
    orderLines,
    orderLineModifiers,
    productCostById,
    modifierOptionCostById,
    rangeStart,
    rangeEnd,
  )
  const itemProfit = computeItemProfit(
    filteredOrderIds,
    orderLines,
    orderLineModifiers,
    productCostById,
    modifierOptionCostById,
  )

  function handleExport() {
    const csv = buildOrdersCsv(filteredOrders, payments, users, orderLines, orderDiscounts)
    downloadCsv(`pregos-sales_${toDateInputValue(rangeStart)}_to_${toDateInputValue(rangeEnd)}.csv`, csv)
  }

  function handleExportDetailed() {
    const csv = buildDetailedSalesCsv(
      filteredOrders,
      orderLines,
      orderLineModifiers,
      productCostById,
      modifierOptionCostById,
      users,
    )
    downloadCsv(`pregos-detailed-sales_${toDateInputValue(rangeStart)}_to_${toDateInputValue(rangeEnd)}.csv`, csv)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-md overflow-y-auto pb-md">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <h1 className="text-headline-lg text-on-surface">Analytics</h1>
        <div className="flex gap-xs" role="tablist" aria-label="Analytics view">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              role="tab"
              aria-selected={view === v.value}
              onClick={() => setView(v.value)}
              className={[
                'touch-target rounded-full px-md text-body-md font-body font-bold transition-colors',
                view === v.value
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container text-on-surface hover:bg-surface-container-high',
              ].join(' ')}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <KpiCards data={kpiData} />

      <HourlySalesChart mode={chartMode} onModeChange={setChartMode} data={chartData} />

      <DateRangeFilter
        preset={preset}
        start={rangeStart}
        end={rangeEnd}
        onPresetChange={applyPreset}
        onStartChange={(d) => {
          setPreset('custom')
          setRangeStart(startOfDay(d))
        }}
        onEndChange={(d) => {
          setPreset('custom')
          setRangeEnd(endOfDay(d))
        }}
        onExport={handleExport}
        exportDisabled={filteredOrders.length === 0}
        onExportDetailed={handleExportDetailed}
        exportDetailedDisabled={filteredOrders.length === 0}
      />

      {view === 'overview' && (
        <>
          <div className="grid grid-cols-1 gap-md @2xl:grid-cols-2">
            <TopItemsList items={topItems} />
            <PaymentSplitPanel split={paymentSplit} vat={vatPortion(filteredStats.grossSales)} />
          </div>

          <BirBreakdownPanel data={birBreakdown} />
        </>
      )}

      {view === 'profit' && (
        <>
          <ProfitSummaryCards figures={profitSummary} />
          <ProfitByDayChart data={dailyProfit} />
          <ItemProfitList items={itemProfit} />
        </>
      )}
    </div>
  )
}
