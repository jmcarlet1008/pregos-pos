import { db } from '../db'
import { isLocalImageUrl, uploadCachedImage } from '../lib/imageStorage'

/**
 * Finds products still holding a photo taken while offline (image_url starting
 * with `local:`) and uploads it to Supabase Storage now that we're online.
 * Runs before the push phase of a sync cycle so the rewritten image_url goes out
 * in the same cycle instead of waiting for the next one.
 */
export async function processPendingImageUploads(): Promise<void> {
  const products = await db.products.filter((p) => isLocalImageUrl(p.image_url)).toArray()

  for (const product of products) {
    try {
      const publicUrl = await uploadCachedImage(product.image_url as string)
      await db.products.update(product.id, {
        image_url: publicUrl,
        updated_at: new Date().toISOString(),
        sync_status: 'pending',
      })
    } catch (err) {
      console.error(`Deferred image upload failed for product ${product.id}`, err)
    }
  }
}
