import { useEffect } from 'react'
import { create } from 'zustand'
import { getSupabase, isCloudEnabled, selectAllRows } from '../lib/supabase'
import { QUERY_TIMEOUT_MS, readyAdminSession, withTimeout } from '../apps/admin/adminQuery'
import { useAuthStore } from './authStore'
import type { ErrorKind } from '../utils/errorReport'

// The operator's side of error reporting: the grouped list Admin → Errors
// renders, and the "something new broke" count that dots the dock's Settings
// tile and Settings' Admin row, so a new bug finds the operator rather than
// waiting to be looked for.
//
// A store outside the admin app because the dock and Settings read the count
// on every page, while the Admin app is a lazy chunk nobody else loads. Admin
// only — the view it reads returns nothing to anyone else.

/** One row of the `error_report_groups` view (migration 0027): one bug across
 * every member who hit it. */
export interface ErrorGroup {
  fingerprint: string
  kind: ErrorKind
  message: string
  shown: string | null
  operation: string | null
  app_id: string | null
  build_id: string | null
  members: number
  occurrences: number
  first_seen: string
  last_seen: string
  status: 'resolved' | 'ignored' | null
  status_at: string | null
}

/** Where a group sits in triage. `back` is a resolved bug reported again
 * after it was resolved — the one state worth shouting about. */
export type GroupState = 'open' | 'back' | 'resolved' | 'ignored'

export function groupState(g: Pick<ErrorGroup, 'status' | 'status_at' | 'last_seen'>): GroupState {
  if (g.status === 'ignored') return 'ignored'
  if (g.status === 'resolved') {
    return g.status_at && Date.parse(g.last_seen) > Date.parse(g.status_at) ? 'back' : 'resolved'
  }
  return 'open'
}

/** Needs looking at: open, or resolved and back again. */
export function needsAttention(g: ErrorGroup): boolean {
  const state = groupState(g)
  return state === 'open' || state === 'back'
}

// How long a loaded list counts as fresh — the same window the member
// directory uses, so flipping between admin tabs doesn't refire the query.
const STALE_AFTER_MS = 60_000
// The background check: shortly after the workspace opens, then on this
// interval while the tab is visible.
const WATCH_FIRST_MS = 6_000
const WATCH_EVERY_MS = 10 * 60_000

function seenKey(userId: string): string {
  return `ugc-lab:errors-seen-at:${userId}`
}

function readSeenAt(userId: string): number {
  try {
    return Number(localStorage.getItem(seenKey(userId))) || 0
  } catch {
    return 0
  }
}

type GroupRow = Omit<ErrorGroup, 'members' | 'occurrences'> & { members: number | string; occurrences: number | string }

interface ErrorInboxState {
  groups: ErrorGroup[]
  loadedAt: number | null
  loadedForUser: string | null
  loading: boolean
  refreshing: boolean
  error: string | null
  // When this admin last looked at Admin → Errors in this browser (epoch ms).
  // Anything needing attention that was reported after it is "new", and
  // that's what dots the dock.
  seenAt: number
  // What `seenAt` was when the tab was last opened: the rows reported after
  // it keep their "New" marker for the whole visit, even though opening the
  // tab has already cleared the dock's dot.
  highlightSince: number
  load: (opts: { userId: string; force?: boolean }) => Promise<void>
  // Admin → Errors was opened: remember the old line for highlighting, move
  // the seen line to now, refresh.
  openInbox: (userId: string) => void
  // The tab is open and the list just changed: everything on screen is seen.
  touchSeen: (userId: string) => void
  setStatus: (fingerprint: string, status: 'resolved' | 'ignored' | null) => Promise<void>
}

let inflight: Promise<void> | null = null

