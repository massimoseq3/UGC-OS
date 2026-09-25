// Hard-deleting a member — the two-step sequence behind Admin → Members →
// Delete. Disabling locks an account; this removes it.
//
//   1. /api/r2-delete-user  purges every R2 object under auth/<userId>/
//   2. admin_delete_member() RPC deletes the auth.users row, which cascades
//      every bank row, asset row, usage_days row and the profile itself
//
// R2 goes first on purpose: once the Postgres rows are gone nothing points at
// those objects any more, so a failure there would leave binaries nobody can
// find. It is still best-effort — a member with no storage, or a deploy with no
// R2 env, must not be undeletable — so a failure comes back as a warning
// alongside a completed delete rather than aborting it.

import { getSupabase, ensureFreshSession } from '../../lib/supabase'
import { readyAdminSession, withTimeout } from './adminQuery'

// Each /api/r2-delete-user call works to its own time budget and reports
// done:false if objects remain. Bounded so a pathological library can't spin.
const MAX_R2_PASSES = 10

// A pass is capped at ~18s server-side and the RPC cascades a whole account,
// so both get more room than a plain read. The modal locks Cancel and Escape
// while it runs — without a deadline one stalled request held it there until
// the page was reloaded.
const PASS_TIMEOUT_MS = 30_000
const DELETE_TIMEOUT_MS = 30_000

export interface DeleteMemberResult {
  email: string
  // Non-null when the account is gone but some R2 objects survived it.
  storageWarning: string | null
}

async function purgeR2(userId: string): Promise<string | null> {
  const token = await ensureFreshSession()
  if (!token) return 'Not signed in. R2 objects were left in place.'

  let totalFailed = 0
  let lastError: string | null = null

  for (let pass = 0; pass < MAX_R2_PASSES; pass++) {
    // Best-effort all the way down: a network error or a stalled pass is a
    // warning beside a completed delete, never a reason to abort it. The body
    // is read inside the deadline too — fetch() settles at the headers.
    let reply: { ok: boolean; status: number; statusText: string; text: string }
    try {
      reply = await withTimeout(
        async (signal) => {
          const res = await fetch('/api/r2-delete-user', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
            body: JSON.stringify({ userId }),
            signal,
          })
          return { ok: res.ok, status: res.status, statusText: res.statusText, text: await res.text() }
        },
        PASS_TIMEOUT_MS,
        'Storage purge',
      )
    } catch (e) {
      return `Storage purge failed: ${e instanceof Error ? e.message : String(e)}. R2 objects may remain.`
    }
    if (!reply.ok) {
      let msg = reply.text || reply.statusText
      try {
        const parsed = JSON.parse(reply.text) as { error?: string }
        if (parsed.error) msg = parsed.error
      } catch { /* not JSON — keep the raw text */ }
      return `Storage purge failed (${reply.status}): ${msg}`
    }
    let body: { deleted: number; failed: number; done: boolean; error?: string }
    try {
      body = JSON.parse(reply.text) as typeof body
    } catch {
      return 'Storage purge returned an unreadable reply. R2 objects may remain.'
    }
    totalFailed += body.failed
    if (body.error) lastError = body.error
    if (body.done) {
      return totalFailed > 0
        ? `${totalFailed} storage object${totalFailed === 1 ? '' : 's'} could not be deleted (${lastError ?? 'unknown error'}).`
        : null
    }
  }

  return 'Storage purge did not finish. Some objects may remain in R2.'
}

export async function deleteMember(
  userId: string,
  opts: { removeFromAllowlist: boolean },
): Promise<DeleteMemberResult> {
  const storageWarning = await purgeR2(userId)

  await readyAdminSession()
  const sb = getSupabase()
  const { data, error } = await withTimeout(
    (signal) => sb.rpc('admin_delete_member', {
      target_id: userId,
      remove_from_allowlist: opts.removeFromAllowlist,
    }).abortSignal(signal),
    DELETE_TIMEOUT_MS,
    'Delete member',
  )
  if (error) {
    // A missing function is the one failure worth translating — it means the
    // migration hasn't been run against this project yet.
    if (/admin_delete_member/.test(error.message) && /(does not exist|not find)/i.test(error.message)) {
      throw new Error('Deletion is not set up on this project yet. Run migration 0018_admin_delete_member.sql.')
    }
    throw new Error(error.message)
  }

  return { email: typeof data === 'string' ? data : '', storageWarning }
}
