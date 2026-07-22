const PATTERNS: Record<'tap' | 'success' | 'warning', number | number[]> = {
  tap: 10,
  success: [10, 40, 15],
  warning: 25,
}

export type HapticPattern = keyof typeof PATTERNS

/** Fires a short vibration where the Vibration API is supported (no-op on iOS Safari). */
export function vibrate(pattern: HapticPattern = 'tap') {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  navigator.vibrate(PATTERNS[pattern])
}