export const useErrorInboxStore = create<ErrorInboxState>((set, get) => ({
  groups: [],
  loadedAt: null,
  loadedForUser: null,
  loading: true,
  refreshing: false,
  error: null,
  seenAt: 0,
  highlightSince: 0,

  load: async ({ userId, force = false }) => {
    if (inflight) return inflight
    const { loadedAt, loadedForUser } = get()
    // The store outlives a sign-out; the next admin must not see this one's list.
    if (loadedForUser !== userId) {
      const seenAt = readSeenAt(userId)
      set({ groups: [], loadedAt: null, loadedForUser: userId, loading: true, seenAt, highlightSince: seenAt })
    } else if (!force && loadedAt !== null && Date.now() - loadedAt < STALE_AFTER_MS) {
      set({ loading: false })
      return
    }

    inflight = (async () => {
      set({ refreshing: true, error: null })
      try {
        await readyAdminSession()
        const sb = getSupabase()
        // Paged like every whole-table read: one row per distinct bug grows
        // slowly, but a truncated read would hide the newest ones.
        const res = await withTimeout(
          (signal) => selectAllRows<GroupRow>((from, to) => sb.from('error_report_groups')
            .select('fingerprint, kind, message, shown, operation, app_id, build_id, members, occurrences, first_seen, last_seen, status, status_at', { count: 'exact' })
            .order('last_seen', { ascending: false })
            .range(from, to)
            .abortSignal(signal)),
          QUERY_TIMEOUT_MS,
          'error reports',
        )
        if (res.error) throw new Error(res.error.message)
        // Signed out or switched account while this was in flight.
        if (get().loadedForUser !== userId) return
        set({
          // Postgres bigints arrive as strings through PostgREST.
          groups: res.data.map((g) => ({ ...g, members: Number(g.members), occurrences: Number(g.occurrences) })),
          loadedAt: Date.now(),
        })
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        set({
          error: /error_report_groups|relation .* does not exist|42P01|PGRST205/i.test(message)
            ? 'Error reports are not set up yet. Run supabase/migrations/0027_error_reports.sql.'
            : message,
        })
      } finally {
        set({ loading: false, refreshing: false })
      }
    })()
    try {
      await inflight
    } finally {
      inflight = null
    }
  },

  openInbox: (userId) => {
    const { load, loadedForUser, seenAt } = get()
    // A first visit for this account reads its line from storage in `load`.
    const since = loadedForUser === userId ? seenAt : readSeenAt(userId)
    void load({ userId }).then(() => get().touchSeen(userId))
    set({ highlightSince: since })
  },

  touchSeen: (userId) => {
    if (get().loadedForUser !== userId) return
    // The newest report on screen, not just this browser's clock: `last_seen`
    // is the server's time, and a laptop running a few minutes slow would
    // otherwise leave the dock dotted for a bug the admin is looking at.
    const newest = get().groups.reduce((max, g) => Math.max(max, Date.parse(g.last_seen) || 0), 0)
    const at = Math.max(Date.now(), newest)
    try { localStorage.setItem(seenKey(userId), String(at)) } catch { /* the dot comes back next load */ }
    set({ seenAt: at })
  },

  setStatus: async (fingerprint, status) => {
    await readyAdminSession()
    const sb = getSupabase()
    let statusAt: string | null = null
    if (status === null) {
      const res = await withTimeout(
        (signal) => sb.from('error_report_status').delete().eq('fingerprint', fingerprint).abortSignal(signal),
        QUERY_TIMEOUT_MS,
        'reopen',
      )
      if (res.error) throw new Error(res.error.message)
    } else {
      const res = await withTimeout(
        (signal) => sb.from('error_report_status')
          .upsert({ fingerprint, status, updated_by: useAuthStore.getState().user?.id ?? null })
          // The server stamps updated_at (a trigger), so read its value back
          // rather than trusting this browser's clock — see migration 0027.
          .select('updated_at')
          .abortSignal(signal)
          .single<{ updated_at: string }>(),
        QUERY_TIMEOUT_MS,
        status === 'resolved' ? 'resolve' : 'ignore',
      )
      if (res.error) throw new Error(res.error.message)
      statusAt = res.data?.updated_at ?? new Date().toISOString()
    }
    set((s) => ({
      groups: s.groups.map((g) => (g.fingerprint === fingerprint ? { ...g, status, status_at: statusAt } : g)),
    }))
  },
}))

/** Groups needing attention that were reported since this admin last looked. */
export function useNewErrorCount(): number {
  const groups = useErrorInboxStore((s) => s.groups)
  const seenAt = useErrorInboxStore((s) => s.seenAt)
  const isAdmin = useAuthStore((s) => s.profile?.is_admin === true)
  if (!isAdmin) return 0
  return groups.filter((g) => needsAttention(g) && Date.parse(g.last_seen) > seenAt).length
}

/**
 * Keep the count current for an admin: a first check shortly after the
 * workspace opens (clear of the boot path), then every WATCH_EVERY_MS while
 * the tab is visible, and on coming back to a tab that has missed a check.
 * Does nothing for a member.
 */
export function useErrorInboxWatch(): void {
  const isAdmin = useAuthStore((s) => s.profile?.is_admin === true)
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const load = useErrorInboxStore((s) => s.load)

  useEffect(() => {
    if (!isAdmin || !userId || !isCloudEnabled()) return
    const check = () => { void load({ userId }) }
    const first = setTimeout(check, WATCH_FIRST_MS)
    const every = setInterval(() => {
      if (document.visibilityState === 'visible') check()
    }, WATCH_EVERY_MS)
    const onVisible = () => {
      const { loadedAt } = useErrorInboxStore.getState()
      if (document.visibilityState === 'visible' && (loadedAt === null || Date.now() - loadedAt > WATCH_EVERY_MS)) check()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(first)
      clearInterval(every)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [isAdmin, userId, load])
}
