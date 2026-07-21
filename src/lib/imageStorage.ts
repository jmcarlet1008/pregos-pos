import { db } from '../db'
import { isSupabaseConfigured, supabase } from './supabaseClient'

const BUCKET = 'product-images'
const LOCAL_PREFIX = 'local:'

function extensionFor(name: string): string {
  const match = /\.[a-zA-Z0-9]+$/.exec(name)
  return match ? match[0] : ''
}

async function cacheBlob(url: string, blob: Blob): Promise<void> {
  await db.imageCache.put({ url, blob, cached_at: new Date().toISOString() })
}

export function isLocalImageUrl(url: string | null | undefined): url is string {
  return Boolean(url && url.startsWith(LOCAL_PREFIX))
}

/**
 * Stores a chosen product photo. When online, uploads straight to Supabase Storage
 * and returns its public URL. When offline (or Supabase isn't configured yet),
 * stashes the file locally under a `local:<uuid>` pseudo-URL — the sync engine
 * uploads it for real and rewrites Product.image_url next time it runs online.
 * Either way the bytes are cached locally so the photo renders without a network
 * round trip.
 */
export async function storeProductImage(file: File): Promise<string> {
  if (navigator.onLine && isSupabaseConfigured) {
    const path = `${crypto.randomUUID()}${extensionFor(file.name)}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, file)
    if (error) throw new Error(`Photo upload failed: ${error.message}`)
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    await cacheBlob(data.publicUrl, file)
    return data.publicUrl
  }

  const localUrl = `${LOCAL_PREFIX}${crypto.randomUUID()}${extensionFor(file.name)}`
  await cacheBlob(localUrl, file)
  return localUrl
}

/** Uploads a previously-cached `local:` image for real, and returns its new public URL. */
export async function uploadCachedImage(localUrl: string): Promise<string> {
  const entry = await db.imageCache.get(localUrl)
  if (!entry) throw new Error(`No cached image found for ${localUrl}`)

  const path = crypto.randomUUID()
  const { error } = await supabase.storage.from(BUCKET).upload(path, entry.blob)
  if (error) throw new Error(`Deferred photo upload failed: ${error.message}`)

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  await cacheBlob(data.publicUrl, entry.blob)
  await db.imageCache.delete(localUrl)
  return data.publicUrl
}
