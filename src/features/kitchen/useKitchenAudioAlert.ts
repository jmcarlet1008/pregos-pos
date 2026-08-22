import { useCallback, useRef, useState } from 'react'

export interface KitchenAudioAlert {
  unlocked: boolean
  /** Idempotent — safe to call from any onPointerDown, including one that also fires a button's own onClick. */
  requestUnlock: () => void
  /** No-throw. If audio isn't unlocked yet, queues one chime to play retroactively the moment it is. */
  playChime: () => void
}

/**
 * Web Audio API only — no external asset/service, per the request. /kitchen has no
 * login step to piggyback a user gesture off of (unlike the staff app's PIN pad), and
 * browsers block audio playback before one, so this exposes requestUnlock for the page
 * root's onPointerDown: the very first tap anywhere (including on a card's own "Mark
 * Ready" button, since pointerdown fires before that button's click handler) unlocks it.
 * Deliberately doesn't persist "already unlocked" via localStorage across reloads — a
 * fresh AudioContext needs its own gesture regardless of what a prior page load did.
 */
export function useKitchenAudioAlert(): KitchenAudioAlert {
  const ctxRef = useRef<AudioContext | null>(null)
  const pendingRef = useRef(false)
  const [unlocked, setUnlocked] = useState(false)

  const playTone = useCallback((ctx: AudioContext, frequency: number, startTime: number, duration: number) => {
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    // Gain envelope avoids an audible click at the start/end of the tone.
    gain.gain.setValueAtTime(0, startTime)
    gain.gain.linearRampToValueAtTime(0.35, startTime + 0.015)
    gain.gain.linearRampToValueAtTime(0, startTime + duration)
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start(startTime)
    oscillator.stop(startTime + duration)
  }, [])

  const playChime = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx) {
      pendingRef.current = true
      return
    }
    const now = ctx.currentTime
    playTone(ctx, 880, now, 0.15) // A5
    playTone(ctx, 1046.5, now + 0.16, 0.18) // C6 — a short two-note "new order" chime
  }, [playTone])

  const requestUnlock = useCallback(() => {
    if (ctxRef.current) return
    if (typeof AudioContext === 'undefined') return // unsupported browser — fail silently, no sound rather than a crash
    const ctx = new AudioContext()
    ctxRef.current = ctx
    void ctx.resume()
    setUnlocked(true)
    if (pendingRef.current) {
      pendingRef.current = false
      playChime()
    }
  }, [playChime])

  return { unlocked, requestUnlock, playChime }
}
