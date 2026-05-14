import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useSettingsStore } from '../stores/settingsStore'

const DRAFT_PREFIX = 'ai-ugc-lab:draft'

// Project-scoped draft key. Re-keys reactively when the active project changes
// so every consumer of usePersistedState re-hydrates from the right slot.
export function useProjectScopedKey(suffix: string): string {
  const projectId = useSettingsStore((s) => s.activeProjectId)
  return `${DRAFT_PREFIX}:${projectId ?? 'none'}:${suffix}`
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
}

// Drop-in replacement for useState that persists to localStorage under `key`.
// When `key` changes (e.g. user switches active project), the value re-hydrates
// from the new slot, falling back to `initial` when it's empty.
export function usePersistedState<T>(
  key: string,
  initial: T,
  options?: UsePersistedStateOptions<T>,
): [T, Dispatch<SetStateAction<T>>] {
  const sanitize = options?.sanitize
  const [value, setValue] = useState<T>(() => {
    const raw = readKey(key, initial)
    return sanitize ? sanitize(raw) : raw
  })

  // Track the key we last hydrated from so we can re-hydrate on key changes
  // without firing an extra write of the stale value into the new slot.
  const hydratedKey = useRef(key)

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
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Quota exceeded or serialization failure — drop silently; the in-memory
      // value is still correct for this session.
    }
  }, [key, value])

  return [value, setValue]
}
