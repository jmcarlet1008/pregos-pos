import type { ReactNode } from 'react'
import { useCachedImageSrc } from '../../lib/useCachedImageSrc'

export interface CachedImageProps {
  url: string | null
  alt: string
  className?: string
  fallback?: ReactNode
}

/** Renders a product photo via useCachedImageSrc, so it works offline once cached. */
export function CachedImage({ url, alt, className, fallback = null }: CachedImageProps) {
  const src = useCachedImageSrc(url)
  if (!src) return <>{fallback}</>
  return <img src={src} alt={alt} className={className} />
}
