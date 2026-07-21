import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { db, seedDatabase } from './db'
import { startSyncEngine } from './sync/syncEngine'

if (import.meta.env.DEV) {
  // Query seed data from the browser console, e.g. `await db.products.toArray()`
  Object.assign(window, { db })
}

seedDatabase()
  .then(() => startSyncEngine())
  .catch((err) => {
    console.error('Failed to seed database', err)
  })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
