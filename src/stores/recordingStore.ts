import { create } from 'zustand'
import { useAuthStore } from './authStore'

// Recording Mode — the operator's tutorial rig. The ads are made first, for
// real; the tutorial is then filmed as if they were being made from scratch.
//
// Three pieces, all display-only. Nothing here reaches kie.ai, a bank, the
// cloud or the usage ledger:
//
//   * HIDE — `hiddenBefore` is a timestamp. Every history row created at or
//     before it disappears from its list, so each app opens as a fresh
//     workspace. A row stays hidden until a replay reveals it.
//   * REPLAY — with the mode on, a Generate press spends nothing: the app shows
//     its own in-flight face for `replaySeconds` and then reveals the OLDEST
//     hidden row of that app. Oldest first, so re-performing the session in the
//     order it was made brings the outputs back in that order.
//   * LOOP — every generation surface shows its in-flight face until switched
//     off, for cutaway footage.
//
// Admin only, and strictly: the switch renders only for `is_admin`, and
// `useRecordingActive` / `isRecordingActive` re-check it on every read, so a
// stale `enabled` left in a shared browser does nothing for a member — and a
// build with no accounts at all (no profile, no admin) never runs it. Per-browser, never cloud-synced,
// untouched by the sign-out wipe — it describes the machine the recording is
// made on, not account data.

const STORAGE_KEY = 'ai-ugc-lab-recording-mode'

export const REPLAY_SECONDS_MIN = 2
export const REPLAY_SECONDS_MAX = 30
const REPLAY_SECONDS_DEFAULT = 6

interface Persisted {
  enabled: boolean
  loop: boolean
  replaySeconds: number
  hiddenBefore: number | null
  /** Revealed key → when it was revealed. A replayed row is dated then, on screen only. */
  revealed: Record<string, number>
}

function load(): Persisted {
  const fallback: Persisted = { enabled: false, loop: false, replaySeconds: REPLAY_SECONDS_DEFAULT, hiddenBefore: null, revealed: {} }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const p = JSON.parse(raw) as Partial<Persisted>
    return {
      enabled: p.enabled === true,
      loop: p.loop === true,
      replaySeconds: clampSeconds(Number(p.replaySeconds)),
      hiddenBefore: typeof p.hiddenBefore === 'number' ? p.hiddenBefore : null,
      revealed: sanitizeRevealed(p.revealed),
    }
  } catch {
    return fallback
  }
}

function sanitizeRevealed(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(value)) if (typeof v === 'number') out[k] = v
  return out
}

function clampSeconds(n: number): number {
  if (!Number.isFinite(n)) return REPLAY_SECONDS_DEFAULT
  return Math.min(REPLAY_SECONDS_MAX, Math.max(REPLAY_SECONDS_MIN, Math.round(n)))
}

interface RecordingState extends Persisted {
  /** When Loop was switched on — the `startedAt` every looping face counts from. */
  loopSince: number
  setEnabled: (enabled: boolean) => void
  setLoop: (loop: boolean) => void
  setReplaySeconds: (seconds: number) => void
  /** Hide every output that exists right now. */
  hideAll: () => void
  /** Bring every hidden output back. */
  showAll: () => void
  reveal: (keys: string[]) => void
}

function persist(s: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      enabled: s.enabled,
      loop: s.loop,
      replaySeconds: s.replaySeconds,
      hiddenBefore: s.hiddenBefore,
      revealed: s.revealed,
    } satisfies Persisted))
  } catch { /* a recording rig that can't persist still works for this tab */ }
}

export const useRecordingStore = create<RecordingState>((set, get) => {
  const update = (patch: Partial<Persisted>) => {
    set(patch)
    persist(get())
  }
  return {
    ...load(),
    loopSince: Date.now(),
    // Switching the mode off also stops the loop and shows everything, so the
    // workspace can never be left half-hidden with no control on screen.
    setEnabled: (enabled) => update(enabled ? { enabled } : { enabled, loop: false, hiddenBefore: null, revealed: {} }),
    setLoop: (loop) => {
      set({ loopSince: Date.now() })
      update({ loop })
    },
    setReplaySeconds: (seconds) => update({ replaySeconds: clampSeconds(seconds) }),
    hideAll: () => update({ hiddenBefore: Date.now(), revealed: {} }),
    showAll: () => update({ hiddenBefore: null, revealed: {} }),
    reveal: (keys) => {
      const now = Date.now()
      const next = { ...get().revealed }
      for (const k of keys) next[k] = now
      update({ revealed: next })
    },
  }
})

