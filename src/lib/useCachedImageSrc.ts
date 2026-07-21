import { useEffect, useState } from 'react'
import { db } from '../db'

/**
 * Resolves a Product.image_url — a Supabase Storage public URL, a `local:<uuid>`
 * pseudo-URL for a photo taken while offline and not yet uploaded, or null — into
 * a src usable by <img>. Prefers the local imageCache so photos keep rendering
 * offline; on a cache miss for a remote URL, uses it directly and caches a copy
 * in the background for next time.
 */
export function useCachedImageSrc(url: string | null): string | null {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setSrc(null)
    if (!url) return

    async function resolve() {
      const cached = await db.imageCache.get(url as string)
      if (cancelled) return
      if (cached) {
        objectUrl = URL.createObjectURL(cached.blob)
        setSrc(objectUrl)
        return
      }
      if ((url as string).startsWith('local:')) return // nothing cached yet, nothing remote to fall back to

      setSrc(url)
      try {
        const response = await fetch(url as string)
        if (!response.ok) return
        const blob = await response.blob()
        if (cancelled) return
        await db.imageCache.put({ url: url as string, blob, cached_at: new Date().toISOString() })
      } catch {
        // Offline or blocked — the direct remote src set above is the best we can do.
      }
    }

    void resolve()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url])

  return src
}
