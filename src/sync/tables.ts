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
 */
export const SYNC_TABLES: SyncTableConfig[] = [
  { name: 'categories', local: db.categories, remote: 'categories', conflictAware: false },
  { name: 'products', local: db.products, remote: 'products', conflictAware: false },
  { name: 'modifierGroups', local: db.modifierGroups, remote: 'modifier_groups', conflictAware: false },
  { name: 'modifierOptions', local: db.modifierOptions, remote: 'modifier_options', conflictAware: false },
  { name: 'users', local: db.users, remote: 'users', conflictAware: false },
  { name: 'shifts', local: db.shifts, remote: 'shifts', conflictAware: false },
  { name: 'orders', local: db.orders, remote: 'orders', conflictAware: true },
  { name: 'orderLines', local: db.orderLines, remote: 'order_lines', conflictAware: false },
  { name: 'orderLineModifiers', local: db.orderLineModifiers, remote: 'order_line_modifiers', conflictAware: false },
  { name: 'payments', local: db.payments, remote: 'payments', conflictAware: false },
  { name: 'stockAdjustments', local: db.stockAdjustments, remote: 'stock_adjustments', conflictAware: false },
  { name: 'businessSettings', local: db.businessSettings, remote: 'business_settings', conflictAware: false },
]

/** Strips the local-only sync_status field before sending a row to Supabase. */
export function stripSyncStatus<T extends { sync_status: SyncStatus }>(row: T): Omit<T, 'sync_status'> {
  const { sync_status: _sync_status, ...rest } = row
  return rest
}
