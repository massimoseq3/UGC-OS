import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

const DRAFT_PREFIX = 'ai-ugc-lab:draft'

// Stable draft key. Previously project-scoped; projects have been removed so
// every app shares a single slot per (app, field) tuple.
export function useProjectScopedKey(suffix: string): string {
  return `${DRAFT_PREFIX}:${suffix}`
}

function readKey<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

interface UsePersistedStateOptions<T> {
  // Runs on every hydration (initial mount + key change). Use to reset
  // transient flags inside the persisted payload (e.g. clearing
  // `isGenerating` so a refresh mid-job doesn't leave a stuck spinner).
  sanitize?: (value: T) => T
  // Runs on every write, transforming what hits localStorage without
  // touching the in-memory value. Use to drop payloads too large for the
  // quota (e.g. uploaded audio/video data URIs) — they survive the session
  // but not a refresh.
  prune?: (value: T) => T
}

// Drop-in replacement for useState that persists to localStorage under `key`.
// When `key` changes, the value re-hydrates from the new slot, falling back
// to `initial` when it's empty.
// Coalesce a burst of writes into one serialize + localStorage.setItem using
// requestIdleCallback (with a timeout fallback). Callers that bind this to a
// text input would otherwise stringify the whole payload on every keystroke.
function scheduleIdle(cb: () => void): void {
  const ric = (window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void
  }).requestIdleCallback
  if (ric) ric(cb, { timeout: 500 })
  else setTimeout(cb, 250)
}

export function usePersistedState<T>(
  key: string,
  initial: T,
  options?: UsePersistedStateOptions<T>,
): [T, Dispatch<SetStateAction<T>>] {
  const sanitize = options?.sanitize
  const prune = options?.prune
  const [value, setValue] = useState<T>(() => {
    const raw = readKey(key, initial)
    return sanitize ? sanitize(raw) : raw
  })

  // Track the key we last hydrated from so we can re-hydrate on key changes
  // without firing an extra write of the stale value into the new slot.
  const hydratedKey = useRef(key)

  // Latest (key, value, prune) to persist, held in a ref so the debounced,
  // unmount, and tab-teardown flushes all write the current value rather than
  // a stale closure capture.
  const pending = useRef<{ key: string; value: T; prune?: (v: T) => T } | null>(null)
  const scheduled = useRef(false)
  const flush = useRef(() => {
    const p = pending.current
    if (!p) return
    pending.current = null
    scheduled.current = false
    try {
      localStorage.setItem(p.key, JSON.stringify(p.prune ? p.prune(p.value) : p.value))
    } catch {
      // Quota exceeded or serialization failure — drop silently; the in-memory
      // value is still correct for this session.
    }
  })

  useEffect(() => {
    if (hydratedKey.current === key) return
    hydratedKey.current = key
    const raw = readKey(key, initial)
    setValue(sanitize ? sanitize(raw) : raw)
    // `initial` and `sanitize` are intentionally excluded — callers pass
    // fresh literals/refs on every render and we only want to react to key
    // changes here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    if (hydratedKey.current !== key) return
    pending.current = { key, value, prune }
    if (scheduled.current) return
    scheduled.current = true
    scheduleIdle(() => flush.current())
    // `prune` is intentionally excluded — callers pass fresh closures on
    // every render and we only want to react to value/key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value])

  // Flush the last pending write on unmount and on tab teardown so a refresh
  // within the debounce window doesn't lose the final keystrokes.
  useEffect(() => {
    const runFlush = () => flush.current()
    window.addEventListener('beforeunload', runFlush)
    window.addEventListener('pagehide', runFlush)
    return () => {
      window.removeEventListener('beforeunload', runFlush)
      window.removeEventListener('pagehide', runFlush)
      runFlush()
    }
  }, [])

  return [value, setValue]
}
