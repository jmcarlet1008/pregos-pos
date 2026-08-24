import type { ReactNode } from 'react'

export interface SegmentedControlOption<T extends string> {
  value: T
  label: string
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
}

/**
 * Material 3's "segmented buttons" pattern: one connected, rounded-full bar with
 * internal dividers between options, instead of separate floating pill buttons —
 * replaces the old loose-pill-row filter style (see OrderManagementPage.tsx's/
 * ChannelFulfillmentFilter.tsx's git history) specifically because several such rows
 * sitting next to each other with no visual grouping read as one undifferentiated wall
 * of buttons. Pair with FilterGroup below for the caption that actually solves that.
 *
 * `overflow-x-auto` on the pill itself, not `flex-wrap`: a connected control can't wrap
 * to a second line the way loose pills could (the internal dividers/rounded ends would
 * misalign), so a control with many options (e.g. the 7-way kitchen-status filter)
 * scrolls horizontally on a narrow screen instead of wrapping or overflowing.
 */
export function SegmentedControl<T extends string>({ options, value, onChange, ariaLabel }: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex max-w-full overflow-x-auto rounded-full border border-outline"
    >
      {options.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={[
            'touch-target shrink-0 whitespace-nowrap px-md text-body-md font-body font-bold transition-colors',
            i > 0 ? 'border-l border-outline' : '',
            i === 0 ? 'rounded-l-full' : '',
            i === options.length - 1 ? 'rounded-r-full' : '',
            value === opt.value
              ? 'bg-primary text-on-primary'
              : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export interface FilterSelectProps<T extends string> {
  options: SegmentedControlOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
}

/**
 * Drop-in alternative to SegmentedControl for a filter group with too many options (or
 * options with long labels) to stay a single connected bar without scrolling — a
 * segmented control can't wrap to a second line (its dividers/rounded ends would
 * misalign), so past a certain option count/label length, scrolling inside a short
 * horizontal strip is the only thing left, and that's a genuinely weak pattern on touch
 * (easy to miss, fights with the page's own vertical scroll). A dropdown has neither
 * problem — same styling convention as src/features/order/TimeSlotStep.tsx's `<select>`,
 * so it still reads as "this app's filter control," just the compact variant.
 */
export function FilterSelect<T extends string>({ options, value, onChange, ariaLabel }: FilterSelectProps<T>) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      // max-w-[20rem], not max-w-xs: tailwind.config.ts's spacing scale shares key names
      // with the default maxWidth scale, silently breaking bare max-w-{size} classes
      // repo-wide (see that file's own comment) — arbitrary values only, always.
      className="min-h-touch w-full max-w-[20rem] rounded-md border border-outline bg-surface-container-lowest px-md text-body-md text-on-surface focus:border-2 focus:border-primary focus:outline-none"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

export interface FilterGroupProps {
  label: string
  children: ReactNode
}

/** Pairs a small caption with whatever filter control it labels (typically a
 *  SegmentedControl) — the caption is what actually separates "these options are one
 *  group" from "the next row is a different group," independent of the control's own
 *  pill-vs-segmented styling. */
export function FilterGroup({ label, children }: FilterGroupProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-label-sm font-bold uppercase tracking-wide text-on-surface-variant">{label}</span>
      {children}
    </div>
  )
}
