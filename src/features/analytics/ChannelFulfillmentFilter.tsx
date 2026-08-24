import { FilterGroup, SegmentedControl } from '../../components/ui'
import type { ChannelFilter, FulfillmentFilter } from './analyticsData'

// Labels dropped the "All Channels"/"All Fulfillment" repetition now that each control
// sits under its own FilterGroup caption ("Channel"/"Fulfillment") — the group label
// already says what "All" means here, and space is tighter inside a segmented control
// than it was in a loose pill row.
const CHANNEL_OPTIONS: { value: ChannelFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'in_store', label: 'Dine-in' },
  { value: 'online', label: 'Online' },
  { value: 'phone', label: 'Phone' },
]

const FULFILLMENT_OPTIONS: { value: FulfillmentFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'walk-in', label: 'Walk-in' },
  { value: 'pickup', label: 'Pickup' },
  { value: 'delivery', label: 'Delivery' },
]

interface ChannelFulfillmentFilterProps {
  channel: ChannelFilter
  fulfillment: FulfillmentFilter
  onChannelChange: (value: ChannelFilter) => void
  onFulfillmentChange: (value: FulfillmentFilter) => void
}

/** Two independent, AND-combinable segmented controls, each under its own labeled
 *  FilterGroup. Each axis defaults to 'all' (a no-op), so every downstream figure on
 *  the page is unaffected until a staff member picks one. */
export function ChannelFulfillmentFilter({
  channel,
  fulfillment,
  onChannelChange,
  onFulfillmentChange,
}: ChannelFulfillmentFilterProps) {
  return (
    <div className="flex flex-wrap items-start gap-md">
      <FilterGroup label="Channel">
        <SegmentedControl ariaLabel="Channel filter" options={CHANNEL_OPTIONS} value={channel} onChange={onChannelChange} />
      </FilterGroup>

      <FilterGroup label="Fulfillment">
        <SegmentedControl
          ariaLabel="Fulfillment filter"
          options={FULFILLMENT_OPTIONS}
          value={fulfillment}
          onChange={onFulfillmentChange}
        />
      </FilterGroup>
    </div>
  )
}
