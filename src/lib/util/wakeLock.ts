/**
 * Requests a screen wake lock for the duration of a transfer. Both sending
 * (a dimmed sender screen is unreadable) and receiving (a dimmed/locked
 * phone stops the camera feed entirely) can run for minutes with no touch
 * input, which is exactly when mobile OSes dim or sleep the display.
 * Silently no-ops where the API isn't supported (older Safari) or the
 * request is refused (e.g. tab not visible) — this is a best-effort
 * optimization, not something a transfer should fail over.
 */
export interface WakeLockHandle {
  release(): void
}

export async function acquireWakeLock(): Promise<WakeLockHandle> {
  let sentinel: WakeLockSentinel | null = null

  const request = async () => {
    if (!('wakeLock' in navigator)) return
    try {
      sentinel = await navigator.wakeLock.request('screen')
    } catch {
      // e.g. NotAllowedError when the document isn't visible — harmless
    }
  }

  await request()

  // iOS/Safari release the lock whenever the tab is backgrounded even
  // briefly; re-acquire it once the page becomes visible again.
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible' && !sentinel) void request()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  return {
    release() {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      sentinel?.release().catch(() => {})
      sentinel = null
    },
  }
}
