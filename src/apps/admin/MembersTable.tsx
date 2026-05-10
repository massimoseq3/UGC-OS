import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, Ban, CheckCircle2, AlertTriangle } from 'lucide-react'
import { getSupabase } from '../../lib/supabase'

interface MemberRow {
  id: string
  email: string
  display_name: string | null
  is_admin: boolean
  disabled_at: string | null
  created_at: string
  last_active_at: string | null
  total_bytes: number
  asset_count: number
}

const QUERY_TIMEOUT_MS = 15_000

function formatBytes(n: number): string {
  if (!n) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// Reject the wrapped promise after `ms` so a stalled Supabase query can't
// hold the spinner open forever — the user sees a real error instead.
function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
    Promise.resolve(p).then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}

export default function MembersTable() {
  const [rows, setRows] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [profilesError, setProfilesError] = useState<string | null>(null)
  const [storageWarning, setStorageWarning] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [slowHint, setSlowHint] = useState(false)

  async function load() {
    setLoading(true)
    setProfilesError(null)
    setStorageWarning(null)
    setSlowHint(false)
    const slowTimer = setTimeout(() => setSlowHint(true), 3000)

    try {
      const sb = getSupabase()
      // Independent settled loads. If member_storage stalls or RLS blocks it,
      // we still render profiles with zeroed storage stats instead of hanging.
      const [profilesRes, storageRes] = await Promise.allSettled([
        withTimeout(
          sb.from('profiles').select('id, email, display_name, is_admin, disabled_at, created_at, last_active_at').order('created_at', { ascending: false }),
          QUERY_TIMEOUT_MS,
          'profiles query',
        ),
        withTimeout(
          sb.from('member_storage').select('user_id, total_bytes, asset_count'),
          QUERY_TIMEOUT_MS,
          'storage view',
        ),
      ])

      if (profilesRes.status === 'rejected') {
        setProfilesError(profilesRes.reason instanceof Error ? profilesRes.reason.message : String(profilesRes.reason))
        return
      }
      if ((profilesRes.value as { error: unknown }).error) {
        const err = (profilesRes.value as { error: { message: string } }).error
        setProfilesError(err.message)
        return
      }

      const storageMap = new Map<string, { total_bytes: number; asset_count: number }>()
      if (storageRes.status === 'fulfilled' && !(storageRes.value as { error: unknown }).error) {
        const data = (storageRes.value as { data: Array<{ user_id: string; total_bytes: number; asset_count: number }> }).data ?? []
        for (const s of data) {
          storageMap.set(s.user_id, { total_bytes: Number(s.total_bytes), asset_count: Number(s.asset_count) })
        }
      } else {
        const reason = storageRes.status === 'rejected'
          ? (storageRes.reason instanceof Error ? storageRes.reason.message : String(storageRes.reason))
          : ((storageRes.value as { error?: { message: string } }).error?.message ?? 'unknown error')
        setStorageWarning(`Storage stats unavailable (${reason}). Showing 0 B for all members.`)
      }

      const profilesData = (profilesRes.value as { data: Array<Omit<MemberRow, 'total_bytes' | 'asset_count'>> }).data ?? []
      const merged: MemberRow[] = profilesData.map((p) => ({
        ...p,
        total_bytes: storageMap.get(p.id)?.total_bytes ?? 0,
        asset_count: storageMap.get(p.id)?.asset_count ?? 0,
      }))
      setRows(merged)
    } catch (e) {
      setProfilesError(e instanceof Error ? e.message : String(e))
    } finally {
      clearTimeout(slowTimer)
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function toggleDisabled(row: MemberRow) {
    setBusyId(row.id)
    try {
      const sb = getSupabase()
      const next = row.disabled_at ? null : new Date().toISOString()
      const { error } = await withTimeout(
        sb.from('profiles').update({ disabled_at: next }).eq('id', row.id),
        QUERY_TIMEOUT_MS,
        'profile update',
      ) as { error: { message: string } | null }
      if (error) throw error
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-2 text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        {slowHint && <span className="text-[11px]">Still loading… retrying via timeout if it stalls.</span>}
      </div>
    )
  }

  if (profilesError) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-[12px] text-red-300">
          {profilesError}
        </div>
        <button onClick={load} className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300 transition-colors hover:bg-white/[0.05]">
          <RefreshCw className="h-3 w-3" /> Try again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[13px] text-zinc-400">{rows.length} members</div>
        <button onClick={load} className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300 transition-colors hover:bg-white/[0.05]">
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      {storageWarning && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-200">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{storageWarning}</span>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-white/10">
        <table className="w-full text-[12px]">
          <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Email</th>
              <th className="px-3 py-2 text-left font-medium">Joined</th>
              <th className="px-3 py-2 text-left font-medium">Storage</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((r) => (
              <tr key={r.id} className="text-zinc-300">
                <td className="px-3 py-2">
                  <div className="font-medium text-zinc-200">{r.email}</div>
                  {r.is_admin && <div className="text-[10px] uppercase tracking-wider text-amber-400">Admin</div>}
                </td>
                <td className="px-3 py-2 text-zinc-400">{formatDate(r.created_at)}</td>
                <td className="px-3 py-2 text-zinc-400">{formatBytes(r.total_bytes)} <span className="text-zinc-600">({r.asset_count})</span></td>
                <td className="px-3 py-2">
                  {r.disabled_at ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] text-red-300"><Ban className="h-2.5 w-2.5" /> Disabled</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300"><CheckCircle2 className="h-2.5 w-2.5" /> Active</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => toggleDisabled(r)}
                    disabled={busyId === r.id || r.is_admin}
                    className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:bg-white/[0.05] disabled:opacity-40"
                  >
                    {r.disabled_at ? 'Re-enable' : 'Disable'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
