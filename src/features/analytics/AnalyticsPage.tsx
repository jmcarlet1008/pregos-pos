import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../../db'
import {
  addDays,
  buildOrdersCsv,
  computeBirBreakdown,
  computeHourlyBuckets,
  computeKpiData,
  computePaymentSplit,
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
import { KpiCards } from './KpiCards'
import { PaymentSplitPanel } from './PaymentSplitPanel'
import { TopItemsList } from './TopItemsList'

export function AnalyticsPage() {
  const now = new Date()

  const orders = useLiveQuery(() => db.orders.where('status').equals('completed').toArray()) ?? []
  const orderLines = useLiveQuery(() => db.orderLines.toArray()) ?? []
  const orderDiscounts = useLiveQuery(() => db.orderDiscounts.toArray()) ?? []
  const payments = useLiveQuery(() => db.payments.toArray()) ?? []
  const users = useLiveQuery(() => db.users.toArray()) ?? []

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

  function handleExport() {
    const csv = buildOrdersCsv(filteredOrders, payments, users, orderLines, orderDiscounts)
    downloadCsv(`pregos-sales_${toDateInputValue(rangeStart)}_to_${toDateInputValue(rangeEnd)}.csv`, csv)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-md overflow-y-auto pb-md">
      <h1 className="text-headline-lg text-on-surface">Analytics</h1>

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
      />

      <div className="grid grid-cols-1 gap-md @2xl:grid-cols-2">
        <TopItemsList items={topItems} />
        <PaymentSplitPanel split={paymentSplit} vat={vatPortion(filteredStats.grossSales)} />
      </div>

      <BirBreakdownPanel data={birBreakdown} />
    </div>
  )
}
