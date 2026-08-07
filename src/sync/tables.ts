import { db, type SyncStatus } from '../db'
import type { Table } from 'dexie'

export interface SyncTableConfig {
  /** Dexie table name, used only for logging. */
  name: string
  local: Table<any, string>
  /** Supabase table name. */
  remote: string
  /**
   * Orders get "never silently drop a sale" handling: a remote row that changed
   * since our last pull is logged to sync_conflicts instead of being overwritten
   * either direction. Every other table uses plain last-write-wins.
   */
  conflictAware: boolean
}

/**
 * Push order matters: parents must exist server-side before children reference
 * them (there are no FK constraints — see migration notes — but pushing in this
 * order keeps a normal, non-retried cycle logically consistent).
 *
 * conflictAware is true for catalog/config tables (categories, products, modifier
 * groups/options, users, businessSettings) for the same reason it's true for
 * orders: a plain last-write-wins push blindly trusts whichever device's clock
 * produced the newer `updated_at`. A device that just seeded its empty local
 * database (e.g. a fresh login on a second iPad — see main.tsx's pre-seed pull,
 * which is the primary defense) would otherwise win that comparison and silently
 * overwrite real edits in Supabase. Conflict-aware tables log a sync_conflicts
 * row instead of guessing, so this class of data loss surfaces for a manager to
 * resolve rather than disappearing. Line-item child tables (orderLines,
 * orderLineModifiers, orderDiscounts, payments, stockAdjustments) and shifts stay
 * last-write-wins: they're never independently edited on two devices at once, so
 * conflicts there aren't a realistic risk worth the extra review step.
 */
export const SYNC_TABLES: SyncTableConfig[] = [
  { name: 'categories', local: db.categories, remote: 'categories', conflictAware: true },
  { name: 'products', local: db.products, remote: 'products', conflictAware: true },
  { name: 'modifierGroups', local: db.modifierGroups, remote: 'modifier_groups', conflictAware: true },
  { name: 'modifierOptions', local: db.modifierOptions, remote: 'modifier_options', conflictAware: true },
  { name: 'users', local: db.users, remote: 'users', conflictAware: true },
  { name: 'shifts', local: db.shifts, remote: 'shifts', conflictAware: false },
  { name: 'orders', local: db.orders, remote: 'orders', conflictAware: true },
  { name: 'orderDiscounts', local: db.orderDiscounts, remote: 'order_discounts', conflictAware: false },
  { name: 'orderLines', local: db.orderLines, remote: 'order_lines', conflictAware: false },
  { name: 'orderLineModifiers', local: db.orderLineModifiers, remote: 'order_line_modifiers', conflictAware: false },
  { name: 'payments', local: db.payments, remote: 'payments', conflictAware: false },
  { name: 'stockAdjustments', local: db.stockAdjustments, remote: 'stock_adjustments', conflictAware: false },
  { name: 'businessSettings', local: db.businessSettings, remote: 'business_settings', conflictAware: true },
]

/** Strips the local-only sync_status field before sending a row to Supabase. */
export function stripSyncStatus<T extends { sync_status: SyncStatus }>(row: T): Omit<T, 'sync_status'> {
  const { sync_status: _sync_status, ...rest } = row
  return rest
}
