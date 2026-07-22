// ONE-TIME production reset script — Supabase side. Deleted after use.
//
// Usage:
//   node scripts/production-reset/resetSupabase.mjs precheck   (read-only: baseline row counts)
//   node scripts/production-reset/resetSupabase.mjs reset      (destructive: deletes + stock reset)
//   node scripts/production-reset/resetSupabase.mjs verify     (read-only: confirms result)

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const baselinePath = path.join(__dirname, 'baseline.json')

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '..', '.env.local')
  const text = readFileSync(envPath, 'utf8')
  const env = {}
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}

const env = loadEnvLocal()
if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
  throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from .env.local')
}
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

// Children before parents (no FK constraints in this schema, but keep the deletes logically ordered).
const WIPE_TABLES = ['payments', 'order_line_modifiers', 'order_lines', 'stock_adjustments', 'orders']
const UNTOUCHED_TABLES = ['categories', 'products', 'modifier_groups', 'modifier_options', 'users', 'business_settings']
const ALL_TABLES = [...WIPE_TABLES, ...UNTOUCHED_TABLES]

async function countRows(table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
  if (error) throw new Error(`count ${table}: ${error.message}`)
  return count
}

async function allCounts() {
  const out = {}
  for (const t of ALL_TABLES) out[t] = await countRows(t)
  return out
}

async function precheck() {
  console.log(`Target project: ${env.VITE_SUPABASE_URL}`)
  const counts = await allCounts()
  console.log('Current row counts:')
  console.table(counts)
  writeFileSync(baselinePath, JSON.stringify(counts, null, 2))
  console.log(`Baseline written to ${baselinePath}`)
}

async function reset() {
  if (!existsSync(baselinePath)) throw new Error('Run "precheck" first.')
  console.log(`Target project: ${env.VITE_SUPABASE_URL}`)

  for (const table of WIPE_TABLES) {
    const before = await countRows(table)
    const { error } = await supabase.from(table).delete().neq('id', '__reset_sentinel_never_matches__')
    if (error) throw new Error(`delete ${table}: ${error.message}`)
    const after = await countRows(table)
    console.log(`  ${table}: deleted ${before - after} rows (before=${before}, after=${after})`)
  }

  const { data: products, error: fetchErr } = await supabase.from('products').select('id, stock_on_hand, par_level')
  if (fetchErr) throw new Error(`fetch products: ${fetchErr.message}`)
  const now = new Date().toISOString()
  const toUpdate = products.filter((p) => p.stock_on_hand !== p.par_level)

  for (const p of toUpdate) {
    const { error: updateErr } = await supabase
      .from('products')
      .update({ stock_on_hand: p.par_level, updated_at: now })
      .eq('id', p.id)
    if (updateErr) throw new Error(`stock reset update (${p.id}): ${updateErr.message}`)
  }
  console.log(`  products: reset stock_on_hand -> par_level for ${toUpdate.length} of ${products.length} product(s)`)
}

async function verify() {
  if (!existsSync(baselinePath)) throw new Error('Run "precheck" first.')
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
  const counts = await allCounts()

  let ok = true
  console.log('Wiped tables (expect 0):')
  for (const t of WIPE_TABLES) {
    const pass = counts[t] === 0
    ok &&= pass
    console.log(`  ${t}: ${counts[t]} ${pass ? 'OK' : 'FAIL'}`)
  }

  console.log('Untouched tables (expect unchanged row count vs precheck baseline):')
  for (const t of UNTOUCHED_TABLES) {
    const pass = counts[t] === baseline[t]
    ok &&= pass
    console.log(`  ${t}: baseline=${baseline[t]} now=${counts[t]} ${pass ? 'OK' : 'FAIL'}`)
  }

  const { data: products, error } = await supabase.from('products').select('id, stock_on_hand, par_level')
  if (error) throw new Error(`fetch products: ${error.message}`)
  const mismatched = products.filter((p) => p.stock_on_hand !== p.par_level)
  const stockOk = mismatched.length === 0
  ok &&= stockOk
  console.log(`Products at par level: ${products.length - mismatched.length}/${products.length} ${stockOk ? 'OK' : 'FAIL'}`)
  if (!stockOk) console.log('  Mismatched:', mismatched)

  console.log(ok ? '\nVERIFY PASSED' : '\nVERIFY FAILED')
  if (!ok) process.exitCode = 1
}

const cmd = process.argv[2]
if (cmd === 'precheck') await precheck()
else if (cmd === 'reset') await reset()
else if (cmd === 'verify') await verify()
else {
  console.error('Usage: node resetSupabase.mjs <precheck|reset|verify>')
  process.exitCode = 1
}
