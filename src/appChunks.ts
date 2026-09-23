import type { ComponentType } from 'react'

// Every app is its own chunk, and this is the one place those imports are
// written — so the pane that renders an app (App.tsx), the dock tile a member
// is about to press and the idle warm-up below all share ONE promise per app.
//
// Before this, a chunk was requested only when its pane first rendered, which
// put a network round trip between every first press of a dock tile and the
// app appearing — the icon placeholder sat there for as long as B-Roll's
// ~400 KB took to arrive. And the landing app queued behind auth and the cloud
// hydrate, because the workspace doesn't render until both are done.
const LOADERS: Record<string, () => Promise<{ default: ComponentType }>> = {
  'finder': () => import('./apps/finder/Finder'),
  'ad-anatomy': () => import('./apps/ad-anatomy/AdAnatomy'),
  'script-architect': () => import('./apps/script-architect/ScriptArchitect'),
  'character-studio': () => import('./apps/character-studio/CharacterStudio'),
  'voice-studio': () => import('./apps/voice-studio/VoiceStudio'),
  'broll-studio': () => import('./apps/broll-studio/BrollStudio'),
  'playground': () => import('./apps/playground/Playground'),
  'discover': () => import('./apps/discover/Discover'),
  'edit-studio': () => import('./apps/edit-studio/EditStudio'),
  'dashboard': () => import('./apps/dashboard/Dashboard'),
  'admin': () => import('./apps/admin/AdminPanel'),
}

// ONE promise per app, and it carries the fields React's `use()` reads off a
// thenable. Stamping them ourselves when the chunk lands is what lets a WARMED
// app render synchronously: `use()` sees `fulfilled` and returns the component
// on the spot, where an untagged promise would suspend for a frame and flash
// the pane's placeholder even though the code was already in memory.
const loads = new Map<string, Promise<ComponentType>>()

export function hasApp(appId: string): boolean {
  return appId in LOADERS
}

/** The app's component, as ONE cached promise per app — safe to hand to `use()`. */
export function loadApp(appId: string): Promise<ComponentType> {
  const cached = loads.get(appId)
  if (cached) return cached
  const loader = LOADERS[appId]
  const load = loader
    ? loader().then((m) => m.default)
    : Promise.reject(new Error(`Unknown app: ${appId}`))
  load.then(
    (value) => { Object.assign(load, { status: 'fulfilled', value }) },
    (reason) => {
      Object.assign(load, { status: 'rejected', reason })
      // Forgotten, so the next ask fetches again instead of replaying the
      // failure — a warm-up that hit a flaky connection must not poison the
      // press that comes after it.
      loads.delete(appId)
    },
  )
  loads.set(appId, load)
  return load
}

/** Fetch an app's chunk ahead of its first open. Failures are swallowed: the pane reports its own. */
export function preloadApp(appId: string): void {
  if (!hasApp(appId)) return
  loadApp(appId).catch(() => {})
}

// The shell's overlays that open from anywhere. Between them — Settings
// carries the demo-data seeder, ~45 KB on its own — they were ~130 KB of the
// startup bundle for screens a member opens now and then. Rendered through
// components/LazyOverlays.tsx.
export const loadSettingsModal = () => import('./components/SettingsModal')
export const loadApiKeyGuide = () => import('./components/ApiKeyGuide')
export const loadMeetTheTeam = () => import('./components/MeetTheTeam')

// Long enough that the landing app has painted and settled before anything
// else competes with it for the network or the main thread.
const WARM_START_DELAY_MS = 2_500

/**
 * Run each loader in the background, one at a time and only while the page is
 * idle, so a member's first press of a dock tile finds the code already here.
 * Skipped when the browser says data is precious (Save-Data, or a 2G link) —
 * the dock tile's hover intent still warms the one being reached for. Returns
 * a cancel.
 */
export function warmChunks(loaders: Array<() => Promise<unknown>>): () => void {
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string }
  }).connection
  if (connection?.saveData || /2g/.test(connection?.effectiveType ?? '')) return () => {}

  const queue = [...loaders]
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let idle: number | undefined

  // Safari has no requestIdleCallback; a short timeout is the usual stand-in.
  const whenIdle = (fn: () => void) => {
    if (typeof window.requestIdleCallback === 'function') {
      idle = window.requestIdleCallback(fn, { timeout: 10_000 })
    } else {
      timer = setTimeout(fn, 300)
    }
  }

  const next = () => {
    if (cancelled) return
    const load = queue.shift()
    if (!load) return
    // One at a time: each lands before the next is asked for, so the warm-up
    // never holds more than one chunk's worth of bandwidth or parse at once.
    // A loader that's already settled (the app the member is in) returns its
    // cached promise and costs nothing.
    load().then(
      () => whenIdle(next),
      () => whenIdle(next),
    )
  }

  timer = setTimeout(() => whenIdle(next), WARM_START_DELAY_MS)
  return () => {
    cancelled = true
    if (timer !== undefined) clearTimeout(timer)
    if (idle !== undefined && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle)
  }
}
