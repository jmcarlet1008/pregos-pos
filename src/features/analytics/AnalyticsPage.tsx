import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../../db'
import {
  addDays,
  buildDetailedSalesCsv,
  buildItemsCsv,
  buildOrdersCsv,
  computeBirBreakdown,
  computeChannelFulfillmentBreakdown,
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
  filterByChannelAndFulfillment,
  filterOrdersInRange,
  startOfDay,
  toDateInputValue,
  vatPortion,
  type ChannelFilter,
  type ChartMode,
  type FulfillmentFilter,
} from './analyticsData'
import { BirBreakdownPanel } from './BirBreakdownPanel'
import { CategoryBreakdownPanel } from './CategoryBreakdownPanel'
import { CategoryOverviewCards } from './CategoryOverviewCards'
import { ChannelFulfillmentBreakdownPanel } from './ChannelFulfillmentBreakdownPanel'
import { ChannelFulfillmentFilter } from './ChannelFulfillmentFilter'
import { DailyMetricsPanel } from './DailyMetricsPanel'
import { DateRangeFilter, type DatePreset } from './DateRangeFilter'
import { HourlySalesChart } from './HourlySalesChart'
import { ItemProfitList } from './ItemProfitList'
import { ItemSalesTable } from './ItemSalesTable'
import {
  buildMenuIndex,
  computeCancelled,
  computeHourlyActivity,
  computeItemAnalytics,
  computeItemRows,
  computeOrderMetrics,
  countSeniorPwdOrders,
  previousPeriod,
} from './itemsAnalytics'
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
  // Item/category metrics (Prompt 16.5) — read-only, see itemsAnalytics.ts.
  const categories = useLiveQuery(() => db.categories.toArray()) ?? []
  const modifierGroups = useLiveQuery(() => db.modifierGroups.toArray()) ?? []
  const voidedOrders = useLiveQuery(() => db.orders.where('status').equals('voided').toArray()) ?? []
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)

  const [view, setView] = useState<AnalyticsView>('overview')
  const [chartMode, setChartMode] = useState<ChartMode>('today')
  const [preset, setPreset] = useState<DatePreset>('today')
  const [rangeStart, setRangeStart] = useState<Date>(() => startOfDay(now))
  const [rangeEnd, setRangeEnd] = useState<Date>(() => endOfDay(now))
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all')
  const [fulfillmentFilter, setFulfillmentFilter] = useState<FulfillmentFilter>('all')

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

  const categoryFilteredOrders = filterByChannelAndFulfillment(orders, channelFilter, fulfillmentFilter)
  const filteredOrders = filterOrdersInRange(categoryFilteredOrders, rangeStart, rangeEnd)
  const filteredOrderIds = new Set(filteredOrders.map((o) => o.id))
  const filteredStats = computeStats(filteredOrders)
  const topItems = computeTopItems(filteredOrderIds, orderLines)
  const paymentSplit = computePaymentSplit(filteredOrders, payments)
  const birBreakdown = computeBirBreakdown(filteredOrders, orderLines, orderDiscounts)
  const channelFulfillmentBreakdown = computeChannelFulfillmentBreakdown(filteredOrders)
  const profitSummary = computeProfitSummary(
    filteredOrders,
    orderLines,
    orderLineModifiers,
    productCostById,
    modifierOptionCostById,
  )
  const dailyProfit = computeDailyProfit(
    categoryFilteredOrders,
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

  // ---------- Item & category metrics (new; nothing above depends on these) ----------
  const menuIndex = buildMenuIndex({ categories, products, modifierGroups, modifierOptions })
  const prevRange = previousPeriod(rangeStart, rangeEnd)
  const prevOrders = filterOrdersInRange(categoryFilteredOrders, prevRange.start, prevRange.end)
  const itemAnalytics = computeItemAnalytics(filteredOrders, orderLines, orderLineModifiers, menuIndex)
  const prevItemAnalytics = computeItemAnalytics(prevOrders, orderLines, orderLineModifiers, menuIndex)
  const prevCategoryTotals = new Map(prevItemAnalytics.categories.map((c) => [c.id, { quantity: c.quantity, sales: c.sales }]))
  const itemRows = computeItemRows(itemAnalytics)
  const orderMetrics = computeOrderMetrics(filteredOrders, orderLines)
  const prevOrderMetrics = computeOrderMetrics(prevOrders, orderLines)
  const hourlyActivity = computeHourlyActivity(filteredOrders)
  const cancelled = computeCancelled(
    filterOrdersInRange(filterByChannelAndFulfillment(voidedOrders, channelFilter, fulfillmentFilter), rangeStart, rangeEnd),
  )
  const seniorPwd = { orders: countSeniorPwdOrders(filteredOrders, orderDiscounts), discount: birBreakdown.discountGranted }
  const rangeDays = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86_400_000)
  const comparisonLabel = preset === 'today' ? 'vs yesterday' : `vs previous ${rangeDays} day${rangeDays === 1 ? '' : 's'}`

  function handleExportItems() {
    downloadCsv(`pregos-items_${toDateInputValue(rangeStart)}_to_${toDateInputValue(rangeEnd)}.csv`, buildItemsCsv(itemRows))
  }

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

      {/* The filters sit at the top because they also drive the item/category sections
          right below them; every section after those keeps its original order. */}
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

      <ChannelFulfillmentFilter
        channel={channelFilter}
        fulfillment={fulfillmentFilter}
        onChannelChange={setChannelFilter}
        onFulfillmentChange={setFulfillmentFilter}
      />

      {view === 'overview' && (
        <>
          <CategoryOverviewCards
            categories={itemAnalytics.categories}
            previousById={prevCategoryTotals}
            comparisonLabel={comparisonLabel}
            selectedId={selectedCategoryId ?? itemAnalytics.categories[0]?.id ?? null}
            onSelect={setSelectedCategoryId}
          />
          <CategoryBreakdownPanel
            categories={itemAnalytics.categories}
            selectedId={selectedCategoryId}
            onSelect={setSelectedCategoryId}
          />
          <ItemSalesTable rows={itemRows} onExport={handleExportItems} />
          <DailyMetricsPanel
            current={orderMetrics}
            previous={prevOrderMetrics}
            comparisonLabel={comparisonLabel}
            hourly={hourlyActivity}
            paymentSplit={paymentSplit}
            seniorPwd={seniorPwd}
            cancelled={cancelled}
          />
        </>
      )}

      <KpiCards data={kpiData} />

      <HourlySalesChart mode={chartMode} onModeChange={setChartMode} data={chartData} />

      {view === 'overview' && (
        <>
          <div className="grid grid-cols-1 gap-md @2xl:grid-cols-2">
            <TopItemsList items={topItems} />
            <PaymentSplitPanel split={paymentSplit} vat={vatPortion(filteredStats.grossSales)} />
          </div>

          <ChannelFulfillmentBreakdownPanel breakdown={channelFulfillmentBreakdown} totals={filteredStats} />

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