/** The mode is on AND the signed-in viewer is an admin. */
export function useRecordingActive(): boolean {
  const enabled = useRecordingStore((s) => s.enabled)
  const isAdmin = useAuthStore((s) => s.profile?.is_admin === true)
  return enabled && isAdmin
}

/** Non-hook twin of `useRecordingActive`, for click handlers and services. */
export function isRecordingActive(): boolean {
  return useRecordingStore.getState().enabled && useAuthStore.getState().profile?.is_admin === true
}

/** When the current loop started, for a looping face's elapsed clock. */
export function useRecordingLoopSince(): number {
  return useRecordingStore((s) => s.loopSince)
}

/** Loop is only ever live inside an active recording. */
export function useRecordingLoop(): boolean {
  const active = useRecordingActive()
  const loop = useRecordingStore((s) => s.loop)
  return active && loop
}

export function toMs(value: string | number | undefined | null): number {
  if (typeof value === 'number') return value
  if (!value) return 0
  const t = Date.parse(value)
  return Number.isFinite(t) ? t : 0
}

export interface ReplayableRow {
  id: string
  createdAt: string | number
}

function isHidden(row: ReplayableRow, prefix: string, hiddenBefore: number, revealed: Record<string, number>): boolean {
  return toMs(row.createdAt) <= hiddenBefore && revealed[`${prefix}:${row.id}`] === undefined
}

/**
 * A history bank as Recording Mode shows it: hidden rows taken out, and a
 * replayed row dated when it was replayed, so it lands at the top under
 * "Today" the way a fresh result does. The re-dated rows are COPIES and live
 * on screen only — nothing here is written back. `prefix` names the app so
 * two banks' ids can't collide in the reveal list. Every input is a stable
 * reference, so the compiler hands back the same array until something
 * actually changes, and a memo'd history rail downstream stays put.
 */
export function useVisibleRows<T extends ReplayableRow>(rows: T[], prefix: string): T[] {
  const active = useRecordingActive()
  const hiddenBefore = useRecordingStore((s) => s.hiddenBefore)
  const revealed = useRecordingStore((s) => s.revealed)
  if (!active || hiddenBefore == null) return rows
  const out: T[] = []
  for (const r of rows) {
    if (isHidden(r, prefix, hiddenBefore, revealed)) continue
    const at = toMs(r.createdAt) <= hiddenBefore ? revealed[`${prefix}:${r.id}`] : undefined
    if (at === undefined) out.push(r)
    else out.push({ ...r, createdAt: typeof r.createdAt === 'number' ? at : new Date(at).toISOString() })
  }
  // A replayed row now carries a newer date than the rows beside it, so the
  // list is re-sorted newest first — the order every history surface reads in.
  return out.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt))
}

/**
 * Reveal the oldest hidden row of this bank right now. Oldest first, so
 * re-performing a session in the order it was made brings its outputs back in
 * that order. Null when nothing is hidden.
 */
export function revealNext<T extends ReplayableRow>(rows: T[], prefix: string): T | null {
  const { hiddenBefore, revealed, reveal } = useRecordingStore.getState()
  if (hiddenBefore == null) return null
  const next = rows
    .filter((r) => isHidden(r, prefix, hiddenBefore, revealed))
    .sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt))[0]
  if (!next) return null
  reveal([`${prefix}:${next.id}`])
  return next
}

/**
 * A fake run: wait out the replay length, then reveal the oldest hidden row.
 * Resolves with that row, or null when nothing is hidden — a replay past the
 * last one is just the animation.
 */
export async function replayRun<T extends ReplayableRow>(opts: {
  /** Read at the END of the wait, so a batch's siblings see each other's reveals. */
  rows: () => T[]
  prefix: string
  /** Extra milliseconds on top of the replay length, to stagger a batch. */
  extraMs?: number
}): Promise<T | null> {
  await replayWait(opts.extraMs)
  return revealNext(opts.rows(), opts.prefix)
}

export function replayWait(extraMs = 0): Promise<void> {
  return wait(useRecordingStore.getState().replaySeconds * 1000 + extraMs)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
